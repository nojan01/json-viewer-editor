/* Atomic, cooperative transformations. The source is never mutated. */
(function(root) {
    'use strict';
    const work = typeof module !== 'undefined' ? require('./workspace-core.js') : root.WorkspaceCore;
    const operations = ['rename','delete','convert','trim','replace','merge','split','flatten','unflatten'];
    const own = (v,k) => Object.hasOwn(v,k);
    const put = (v,k,x) => Object.defineProperty(v,k,{value:x,writable:true,enumerable:true,configurable:true});
    function steps(value) {
        if (!Array.isArray(value) || !value.length || value.length > 50) throw new Error('Bitte 1 bis 50 Schritte anlegen.');
        return value.map(s=>{
            if (!s || !operations.includes(s.op)) throw new Error('Unbekannte Operation');
            const clean={op:s.op};
            for(const key of ['field','target','value','separator','arrays','type']) clean[key]=typeof s[key]==='string'?s[key]:'';
            if(Object.values(clean).some(v=>v.length>1000)) throw new Error('Ein Parameter ist zu lang (max. 1000 Zeichen).');
            if(['flatten','unflatten'].includes(clean.op)) {
                if(!['.','_','/'].includes(clean.separator)) throw new Error('Ungültiges Trennzeichen');
                if(!['preserve','indices'].includes(clean.arrays)) clean.arrays='preserve';
            } else {
                if(!clean.field.trim()) throw new Error('Bitte ein Quellfeld angeben.');
                if(['rename','merge','split'].includes(clean.op) && !clean.target.trim()) throw new Error('Bitte Zielfeld(er) angeben.');
                if(clean.op==='convert'&&!['string','number','boolean','null'].includes(clean.type)) throw new Error('Ungültiger Zieltyp');
                if(clean.op==='replace'&&!clean.value) throw new Error('Suchtext darf nicht leer sein.');
                if(clean.op==='split'&&!clean.separator) throw new Error('Trennzeichen darf nicht leer sein.');
                if(clean.op==='merge' && clean.field.split(',').some(k=>!k.trim()))throw new Error('Quellfelder dürfen nicht leer sein.');
                if(clean.op==='split') {
                    const names=clean.target.split(',').map(k=>k.trim());
                    if(names.some(k=>!k)||new Set(names).size!==names.length) throw new Error('Zielfelder müssen eindeutig und nicht leer sein.');
                }
            }
            return clean;
        });
    }
    function profiles(value) {
        if(!Array.isArray(value)) return [];
        const result=[];
        for(const entry of value.slice(0,50)) try {
            if(typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>80||result.some(p=>p.name===entry.name.trim())) continue;
            result.push({name:entry.name.trim(),steps:steps(entry.steps)});
        } catch {}
        return result;
    }
    async function consume(iterator, options) {
        let until=performance.now()+8;
        for(;;) {
            if(options.cancelled?.()) throw new Error('Transformation abgebrochen');
            const step=iterator.next();if(step.done)return step.value;
            if(performance.now()>=until) {
                options.progress?.();await new Promise(resolve=>setTimeout(resolve,0));until=performance.now()+8;
            }
        }
    }
    function* copy(value,depth=0) {
        yield;
        if(value===null||typeof value!=='object')return value;
        if(depth>200)throw new Error('Maximale Transformationstiefe (200) überschritten.');
        const out=Array.isArray(value)?[]:{};
        for(const key in value)if(own(value,key))put(out,key,yield* copy(value[key],depth+1));
        return out;
    }
    function scalar(v) {return v===null||['string','number','boolean'].includes(typeof v);}
    function convert(v,type) {
        if(type==='null')return null;
        if(!scalar(v))throw new Error('Objekte und Arrays können nicht in einen skalaren Typ konvertiert werden.');
        if(type==='string')return String(v);
        if(type==='number') {
            if(typeof v==='number')return v;
            if(typeof v==='string'&&v.trim()&&Number.isFinite(Number(v)))return Number(v);
        }
        if(type==='boolean') {
            if(typeof v==='boolean')return v;
            if(v===1||v==='true')return true;if(v===0||v==='false')return false;
        }
        throw new Error('Wert kann nicht eindeutig in '+type+' konvertiert werden.');
    }
    function* edit(node,s,depth=0) {
        yield;
        if(node===null||typeof node!=='object')return;
        if(depth>200)throw new Error('Maximale Transformationstiefe (200) überschritten.');
        // Children first: newly created fields aren't processed repeatedly by this step.
        for(const key in node)if(own(node,key))yield* edit(node[key],s,depth+1);
        if(Array.isArray(node))return;
        const destination=(key,value)=>{
            if(own(node,key))throw new Error('Zielfeld existiert bereits: '+key);
            put(node,key,value);
        };
        if(s.op==='merge') {
            const names=s.field.split(',').map(k=>k.trim());
            if(!names.every(k=>own(node,k)))return;
            if(!names.every(k=>scalar(node[k])))throw new Error('Zusammenführen benötigt skalare Werte.');
            destination(s.target,names.map(k=>node[k]===null?'':String(node[k])).join(s.separator));return;
        }
        if(!own(node,s.field))return;
        const value=node[s.field];
        if(s.op==='rename') {if(s.field!==s.target){destination(s.target,value);delete node[s.field];}}
        else if(s.op==='delete')delete node[s.field];
        else if(s.op==='convert')put(node,s.field,convert(value,s.type));
        else if(['trim','replace','split'].includes(s.op)) {
            if(typeof value!=='string')throw new Error('Textoperation benötigt einen String: '+s.field);
            if(s.op==='trim')put(node,s.field,value.trim());
            if(s.op==='replace')put(node,s.field,value.split(s.value).join(s.target));
            if(s.op==='split') {
                const names=s.target.split(',').map(k=>k.trim()), values=value.split(s.separator);
                if(names.length!==values.length)throw new Error('Anzahl der Teile passt nicht zu den Zielfeldern: '+s.field);
                names.forEach((key,i)=>destination(key,values[i]));
            }
        }
    }
    async function unflatten(data,s,options) {
        function* one(value) {
            if(value===null||typeof value!=='object'||Array.isArray(value))return value;
            const output={}, leaves=new WeakSet();
            for(const path in value)if(own(value,path)) {
                yield;
                const tokens=work.parseFlatPath(path,s.separator);
                if(tokens.length>200)throw new Error('Maximale Transformationstiefe (200) überschritten.');
                let current=output;
                for(let i=0;i<tokens.length;i++) {
                    yield;
                    const token=tokens[i],key=token.value,last=i===tokens.length-1;
                    if(token.type==='index'&&!Array.isArray(current))throw new Error('Pfadkonflikt: '+path);
                    if(last) {
                        if(own(current,key))throw new Error('Pfadkonflikt: '+path);
                        put(current,key,value[path]);
                        if(value[path] && typeof value[path]==='object')leaves.add(value[path]);
                    } else {
                        const array=tokens[i+1].type==='index';
                        if(!own(current,key))put(current,key,array?[]:{});
                        else if(current[key]===null||typeof current[key]!=='object'||Array.isArray(current[key])!==array||leaves.has(current[key]))throw new Error('Pfadkonflikt: '+path);
                        current=current[key];
                    }
                }
            }
            return output;
        }
        function* run() {
            if(!Array.isArray(data))return yield* one(data);
            const output=[];for(const value of data)output.push(yield* one(value));return output;
        }
        return consume(run(),options);
    }
    async function run(source,rawSteps,options={}) {
        const plan=steps(rawSteps);
        let current=await consume(copy(source),options);
        for(let i=0;i<plan.length;i++) {
            options.step?.(i+1,plan.length);
            const s=plan[i];
            try {
                if(s.op==='flatten') current=await work.flattenDataAsync(current,s,{...options,indexKeys:()=>{}});
                else if(s.op==='unflatten')current=await unflatten(current,s,options);
                else await consume(edit(current,s),options);
            } catch(error) {throw new Error('Schritt '+(i+1)+': '+error.message);}
        }
        function* index(value) {
            yield;
            if(value===null||typeof value!=='object')return;
            const keys=Array.isArray(value)?null:[];
            for(const key in value)if(own(value,key)){if(keys)keys.push(key);yield* index(value[key]);}
            if(keys && keys.length>1000)options.indexKeys?.(value,keys);
        }
        if(options.indexKeys)await consume(index(current),options);
        if(options.cancelled?.())throw new Error('Transformation abgebrochen');
        return current;
    }
    const api={steps,profiles,run};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineCore=api;
})(globalThis);

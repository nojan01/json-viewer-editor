const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../web/workspace-core.js');
const html = fs.readFileSync(require.resolve('../web/index.html'), 'utf8');
const workspaceScript = fs.readFileSync(require.resolve('../web/workspace.js'), 'utf8');

test('update button is in the top toolbar beside Help', () => {
    const toolbar = html.slice(html.indexOf('<div class="toolbar">'), html.indexOf('<div class="search-bar">'));
    assert.match(toolbar, /id="btnHelp"[\s\S]*id="btnCheckUpdates"/);
    assert.match(toolbar, /id="btnCheckUpdates"[\s\S]*<span class="icon">⟳<\/span>[\s\S]*<span>Update<\/span>/);
    assert.doesNotMatch(workspaceScript.match(/workspaceBar\.innerHTML\s*=\s*[^;]+/)?.[0] || '', /btnCheckUpdates/);
});
const {createManifest} = require('../scripts/create-updater-manifest.cjs');
const script = fs.readFileSync(require.resolve('../web/workspace.js'),'utf8');
function source(name) {
    const start = script.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
    assert.ok(start >= 0,name);
    return script.slice(start,script.indexOf('\n}',start)+2);
}
function sandbox(names, extras) {
    const ctx = vm.createContext({...extras}); vm.runInContext(names.map(source).join('\n'),ctx); return ctx;
}
function startupSandbox(invoke) {
    const loaded = [], activated = [];
    const ctx = sandbox(['initializeWorkspace'], {
        window: {__TAURI__: {core: {invoke}}},
        explicitOpenRequested: false, documentBusy: false, documents: [], nextDocumentId: 1,
        workspaceRestoring: false,
        loadFileFromPath: async path => { loaded.push(path); },
        readPreference: () => ({tabs: [{path: 'old-large.json'}], active: 'old-large.json'}),
        getFileName: path => path, WorkspaceCore: core,
        activateDocument: async id => { activated.push(id); }, renderDocumentTabs: () => {}
    });
    return {ctx, loaded, activated};
}
test('startup launch path wins over the saved large file, including a slow lookup', async () => {
    let resolve;
    const {ctx, loaded, activated} = startupSandbox(() => new Promise(r => { resolve = r; }));
    const pending = ctx.initializeWorkspace();
    assert.equal(ctx.documents.length, 0);
    resolve('new-500mb.json'); await pending;
    assert.deepEqual(loaded, ['new-500mb.json']);
    assert.deepEqual(activated, []); assert.equal(ctx.documents.length, 0);
});
test('an explicit open during startup lookup suppresses restoration even after load failure', async () => {
    let resolve;
    const {ctx, activated} = startupSandbox(() => new Promise(r => { resolve = r; }));
    const pending = ctx.initializeWorkspace();
    ctx.explicitOpenRequested = true;
    resolve(null); await pending;
    assert.deepEqual(activated, []); assert.equal(ctx.documents.length, 0);
});
test('normal startup still restores the saved active tab', async () => {
    const {ctx, loaded, activated} = startupSandbox(async () => null);
    await ctx.initializeWorkspace();
    assert.deepEqual(loaded, []); assert.deepEqual(activated, [1]);
    assert.equal(ctx.documents[0].path, 'old-large.json');
    assert.equal(ctx.workspaceRestoring, false);
});
test('path and browser open requests are recorded before queued IO begins', async () => {
    const queued = [];
    const ctx = vm.createContext({explicitOpenRequested:false, loadFileFromPath:()=>{}, loadFile:()=>{},
        queueDocumentOperation: op => { queued.push(op); }});
    vm.runInContext(script.slice(script.indexOf('const originalPathLoader ='),script.indexOf('const originalSaveFile =')),ctx);
    ctx.loadFileFromPath('large.json');
    assert.equal(ctx.explicitOpenRequested,true); assert.equal(queued.length,1);
    ctx.explicitOpenRequested=false; ctx.loadFile({name:'large.json'});
    assert.equal(ctx.explicitOpenRequested,true); assert.equal(queued.length,2);
});
test('all new browser scripts parse', () => {
    new vm.Script(script);
    new vm.Script(fs.readFileSync(require.resolve('../web/workspace-core.js'),'utf8'));
});
test('column filters combine, preserve number types and distinguish null, empty and missing', () => {
    const rows = [{id:1,status:'aktiv',price:150},{id:2,status:'inaktiv',price:200},{id:3,status:'aktiv',price:'300'},{id:4,status:'aktiv',price:50}];
    assert.deepEqual(core.filterRows(rows,[{column:'status',op:'eq',value:'aktiv'},{column:'price',op:'gt',value:'100'}]).map(r=>r.id),[1]);
    assert.equal(core.matchesFilter('true',{op:'eq',value:'true'}),false);
    assert.equal(core.matchesFilter(true,{op:'eq',value:'true'}),true);
    assert.equal(core.matchesFilter('true',{op:'eq',value:'"true"'}),true);
    assert.equal(core.matchesFilter(3,{op:'gt',value:'abc'}),false);
    assert.equal(core.matchesFilter(null,{op:'missing'}),false);
    assert.equal(core.matchesFilter(undefined,{op:'missing'}),true);
    assert.equal(core.matchesFilter(0,{op:'empty'}),false);
    assert.equal(core.filterRows([{}],[{column:'__proto__',op:'missing'}]).length,1);
});
test('masking visits all records and preserves the source with arbitrary field names', () => {
    const data = JSON.parse('{"":"empty-secret","__proto__":"proto-secret","a.b":"dot-secret","nested":[{"token":"secret1"},{"token":{"deep":"secret2"},"keep":false}],"keep":0}');
    const original = JSON.stringify(data);
    const result = core.serializeMasked(data,['','__proto__','a.b','token'],'🦀');
    assert.equal(result.count,5);
    assert.equal(result.text.includes('secret'),false);
    assert.equal(JSON.stringify(data),original);
    assert.equal(JSON.parse(result.text).keep,0);
    assert.equal(JSON.parse(result.text).nested[1].keep,false);
    const rows = Array.from({length:101},(_,id)=>({id,email:'secret'}));
    assert.equal(core.serializeMasked(rows,['email']).count,101);
    for (const value of [null,false,0,'text']) assert.deepEqual(JSON.parse(core.serializeMasked(value,['']).text),value);
    assert.ok(core.fieldNames(data).includes('__proto__'));
});
test('restored view preferences reject invalid scroll positions and contain no document values', () => {
    assert.equal(core.safeView({scrollTop:-1}).scrollTop,0);
    assert.equal(core.safeView({scrollTop:Infinity}).scrollTop,0);
    assert.equal(core.safeView({depth:'2'}).depth,null);
    const view = core.safeView({scrollTop:123,expanded:['root'],data:'secret',selectedPath:'root[0]'});
    assert.equal(view.scrollTop,123); assert.equal('data' in view,false);
});
test('saved views are sanitized and map only compatible columns onto the next file', () => {
    const views = core.safeSavedViews([{name:' Server ',columns:['id','host'],hidden:['host'],pinned:['id'],rules:[{column:'host',op:'contains',value:'prod'}],filter:'active',jsonPath:'$.servers[*]',sortColumn:'id',sortAscending:false,tree:{expanded:['root','root.servers'],collapsed:['root.servers[2]'],expandAllMode:true,expandDepth:3,level:3,lineNumbers:true,minimap:true,indentGuides:false}},{name:' Server ',columns:[]}]);
    assert.equal(views.length,1); assert.equal(views[0].name,'Server');
    const applied = core.applySavedView(views[0],['host','id','region']);
    assert.deepEqual(applied.columns,['id','host','region']); assert.deepEqual(applied.hidden,['host']);
    assert.deepEqual(applied.pinned,['id']); assert.equal(applied.rules.length,1);
    assert.equal(applied.sortColumn,'id'); assert.equal(applied.sortAscending,false);
    assert.deepEqual(views[0].tree,{expanded:['root','root.servers'],collapsed:['root.servers[2]'],expandAllMode:true,expandDepth:3,level:3,lineNumbers:true,minimap:true,indentGuides:false});
    assert.equal(core.safeSavedViews({}).length,0);
});
test('keyed comparison ignores order and selected fields while preserving typed keys', () => {
    const left=[{id:1,host:'a',updatedAt:'old',settings:{port:80}},{id:2,host:'b'}];
    const right=[{id:2,host:'b'},{id:1,host:'renamed',updatedAt:'new',settings:{port:443}},{id:'2',host:'string key'}];
    const result=core.keyedCompare(left,right,'id',['updatedAt']);
    assert.equal(result.duplicates.length,0); assert.deepEqual(result.missing,{left:[],right:[]});
    const numeric=result.records.find(record=>record.key===1);
    assert.equal(numeric.status,'changed'); assert.deepEqual(numeric.changes.map(change=>change.path),['host','settings.port']);
    assert.equal(result.records.find(record=>record.key===2).status,'unchanged');
    assert.equal(result.records.find(record=>record.key==='2').status,'added');
});
test('keyed comparison reports missing and duplicate keys and locates nested record arrays', () => {
    const located=core.findRecordArray({payload:{items:[{hostname:'a'}]}});
    assert.deepEqual(located.path,['payload','items']); assert.equal(located.rows[0].hostname,'a');
    assert.ok(core.comparisonFields([{node:{hostname:'a'},id:1}]).includes('node.hostname'));
    const result=core.keyedCompare([{id:1},{id:1},{}],[{id:1},{}],'id',[]);
    assert.deepEqual(result.duplicates,[1]); assert.deepEqual(result.missing,{left:[2],right:[1]});
});
test('flatten and unflatten preserve nested values, special keys and root record arrays', () => {
    const source = [{id:1,user:{name:'Anna','a.b':'literal','[0]':'brackets','':'empty key'},items:[{sku:'A'},{sku:'B'}],empty:{}},{id:2,user:{name:'Bob'},items:[]}];
    Object.defineProperty(source[0].user,'__proto__',{value:'safe',enumerable:true,writable:true,configurable:true});
    const original = JSON.stringify(source);
    const flat = core.flattenData(source,{separator:'.',arrays:'indices'});
    assert.equal(flat[0]['user.name'],'Anna');
    assert.equal(flat[0]['user.a\\.b'],'literal');
    assert.equal(flat[0]['user.\\[0\\]'],'brackets');
    assert.equal(flat[0]['user.\\e'],'empty key');
    assert.equal(flat[0]['user.__proto__'],'safe');
    assert.equal(flat[0]['items[0].sku'],'A');
    assert.deepEqual(flat[1].items,[]);
    assert.equal(JSON.stringify(source),original);
    assert.deepEqual(core.unflattenData(flat,{separator:'.',arrays:'indices'}),source);
});
test('flatten can preserve nested arrays and unflatten rejects contradictory paths', () => {
    const source={meta:{active:true},rows:[{id:1}],nothing:null};
    const flat=core.flattenData(source,{separator:'/',arrays:'preserve'});
    assert.deepEqual(flat,{'meta/active':true,rows:[{id:1}],nothing:null});
    assert.deepEqual(core.unflattenData(flat,{separator:'/',arrays:'preserve'}),source);
    assert.throws(()=>core.unflattenData({a:1,'a.b':2},{separator:'.'}),/Pfadkonflikt/);
    assert.throws(()=>core.flattenData(source,{separator:'::'}),/Trennzeichen/);
    const underscore=core.flattenData({'a_b':1,a:{b:2}},{separator:'_',arrays:'preserve'});
    assert.deepEqual(underscore,{'a\\_b':1,a_b:2});
    assert.deepEqual(core.unflattenData(underscore,{separator:'_',arrays:'preserve'}),{'a_b':1,a:{b:2}});
    assert.equal(core.flattenData(null),null);
});
test('transform controls exist and Linux themes every select control', () => {
    assert.match(html,/id="btnTransform"/); assert.match(html,/id="transformModal"/);
    const css=fs.readFileSync(require.resolve('../web/workspace.css'),'utf8');
    assert.match(css,/:root\.platform-linux select\s*\{/);
    assert.doesNotMatch(css,/:root\.platform-linux \.workspace-bar select,\s*:root\.platform-linux \.column-panel select/);
});
test('document operations are serialized and failures release the UI lock', async () => {
    const doc = {body:{inert:false},activeElement:{blur(){}}}, order=[];
    const ctx = sandbox(['queueDocumentOperation'],{document:doc,documentBusy:false,operationQueue:Promise.resolve()});
    const first = ctx.queueDocumentOperation(async()=>{ order.push(1); await Promise.resolve(); throw Error('load failed'); });
    const second = ctx.queueDocumentOperation(async()=>{ order.push(2); return 42; });
    await assert.rejects(first,/load failed/); assert.equal(await second,42);
    assert.deepEqual(order,[1,2]); assert.equal(ctx.documentBusy,false); assert.equal(doc.body.inert,false);
});
test('tabs restore separate data, formatting, undo stacks, scroll and column rules without cloning', () => {
    const capture = source('captureDocument');
    const fields = capture.slice(capture.indexOf('return {')+8,capture.indexOf('searchText:')).split(',').map(s=>s.trim()).filter(Boolean);
    const tailFields = ['tableSource','tableData','tableColumns','tableAllColumns','tableHiddenColumns','tablePinnedColumns','tableColumnRules','tableFilteredData','tableSortCol','tableSortAsc','tableVirtualStart'];
    const nodes = new Map();
    const extras = {window:{},searchInput:{value:'email'},searchInfo:{},status:{},byId(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:''});return nodes.get(id);},formatSize:String};
    for (const name of [...fields,...tailFields]) extras[name] = null;
    for (const name of ['enableButtons','updateUndoButtons','updateTitle','updateLevelDisplay','updateSearchOptionButtons','renderTree','updateBreadcrumb']) extras[name]=()=>{};
    const ctx = sandbox(['captureDocument','restoreDocumentState'],extras);
    ctx.jsonData = {a:1}; ctx.undoStack = [{path:'root',snapshot:{a:0}}]; ctx.redoStack=[]; ctx.scrollTop=440; ctx.searchMatches=[]; ctx.currentMatchIndex=-1;
    ctx.visibleRows=[{path:"root.a"}]; ctx.metadataDirty=false;
    ctx.originalCrlf=true; ctx.originalIndent='\t'; ctx.tableColumnRules=[{column:'x',op:'gt',value:'3'}];
    const a = ctx.captureDocument();
    ctx.jsonData={b:2}; ctx.undoStack=[]; ctx.scrollTop=10; ctx.originalCrlf=false; ctx.tableColumnRules=[];
    const b = ctx.captureDocument();
    ctx.restoreDocumentState(a);
    assert.equal(ctx.visibleRows,a.visibleRows); assert.equal(ctx.metadataDirty,false);
    assert.equal(ctx.jsonData,a.jsonData); assert.equal(ctx.undoStack,a.undoStack); assert.equal(ctx.scrollTop,440);
    assert.equal(ctx.originalCrlf,true); assert.equal(ctx.tableColumnRules.length,1);
    ctx.restoreDocumentState(b); assert.equal(ctx.jsonData,b.jsonData); assert.equal(ctx.undoStack.length,0); assert.equal(ctx.scrollTop,10);
});
function updateSandbox({available=true,choice='cancel',canSave=true,failInstall=false}={}) {
    const calls=[],dialogs=[]; let listener;
    const fakeDialog = {querySelector(){return {};},showModal(){},close(){},remove(){}};
    const ctx = sandbox(['checkForUpdates'],{window:{__TAURI__:{core:{async invoke(command){calls.push(command); if(command==='check_for_update') return available ? {version:'1.4.1',current_version:'1.4.0'} : null; if(command==='install_update'){listener?.({payload:{phase:'downloading',downloaded:5,total:10}}); if(failInstall)throw Error('bad signature');}}},event:{async listen(_event,fn){listener=fn;return ()=>calls.push('unlisten');}}}},
        updateRunning:false,updateInstalling:false,documentBusy:false,documents:[],
        wx:de=>de,formatSize:String,console:{warn(){}},document:{querySelector(){return null},createElement(){return fakeDialog},body:{append(){}}},
        async chooseDialog(title){dialogs.push(title); return choice;},async confirmDocumentsSaved(){return canSave;},persistWorkspace(){calls.push('persist');}});
    return {ctx,calls,dialogs};
}
test('updater stays quiet when current, asks before install and respects unsaved cancellation', async () => {
    let s=updateSandbox({available:false}); await s.ctx.checkForUpdates(false); assert.deepEqual(s.dialogs,[]);
    s=updateSandbox(); await s.ctx.checkForUpdates(true); assert.deepEqual(s.calls,['check_for_update']);
    s=updateSandbox({choice:'install',canSave:false}); await s.ctx.checkForUpdates(true); assert.deepEqual(s.calls,['check_for_update']);
});
test('updater restarts only after successful installation and reports accepted background failures', async () => {
    let s=updateSandbox({choice:'install'}); await s.ctx.checkForUpdates(true);
    assert.deepEqual(s.calls,['check_for_update','persist','install_update','restart_application','unlisten']);
    s=updateSandbox({choice:'install',failInstall:true}); await s.ctx.checkForUpdates(false);
    assert.ok(s.dialogs.includes('Update fehlgeschlagen')); assert.equal(s.calls.includes('restart_application'),false);
    assert.equal(s.ctx.updateRunning,false); assert.equal(s.ctx.updateInstalling,false);
});
test('release manifest requires a signature for every platform and correct artifact formats', () => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'json-updater-test-'));
    try {
        const artifact=path.join(root,'JSON Viewer.app.tar.gz');fs.writeFileSync(artifact,'artifact');
        assert.throws(()=>createManifest('1.4.0',[['darwin-aarch64',artifact]]));
        fs.writeFileSync(artifact+'.sig',Buffer.from('test-only-signature').toString('base64'));
        const manifest=createManifest('1.4.0',[['darwin-aarch64',artifact]]);
        assert.equal(manifest.version,'1.4.0'); assert.ok(manifest.platforms['darwin-aarch64'].url.endsWith('JSON.Viewer.app.tar.gz'));
        assert.throws(()=>createManifest('1.4.0',[['windows-x86_64',artifact]]));
        assert.throws(()=>createManifest('bad',[]));
        assert.throws(()=>createManifest('1.4.0',[]));
    } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('transform worker processes a large document and caps long-string previews', async () => {
    const {Worker} = require('node:worker_threads');
    const workerFile = require.resolve('../web/transform-worker.js');
    const coreFile = require.resolve('../web/workspace-core.js');
    const worker = new Worker(`
        const {parentPort} = require('node:worker_threads');
        global.self = global;
        global.importScripts = () => { global.WorkspaceCore = require(${JSON.stringify(coreFile)}); };
        global.postMessage = data => parentPort.postMessage(data);
        require(${JSON.stringify(workerFile)});
        parentPort.on('message', data => self.onmessage({data}));
    `, {eval:true});
    try {
        const data = await new Promise((resolve,reject) => {
            worker.once('message',resolve); worker.once('error',reject);
            worker.postMessage({source:Array.from({length:20000},(_,id)=>({id,nested:{value:id},text:'x'.repeat(1100)})),options:{operation:'flatten',arrays:'indices',separator:'.'}});
        });
        assert.equal(data.error,undefined);
        assert.equal(data.result.length,20000);
        assert.equal(data.result[19999]['nested.value'],19999);
        assert.ok(data.preview.length <= 12002);
        assert.equal(data.clipped,true);
    } finally { await worker.terminate(); }
});

test('cooperative flatten yields, cancels and preserves independent array values', async () => {
    const source = Array.from({length:5000},(_,i)=>({id:i,deep:{value:i},keep:[{x:1}]}));
    let ticks = 0;
    const timer = setInterval(()=>ticks++,1);
    try {
        const result = await core.flattenDataAsync(source, {arrays:'preserve'});
        assert.ok(ticks > 0);
        assert.equal(result[4999]['deep.value'],4999);
        result[0].keep[0].x=2; assert.equal(source[0].keep[0].x,1);
        let cancel=false;
        await assert.rejects(core.flattenDataAsync(source,{}, {cancelled:()=>cancel,progress:()=>{cancel=true;}}), /abgebrochen/);
    } finally { clearInterval(timer); }
});

test('optional preview transforms only a sample and never caches it as the complete result', async () => {
    const nodes = new Map();
    const ctx = sandbox(['boundedTransformSample','previewTransform','ensureCurrentTransformResult'], {
        transformBusy:false, transformResult:null, transformResultOptions:null,
        wx:de=>de, byId:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},
        invalidateTransformPreview(){}, showNotification(){},
        async buildTransformResult(sample) { return {result:sample ? {sample:true} : {complete:true}, options:{operation:'flatten'}, preview:'sample'}; }
    });
    await ctx.previewTransform();
    assert.equal(ctx.transformResult,null);
    assert.match(nodes.get('transformSummary').textContent,/Stichprobe/);
    assert.equal(await ctx.ensureCurrentTransformResult(),true);
    assert.equal(ctx.transformResult.complete,true);
    const sampled=ctx.boundedTransformSample(Array.from({length:10000},()=>({text:'x'.repeat(10000)})));
    assert.ok(sampled.value.length < 300);
    assert.ok(sampled.text.length <= 12000);
});

test('flatten prepares reusable keys and exact depth metadata without modifying JSON values', async () => {
    const JsonCore = require('../web/json-core.js');
    const nodeSizeSymbol = Symbol('size'), nodeDepthsSymbol = Symbol('depths');
    const ctx = sandbox(['prepareTransformTree'], {JsonCore,nodeSizeSymbol,nodeDepthsSymbol,performance,setTimeout});
    const input = {z:{id:1},a:[{nested:{v:2}},null,[]],empty:{},__size:4};
    for (const arrays of ['indices','preserve']) {
        const result = await core.flattenDataAsync(input,{arrays},{indexKeys:JsonCore.seedKeys});
        const before = JSON.stringify(result);
        const keys = JsonCore.sortedKeys(result);
        await ctx.prepareTransformTree(result,()=>false);
        assert.equal(JsonCore.sortedKeys(result),keys);
        assert.equal(keys[0],'z.id');
        function count(value) {
            const counts=[1];
            if (value && typeof value === 'object') for (const child of Object.values(value)) {
                count(child).forEach((n,d)=>counts[d+1]=(counts[d+1]||0)+n);
            }
            return counts;
        }
        let sum=0;
        assert.deepEqual(Array.from(result[nodeDepthsSymbol]),count(result).map(n=>sum+=n));
        assert.equal(result[nodeSizeSymbol],sum);
        assert.equal(JSON.stringify(result),before);
    }
});

test('data profile distinguishes missing, null, empty, types and repeated scalars', async () => {
    const rows=[{a:2,v:null,empty:''},{a:4,v:'x'},{a:'4',v:'x'},{a:6},{}];
    const before=JSON.stringify(rows), report=await core.profileData(rows);
    const a=report.fields.find(f=>f.field==='a'), v=report.fields.find(f=>f.field==='v');
    assert.deepEqual(a.numeric,{count:3,min:2,max:6,mean:4});
    assert.equal(a.missing,1);assert.equal(a.mixedTypes,true);
    assert.equal(a.distinctScalars,4);assert.equal(a.duplicateScalars,0);
    assert.equal(v.nulls,1);assert.equal(v.missing,2);assert.equal(v.duplicateScalars,1);
    assert.deepEqual(v.topValues[0],{type:'string',value:'x',count:2});
    assert.equal(report.fields.find(f=>f.field==='empty').emptyStrings,1);
    assert.equal(JSON.stringify(rows),before);
    const special=await core.profileData([JSON.parse('{"__proto__":3,"a.b":4,"[value]":2}'),2]);
    assert.equal(special.fields.find(f=>f.field==='__proto__').numeric.mean,3);
    assert.equal(special.fields.filter(f=>f.path?.[0]==='[value]').length,1);
    assert.equal(special.fields.filter(f=>f.recordValue).length,1);
});

test('data profile states sample and cardinality limits and counts retained fields after overflow', async () => {
    const report=await core.profileData(Array.from({length:10001},(_,i)=>({id:i})));
    assert.equal(report.analyzedRecords,10000);assert.equal(report.sampled,true);
    assert.equal(report.fields[0].distinctScalars,null);
    assert.equal(report.fields[0].duplicateScalars,null);
    assert.deepEqual(report.fields[0].topValues,[]);
    const first=Object.fromEntries(Array.from({length:200},(_,i)=>['k'+i,i]));
    const limited=await core.profileData([first,{extra:1,k199:8},first]);
    assert.equal(limited.fields.length,200);assert.equal(limited.fieldsLimited,true);
    assert.equal(limited.fields.find(f=>f.field==='k199').present,3);
    assert.equal(limited.fields.find(f=>f.field==='k0').missing,1);
    const values=await core.profileData([{x:'a'.repeat(501),y:{}},{x:2,y:[]}]);
    assert.equal(values.fields[0].valuesLimited,true);
    assert.equal(values.fields[1].distinctScalars,0);
    assert.equal(values.fields[1].mixedTypes,true);
    assert.equal((await core.profileData([])).analyzedRecords,0);
    assert.equal((await core.profileData(null)).fields[0].nulls,1);
});

test('data profile yields to the UI and cancellation prevents a completed report', async () => {
    const row=Object.fromEntries(Array.from({length:200},(_,i)=>['k'+i,i]));
    let cancelled=false,ticks=0;
    await assert.rejects(core.profileData(Array(10000).fill(row),{
        cancelled:()=>cancelled,progress:()=>{ticks++;cancelled=true;}
    }),/cancelled/);
    assert.ok(ticks>0);
});

test('full data profiling includes records beyond the sample and reports no record cap', async () => {
    const rows=Array.from({length:12000},()=>({v:1}));rows[11999]={v:12001};
    const full=await core.profileData(rows,{maxRecords:Infinity});
    assert.equal(full.analyzedRecords,12000);assert.equal(full.sampled,false);
    assert.equal(full.limits.records,null);
    assert.equal(full.fields[0].numeric.max,12001);
    assert.ok(Math.abs(full.fields[0].numeric.mean-2)<1e-10);
    assert.equal(full.fields[0].duplicateScalars,11998);
});

test('nested profiles preserve literal keys, count missing paths and do not expand arrays', async () => {
    const report=await core.profileData([{a:{b:2},'a.b':3,items:[1,2]},{a:{b:4}},{a:null}],{nested:true,maxRecords:Infinity});
    const field=report.fields.find(f=>JSON.stringify(f.path)==='["a","b"]');
    assert.equal(field.numeric.mean,3);assert.equal(field.missing,1);
    assert.equal(report.fields.find(f=>JSON.stringify(f.path)==='["a.b"]').numeric.mean,3);
    assert.equal(report.fields.filter(f=>f.path?.[0]==='items').length,1);
    let value={end:1};for(let i=0;i<25;i++)value={child:value};
    const deep=await core.profileData([value],{nested:true});
    assert.equal(deep.depthLimited,true);assert.equal(deep.fields.length,20);
});

test('profile dialog explicitly selects records and explains the document wrapper', () => {
    const elements=new Map();
    const dialog={querySelector(selector){if(!elements.has(selector))elements.set(selector,{value:'',textContent:'',replaceChildren(){}});return elements.get(selector);},showModal(){},close(){},remove(){}};
    const ctx=sandbox(['showDataProfile'],{
        jsonData:{employees:[{id:1},{id:2}]},documentBusy:false,selectedPath:null,fileName:'employees.json',
        JsonCore:require('../web/json-core.js'),wx:de=>de,escapeHtml:s=>s,
        document:{createElement:()=>dialog,body:{append(){}}}
    });
    ctx.showDataProfile();
    const scope=elements.get('.profile-scope');
    assert.equal(scope.value,'records');
    assert.match(elements.get('.profile-scope-hint').textContent,/2 Datensätze unter employees/);
    scope.value='document';scope.onchange();
    assert.match(elements.get('.profile-scope-hint').textContent,/äußere Objekt/);
});

test('profile CSV preserves quoting, numeric values, unknown counts and sample flags', async () => {
    const report={file:'test;"ä"\n.json',scope:'records',...(await core.profileData([{'=field':-1.5},{'=field':2.5}]))};
    const csv=core.profileCsv(report,'de');
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes('"test;""ä""\n.json"'));
    assert.ok(csv.includes('"\'=field"'));
    assert.ok(csv.includes('"-1,5";"2,5";"0,5"'));
    assert.ok(core.profileCsv(report,'en').includes('"-1.5";"2.5";"0.5"'));
    const limited={file:'large.json',scope:'document',...(await core.profileData([{x:'x'.repeat(501)}]))};
    assert.ok(core.profileCsv(limited).includes(';"";"";"true";"[]"'));
    const empty={file:'empty.json',scope:'document',...(await core.profileData([]))};
    assert.ok(core.profileCsv(empty).includes('"empty.json";"document";"0";"0";"false"'));
});

test('pipeline profiles persist, reload and replace by name without mutating state on storage failure', () => {
    const PipelineCore=require('../web/pipeline-core.js');let stored=null;
    const ctx=sandbox(['savePipelineProfile'],{PipelineCore,wx:de=>de,localStorage:{setItem(key,value){assert.equal(key,'json-viewer-pipelines');stored=value;}}});
    const first=ctx.savePipelineProfile([],'Test',[{op:'trim',field:'name'}]);
    assert.equal(first.index,0);assert.equal(PipelineCore.profiles(JSON.parse(stored))[0].steps[0].field,'name');
    const second=ctx.savePipelineProfile(first.profiles,'Test',[{op:'trim',field:'email'}]);
    assert.equal(second.profiles.length,1);assert.equal(first.profiles[0].steps[0].field,'name');
    ctx.localStorage.setItem=()=>{throw new Error('Storage full');};
    assert.throws(()=>ctx.savePipelineProfile(second.profiles,'Test',[{op:'trim',field:'other'}]),/Storage full/);
    assert.equal(second.profiles[0].steps[0].field,'email');
    assert.throws(()=>ctx.savePipelineProfile([],'Test',[{op:'trim',field:''}]),/Quellfeld/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../web/json-core.js');
const html = fs.readFileSync(require.resolve('../web/index.html'), 'utf8')
    + fs.readFileSync(require.resolve('../web/app-inline.js'), 'utf8');
function source(name) {
    let start = html.indexOf(`        function ${name}(`);
    if (start < 0) start = html.indexOf(`        async function ${name}(`);
    assert.ok(start >= 0, name);
    return html.slice(start, html.indexOf('\n        }', start) + 10);
}
function sandbox(names, extras = {}) {
    const ctx = vm.createContext({ JsonCore: core, appendPath: core.appendPath, allowDocumentFeature: () => true, ...extras });
    vm.runInContext(names.map(source).join('\n'), ctx);
    return ctx;
}
test('all inline scripts parse', () => {
    for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
    new vm.Script(fs.readFileSync(require.resolve('../web/app-inline.js'), 'utf8'));
});
test('arbitrary object keys round-trip through paths without collisions', () => {
    const keys = ['profile.name', 'a[0]', '', '"\\]', 'ü', '0', '__proto__', 'constructor', 'prototype', 'hasOwnProperty'];
    for (const key of keys) {
        const data = JSON.parse(JSON.stringify({ [key]: { value: 3 } }));
        const path = core.appendPath(core.appendPath('root', key), 'value');
        assert.deepEqual(core.parsePath(path), [key, 'value']);
        assert.equal(core.getAtPath(data, path), 3);
        assert.equal(core.parentPath(path), core.appendPath('root', key));
    }
    assert.equal(core.getAtPath({}, 'root.__proto__'), undefined);
    assert.throws(() => core.parsePath('root.a[broken]'));
});
test('strict JSON parsing rejects partially valid documents', () => {
    for (const text of ['{} junk {}', '{} {"bad":}', '{} {', '{"a":1} trailing', '[1,]', '{} ]']) assert.throws(() => core.parseDocument(text), text);
    const parsed = core.parseDocument('\uFEFF{\r\n\t"a": 1\r\n}\r\n{"a":2}\r\n');
    assert.equal(parsed.wasConcatenated, true);
    assert.equal(parsed.crlf, true);
    assert.equal(parsed.indent, '\t');
    assert.deepEqual(parsed.data, [{a:1}, {a:2}]);
    for (const text of ['false', '0', 'null', '""']) assert.deepEqual(core.parseDocument(text).data, JSON.parse(text));
});
test('rendering metadata never mutates input and depth counts include leaf values', () => {
    const ctx = sandbox(['computeSubtreeSizes']);
    vm.runInContext(`
        var nodeSizeSymbol = Symbol('nodeSize');
        var nodeDepthsSymbol = Symbol('nodeDepths');
        function metadataSize(v) { return v !== null && typeof v === 'object' ? v[nodeSizeSymbol] : undefined; }
        function metadataDepths(v) { return v !== null && typeof v === 'object' ? v[nodeDepthsSymbol] : undefined; }
    `, ctx);
    const data = {__size: 999, __depthSizes: ['user'], nested: {x:1}};
    const before = JSON.stringify(data);
    assert.equal(ctx.computeSubtreeSizes(data), 6);
    assert.equal(JSON.stringify(data), before);
    assert.deepEqual(Array.from(data.nested[ctx.nodeDepthsSymbol]), [1,2]);
});
test('primitive root documents appear in tree and remain editable', () => {
    for (const value of [false, 0, null, '']) {
        const ctx = sandbox(['buildVisibleRows'], { jsonData:value, fileName:'test.json', expandAllMode:false, expandedPaths:new Set(['root']), window:{} });
        ctx.buildVisibleRows();
        assert.equal(ctx.visibleRows.length, 1);
        assert.equal(ctx.visibleRows[0].value, value);
    }
});
test('bulk rename visits renamed subtrees and preflights collisions', () => {
    const data = { old: { old: 1 }, sibling: { old: 2 } };
    assert.equal(core.bulkEdit(data, 'renameKey', 'old', 'new', ''), 3);
    assert.deepEqual(data, {new:{new:1}, sibling:{new:2}});
    const conflict = {old:1, child:{old:2, new:3}};
    const before = JSON.stringify(conflict);
    assert.throws(() => core.bulkEdit(conflict, 'renameKey', 'old', 'new', ''));
    assert.equal(JSON.stringify(conflict), before);
    assert.equal(core.bulkEdit(conflict, 'renameKey', 'old', 'old', ''), 0);
    const prototype = { old: {value:1} };
    core.bulkEdit(prototype, 'renameKey', 'old', '__proto__', '');
    assert.ok(Object.hasOwn(prototype, '__proto__'));
    assert.equal(Object.getPrototypeOf(prototype), Object.prototype);
});
test('bulk replacement honors the requested old value', () => {
    const data = [{x:1}, {x:2}];
    assert.equal(core.bulkEdit(data,'replaceValue','x','1','3'), 1);
    assert.deepEqual(data,[{x:3},{x:2}]);
});
test('diff opens and treats filenames as text', () => {
    const elements = new Map();
    const document = { getElementById(id) { if (!elements.has(id)) elements.set(id,{classList:{add(){}},innerHTML:'',textContent:''}); return elements.get(id); } };
    const ctx = sandbox(['escapeHtml','showDiffView'], {document, jsonData:{x:1}, fileName:'<img onerror=alert(1)>.json', diffSecondData:null});
    ctx.showDiffView();
    assert.ok(elements.get('diffLeft').innerHTML.includes('&lt;img'));
    assert.ok(!elements.get('diffLeft').innerHTML.includes('<img'));
});
test('notification types do not become zero-millisecond timeouts', () => {
    const delays = [];
    const document = {querySelector(){return null},createElement(){return {setAttribute(){},remove(){}}},body:{appendChild(){}}};
    const ctx = sandbox(['showNotification'], {document,setTimeout(_fn,delay){delays.push(delay)}});
    for (const type of ['info','error','warning',true]) ctx.showNotification('message',type);
    ctx.showNotification('message',5000);
    assert.deepEqual(delays,[2500,2500,2500,2500,5000]);
});

test('saving edited JSON preserves user keys, concatenation, CRLF and current path', async () => {
    for (const original of ['false','0','null','""','{"__size":99,"__depthSizes":["keep"]}', '{\r\n\t"a":1\r\n}\r\n{"a":2}']) {
        const parsed = core.parseDocument(original);
        let output = '', finished = false;
        const ctx = sandbox(['saveFile','getFileName'], {
            jsonData:parsed.data, isModified:true, currentFilePath:'old.json', fileName:'old.json',
            originalIndent:parsed.indent, originalCrlf:parsed.crlf, wasConcatenated:parsed.wasConcatenated,
            console, setTimeout(fn){fn()}, showNotification(){}, updateTitle(){},
            window:{__TAURI__:{dialog:{async save(){return 'new.json'}},core:{async invoke(command,args){
                if(command==='save_file_chunk') output += args.crlf ? args.content.replace(/\n/g,'\r\n') : args.content;
                if(command==='save_file_finish') finished = true;
                if(command==='get_file_size') return Buffer.byteLength(output);
            }}}}
        });
        await ctx.saveFile();
        assert.ok(finished);
        const saved = core.parseDocument(output);
        assert.deepEqual(saved.data, parsed.data);
        assert.equal(saved.wasConcatenated, parsed.wasConcatenated);
        assert.equal(saved.crlf, parsed.crlf);
        assert.equal(ctx.currentFilePath, 'new.json');
        assert.equal(ctx.isModified, false);
    }
});

test('editing and undo use the literal key and mark root snapshots modified', () => {
    const data = {'a.b':1, a:{b:2}, '__size':3};
    const ctx = sandbox(['parsePath','getValueAtPath','setValueAtPath','markModified','undo'], {
        jsonData:data, isModified:false, updateTitle(){},updateUndoButtons(){},renderTree(){},
        undoStack:[{path:'root', snapshot:structuredClone(data)}],redoStack:[]
    });
    ctx.setValueAtPath(core.appendPath('root','a.b'),9);
    assert.equal(data['a.b'],9);
    assert.equal(data.a.b,2);
    ctx.isModified = false;
    ctx.undo();
    assert.equal(ctx.jsonData['a.b'],1);
    assert.equal(ctx.isModified,true);
});

test('expanded virtual tree reaches the last record of a 205265-row document', () => {
    const names=['parsePath','getPathDepth','computeSubtreeSizes','getNodeSize','getNodeSizeAtDepth','getExpandedRowsInRange','getFlatIndexForPath'];
    const data=Array.from({length:205265},(_,i)=>({'a.b':i}));
    const ctx=sandbox(names,{jsonData:data,expandAllMode:true,expandAllDepthLimit:Infinity,fileName:'large.json',window:{_collapsedInExpandAll:new Set()}});
    vm.runInContext(`
        var nodeSizeSymbol = Symbol('nodeSize');
        var nodeDepthsSymbol = Symbol('nodeDepths');
        function metadataSize(v) { return v !== null && typeof v === 'object' ? v[nodeSizeSymbol] : undefined; }
        function metadataDepths(v) { return v !== null && typeof v === 'object' ? v[nodeDepthsSymbol] : undefined; }
    `,ctx);
    const total=ctx.computeSubtreeSizes(data);
    const rows=ctx.getExpandedRowsInRange(total-2,total);
    assert.equal(rows.length,2);
    assert.equal(rows[1].value,205264);
    assert.equal(rows[1].path,'root[205264]["a.b"]');
    assert.equal(ctx.getFlatIndexForPath(rows[1].path),total-1);
});

test('table slider can reach the final row of 205265 records', () => {
    const elements=new Map();
    const tbody={innerHTML:''};
    const table={style:{},querySelector(){return tbody}};
    const container={clientHeight:700,clientWidth:1000,scrollWidth:1400,scrollLeft:0,querySelector(){return table},querySelectorAll(){return []},addEventListener(){},removeEventListener(){}};
    elements.set('tableScroll',container);
    const document={getElementById(id){if(!elements.has(id))elements.set(id,{});return elements.get(id)}};
    const data=Array.from({length:205265},(_,i)=>({id:i}));
    const ctx=sandbox(['renderVirtualTable','formatCellValue','escapeHtml'],{
        document,tableFilteredData:data,tableData:data,tableColumns:['id'],tableSortCol:null,
        tableVirtualStart:0,TABLE_ROW_HEIGHT:28,TABLE_HEADER_HEIGHT:35,_tableScrollHandler:null,
        requestAnimationFrame(fn){fn()},updateTableVerticalScrollbarGeometry(){}
    });
    ctx.renderVirtualTable();
    const scrollbar=elements.get('tableVerticalScrollbar');
    assert.equal(scrollbar.value,'0');
    scrollbar.value=scrollbar.max;
    scrollbar.oninput();
    assert.ok(tbody.innerHTML.includes('205264'));
    assert.ok(elements.get('tableInfo').textContent.includes('205265'));
});

test('wide roots use virtual rows and jump directly to the last screen', () => {
    const data = Object.fromEntries(Array.from({length:100001},(_,i)=>['field'+String(i).padStart(6,'0'),i]));
    const ctx = sandbox(['buildVisibleRows','getExpandedRowsInRange','getNodeSizeAtDepth','getNodeSize'], {
        jsonData:data,fileName:'wide.json',expandedPaths:new Set(['root']),expandAllMode:false,
        expandAllDepthLimit:Infinity,window:{},metadataDepths:()=>[1,100002],metadataSize:()=>100002
    });
    ctx.buildVisibleRows();
    assert.equal(ctx.expandAllMode,true); assert.equal(ctx.expandAllDepthLimit,1);
    assert.equal(ctx.visibleRows.length,0);
    const keys=core.sortedKeys(data);
    assert.equal(core.sortedKeys(data),keys);
    const rows=ctx.getExpandedRowsInRange(99992,100002);
    assert.equal(rows.length,10); assert.equal(rows.at(-1).value,100000);
    ctx.expandAllDepthLimit=Infinity;
    assert.equal(ctx.getExpandedRowsInRange(99992,100002).at(-1).value,100000);
    data.extra=2;core.invalidateKeys(); assert.equal(core.sortedKeys(data).length,100002);
});


test('wide document restrictions disable buttons, guard shortcuts and reset for other tabs', () => {
    const buttons = new Map();
    const ctx = sandbox(['wideDocumentRestriction','restrictedFeatureIds','featureRestrictionReason',
        'allowDocumentFeature','updateFeatureAvailability','showRawView','showStatistics'], {
        jsonData: {small:1}, currentLang:'de', notices:[],
        document:{getElementById(id) {
            if (!buttons.has(id)) buttons.set(id,{disabled:false,title:id,dataset:{}});
            return buttons.get(id);
        }},
        showNotification(message) { ctx.notices.push(message); }
    });
    ctx.updateFeatureAvailability();
    assert.equal(ctx.allowDocumentFeature(),true);
    ctx.jsonData=Object.fromEntries(Array.from({length:100001},(_,i)=>['field'+i,i]));
    ctx.updateFeatureAvailability();
    for (const button of buttons.values()) {
        assert.equal(button.disabled,true);
        assert.match(button.title,/100.000/);
    }
    // Direct entry points used by shortcuts must return before serialization or analysis.
    ctx.showRawView(); ctx.showStatistics();
    assert.equal(ctx.notices.length,2);
    ctx.jsonData={small:1};ctx.updateFeatureAvailability();
    for (const [id,button] of buttons) { assert.equal(button.disabled,false);assert.equal(button.title,id); }
    ctx.jsonData=undefined;ctx.updateFeatureAvailability();
    assert.equal(ctx.wideDocumentRestriction(),false);
});

test('failed reads retain permission errors instead of reporting empty data', async () => {
    const ctx=sandbox(['readFileContent'],{
        console:{log(){},warn(){},error(){}},RAW_READ_THRESHOLD:50e6,CHUNK_THRESHOLD:200e6,
        window:{__TAURI__:{core:{invoke:async()=>{throw 'Fehler beim Öffnen: Operation not permitted (os error 1)';}}}}
    });
    await assert.rejects(ctx.readFileContent('/Desktop/example.json'),/Operation not permitted/);
});

test('load error remains visible and offers copying and reopening', async () => {
    const nodes=[], doc={createElement(tag){const node={tag,children:[],setAttribute(){},append(...items){this.children.push(...items)},showModal(){this.open=true},close(){this.open=false},remove(){},focus(){},select(){}};nodes.push(node);return node},body:{append(){}}};
    let copied='',opened=false;
    const ctx=sandbox(['showLoadError'],{document:doc,currentLang:'de',navigator:{clipboard:{async writeText(text){copied=text}}},openFile(){opened=true}});
    ctx.showLoadError(new Error('Permission denied'),'/Desktop/test.json');
    assert.equal(nodes[0].open,true);
    await nodes.find(n=>n.textContent==='Details kopieren').onclick();
    assert.match(copied,/Permission denied/);assert.match(copied,/test.json/);
    assert.equal(nodes[0].open,true);
    nodes.find(n=>n.textContent==='Datei erneut auswählen…').onclick();
    assert.equal(opened,true);assert.equal(nodes[0].open,false);
});

test('pipeline undo and redo swap detached roots without serializing large documents', () => {
    const original={x:1},result={x:2};
    const ctx=sandbox(['undo','redo'],{jsonData:result,undoStack:[{path:'root',snapshot:original,reference:true}],redoStack:[],resetPreparedPipelineTree(){},updateUndoButtons(){}});
    ctx.undo();assert.equal(ctx.jsonData,original);assert.equal(ctx.redoStack[0].snapshot,result);
    ctx.redo();assert.equal(ctx.jsonData,result);assert.equal(ctx.undoStack[0].snapshot,original);
});

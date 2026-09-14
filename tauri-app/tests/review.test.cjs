const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../web/json-core.js');
const html = fs.readFileSync(require.resolve('../web/index.html'), 'utf8');
function source(name) {
    let start = html.indexOf(`        function ${name}(`);
    if (start < 0) start = html.indexOf(`        async function ${name}(`);
    assert.ok(start >= 0, name);
    return html.slice(start, html.indexOf('\n        }', start) + 10);
}
function sandbox(names, extras = {}) {
    const ctx = vm.createContext({ JsonCore: core, appendPath: core.appendPath, ...extras });
    vm.runInContext(names.map(source).join('\n'), ctx);
    return ctx;
}
test('all inline scripts parse', () => {
    for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
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

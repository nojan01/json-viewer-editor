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
    const views = core.safeSavedViews([{name:' Server ',columns:['id','host'],hidden:['host'],pinned:['id'],rules:[{column:'host',op:'contains',value:'prod'}],filter:'active',jsonPath:'$.servers[*]',sortColumn:'id',sortAscending:false},{name:' Server ',columns:[]}]);
    assert.equal(views.length,1); assert.equal(views[0].name,'Server');
    const applied = core.applySavedView(views[0],['host','id','region']);
    assert.deepEqual(applied.columns,['id','host','region']); assert.deepEqual(applied.hidden,['host']);
    assert.deepEqual(applied.pinned,['id']); assert.equal(applied.rules.length,1);
    assert.equal(applied.sortColumn,'id'); assert.equal(applied.sortAscending,false);
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
    ctx.originalCrlf=true; ctx.originalIndent='\t'; ctx.tableColumnRules=[{column:'x',op:'gt',value:'3'}];
    const a = ctx.captureDocument();
    ctx.jsonData={b:2}; ctx.undoStack=[]; ctx.scrollTop=10; ctx.originalCrlf=false; ctx.tableColumnRules=[];
    const b = ctx.captureDocument();
    ctx.restoreDocumentState(a);
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

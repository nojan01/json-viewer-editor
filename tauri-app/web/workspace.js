/* Desktop workspace features; shares the editor's state without copying document data. */
// WebKitGTK native select painting can override the app's theme colors.
document.documentElement.classList.toggle('platform-linux', /Linux/i.test(navigator.platform));
const wx = (de, en) => currentLang === 'en' ? en : de;
const byId = id => document.getElementById(id);
let documents = [], activeDocumentId = null, nextDocumentId = 1, documentBeingLoaded = null;
let documentBusy = false, operationQueue = Promise.resolve(), workspaceRestoring = false;
let tableAllColumns = [], tableHiddenColumns = new Set(), tablePinnedColumns = new Set(), tableColumnRules = [];
let tableBuildGeneration = 0, tableSource = null;
const initialEmptyTree = treeContainer.innerHTML;
const documentButtons = [...document.querySelectorAll('button[disabled]')];
function readPreference(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writePreference(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
let recentFiles = readPreference('json-viewer-recent', []);
if (!Array.isArray(recentFiles)) recentFiles = [];
recentFiles = recentFiles.filter(p => typeof p === 'string').slice(0, 12);
const workspaceBar = document.createElement('div');
workspaceBar.className = 'workspace-bar';
workspaceBar.innerHTML = '<div class="document-tabs" id="documentTabs" role="tablist"></div><select id="recentFiles" aria-label="Zuletzt geöffnet"></select><button id="btnMaskedExport"></button>';
// Place below the toolbar, above search and document contents.
const toolbar = document.querySelector('.toolbar');
(toolbar || treeContainer).insertAdjacentElement('afterend', workspaceBar);

function viewState() {
    return WorkspaceCore.safeView({ scrollTop, expanded: [...expandedPaths], expandAllMode,
        depth: Number.isFinite(expandAllDepthLimit) ? expandAllDepthLimit : null,
        collapsed: [...(window._collapsedInExpandAll || [])], selectedPath });
}
function captureDocument() {
    return { jsonData, fileName, fileSize, wasConcatenated, originalIndent, originalCrlf, currentFilePath,
        expandedPaths, expandAllMode, expandAllDepthLimit, totalExpandedCount, selectedPath, selectedIndex,
        isModified, currentExpandLevel, maxDepth, undoStack, redoStack, scrollTop, bookmarks,
        searchMatches, currentMatchIndex, searchKeysOnly, searchValuesOnly, searchRegex,
        searchText: searchInput.value, collapsed: window._collapsedInExpandAll,
        tableSource, tableData, tableColumns, tableAllColumns, tableHiddenColumns, tablePinnedColumns, tableColumnRules,
        tableFilteredData, tableSortCol, tableSortAsc, tableVirtualStart,
        tableFilter: byId('tableFilterInput').value, tableTitle: byId('tableTitle').textContent,
        jsonPathText: byId('jsonpathInput').value, statusText: byId('nodeCount').textContent,
        loadText: byId('loadTime').textContent };
}
function stashDocument() {
    const doc = documents.find(d => d.id === activeDocumentId);
    if (doc && jsonData !== undefined) {
        doc.state = captureDocument(); doc.path = currentFilePath; doc.name = fileName; doc.view = viewState();
    }
}
function beginDocument() {
    stashDocument();
    if (documentBeingLoaded) activeDocumentId = documentBeingLoaded.id;
    else { const doc = { id: nextDocumentId++ }; documents.push(doc); activeDocumentId = doc.id; }
    clearTimeout(_tableFilterTimer); tableBuildGeneration++;
    editingPath = null; editingKey = false; metadataDirty = true;
    searchInput.value = ''; searchInfo.textContent = ''; searchKeysOnly = false; searchValuesOnly = false; searchRegex = false;
    byId('jsonpathInput').value = ''; byId('jsonpathResultCount').textContent = '';
    tableSource = null; tableData = []; tableFilteredData = []; tableColumns = []; tableAllColumns = [];
    tableHiddenColumns = new Set(); tablePinnedColumns = new Set(); tableColumnRules = []; tableVirtualStart = 0;
    tableSortCol = null; tableSortAsc = true; expandAllDepthLimit = Infinity;
    byId('tableScroll').innerHTML = ''; byId('columnPanel').hidden = true;
    byId('tableFilterInput').value = ''; diffSecondData = null;
    hideTableView(); hideRawView(); hideDiffView(); hideMatchList(); hideContextMenu();
}
function finishDocument() {
    const doc = documents.find(d => d.id === activeDocumentId);
    if (doc?.view) applyViewState(doc.view);
    stashDocument();
    if (currentFilePath) {
        recentFiles = [currentFilePath, ...recentFiles.filter(p => p !== currentFilePath)].slice(0, 12);
        writePreference('json-viewer-recent', recentFiles);
    }
    renderDocumentTabs(); persistWorkspace(); updateUndoButtons(); updateSearchOptionButtons();
}
function applyViewState(view) {
    view = WorkspaceCore.safeView(view);
    expandedPaths = new Set(view.expanded); expandAllMode = view.expandAllMode;
    expandAllDepthLimit = view.depth ?? Infinity; window._collapsedInExpandAll = new Set(view.collapsed);
    currentExpandLevel = view.depth ?? 1; scrollTop = view.scrollTop; selectedPath = view.selectedPath;
    renderTree(); updateLevelDisplay(); updateBreadcrumb();
}
function restoreDocumentState(state) {
    ({ jsonData, fileName, fileSize, wasConcatenated, originalIndent, originalCrlf, currentFilePath,
        expandedPaths, expandAllMode, expandAllDepthLimit, totalExpandedCount, selectedPath, selectedIndex,
        isModified, currentExpandLevel, maxDepth, undoStack, redoStack, scrollTop, bookmarks,
        searchMatches, currentMatchIndex, searchKeysOnly, searchValuesOnly, searchRegex,
        tableSource, tableData, tableColumns, tableAllColumns, tableHiddenColumns, tablePinnedColumns, tableColumnRules,
        tableFilteredData, tableSortCol, tableSortAsc, tableVirtualStart } = state);
    editingPath = null; editingKey = false; metadataDirty = false; minimapNeedsRedraw = true;
    window._collapsedInExpandAll = state.collapsed || new Set(); searchInput.value = state.searchText;
    byId('tableFilterInput').value = state.tableFilter; byId('tableTitle').textContent = state.tableTitle;
    byId('jsonpathInput').value = state.jsonPathText; byId('jsonpathResultCount').textContent = '';
    byId('nodeCount').textContent = state.statusText; byId('loadTime').textContent = state.loadText;
    byId('fileSize').textContent = formatSize(fileSize); status.textContent = fileName;
    searchInfo.textContent = searchMatches.length ? `${currentMatchIndex + 1} / ${searchMatches.length}` : '';
    diffSecondData = null; enableButtons(); updateUndoButtons(); updateTitle(); updateLevelDisplay();
    updateSearchOptionButtons(); renderTree(); updateBreadcrumb();
}
function updateSearchOptionButtons() { updateSearchButtons(); }
function persistWorkspace() {
    if (workspaceRestoring) return;
    const tabs = documents.filter(d => d.id === activeDocumentId ? currentFilePath : d.path).map(d => ({
        path: d.id === activeDocumentId ? currentFilePath : d.path,
        view: d.id === activeDocumentId ? viewState() : d.view
    }));
    writePreference('json-viewer-workspace', { tabs, active: currentFilePath });
}
function renderDocumentTabs() {
    const tabs = byId('documentTabs'); tabs.replaceChildren();
    for (const doc of documents) {
        const active = doc.id === activeDocumentId;
        const item = document.createElement('div'); item.className = `document-tab${active ? ' active' : ''}`;
        const button = document.createElement('button'); button.className = 'tab-label'; button.setAttribute('role','tab');
        button.setAttribute('aria-selected',String(active)); button.title = doc.path || doc.name || fileName;
        button.textContent = ((active ? isModified : doc.state?.isModified) ? '● ' : '') + (active ? fileName : doc.name || getFileName(doc.path || 'JSON'));
        button.onclick = () => activateDocument(doc.id);
        const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label',wx('Tab schließen','Close tab'));
        close.onclick = () => closeDocument(doc.id); item.append(button,close); tabs.append(item);
    }
    byId('btnMaskedExport').textContent = wx('Maskierter Export','Masked export');
    byId('btnMaskedExport').disabled = jsonData === undefined;
    const updateButton = byId('btnCheckUpdates');
    updateButton.querySelector('span:last-child').textContent = wx('Update','Update');
    updateButton.title = wx('Nach Updates suchen','Check for updates');
    const recent = byId('recentFiles'); recent.replaceChildren(new Option(wx('Zuletzt geöffnet…','Recent files…'),''));
    recentFiles.forEach(path => recent.add(new Option(path,path)));
}
function queueDocumentOperation(operation) {
    const run = operationQueue.then(async () => {
        documentBusy = true;
        // Commit any focused inline editor before switching/saving the document.
        document.activeElement?.blur();
        document.body.inert = true;
        try { return await operation(); }
        finally { documentBusy = false; document.body.inert = false; }
    });
    operationQueue = run.catch(() => {}); return run;
}
function activateDocument(id) {
    if (documentBusy) return Promise.resolve(false);
    return queueDocumentOperation(() => activateDocumentNow(id));
}
async function activateDocumentNow(id) {
    const doc = documents.find(d => d.id === id); if (!doc || id === activeDocumentId) return true;
    stashDocument(); clearTimeout(_tableFilterTimer); tableBuildGeneration++;
    hideTableView(); hideRawView(); hideDiffView(); hideMatchList(); hideContextMenu();
    if (!doc.state) {
        documentBeingLoaded = doc;
        try { return await originalPathLoader(doc.path); } finally { documentBeingLoaded = null; }
    }
    activeDocumentId = id; restoreDocumentState(doc.state); persistWorkspace(); return true;
}
const originalPathLoader = loadFileFromPath;
loadFileFromPath = path => queueDocumentOperation(async () => {
    const existing = documents.find(d => d.path === path || (d.id === activeDocumentId && currentFilePath === path));
    if (existing) return activateDocumentNow(existing.id);
    return originalPathLoader(path);
});
const originalBrowserLoader = loadFile;
loadFile = file => queueDocumentOperation(() => originalBrowserLoader(file));
const originalSaveFile = saveFile;
saveFile = () => queueDocumentOperation(async () => { await originalSaveFile(); stashDocument(); renderDocumentTabs(); persistWorkspace(); });
byId('recentFiles').onchange = event => { if (event.target.value) loadFileFromPath(event.target.value); event.target.value = ''; };

function chooseDialog(title, text, choices) {
    return new Promise(resolve => {
        const dialog = document.createElement('dialog'); dialog.className = 'workspace-dialog';
        const heading = document.createElement('h3'); heading.textContent = title;
        const body = document.createElement('p'); body.textContent = text;
        const actions = document.createElement('div'); actions.className = 'dialog-actions';
        const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
        choices.forEach(([value,label]) => { const button = document.createElement('button'); button.textContent = label; button.onclick = () => finish(value); actions.append(button); });
        dialog.append(heading,body,actions); dialog.oncancel = e => { e.preventDefault(); finish('cancel'); };
        document.body.append(dialog); dialog.showModal();
    });
}
let closePending = false;
async function confirmDocumentsSaved(ids) {
    stashDocument();
    const dirty = documents.filter(d => ids.includes(d.id) && d.state?.isModified);
    if (!dirty.length) return true;
    const decision = await chooseDialog(wx('Ungespeicherte Änderungen','Unsaved changes'), dirty.map(d => d.name).join(', '), [
        ['cancel',wx('Abbrechen','Cancel')],['discard',wx('Verwerfen','Discard')],['save',wx('Speichern','Save')]
    ]);
    if (decision === 'discard') return true;
    if (decision !== 'save') return false;
    const previous = activeDocumentId;
    for (const doc of dirty) {
        await activateDocument(doc.id); await saveFile();
        if (isModified) { await activateDocument(previous); return false; }
    }
    await activateDocument(previous); return true;
}
async function closeDocument(id) {
    if (documentBusy || closePending) return;
    const index = documents.findIndex(d => d.id === id); if (index < 0) return;
    closePending = true;
    try {
        if (!(await confirmDocumentsSaved([id]))) return;
        if (id === activeDocumentId) {
            const other = documents[index + 1] || documents[index - 1];
            if (other && !(await activateDocument(other.id))) return;
            if (!other) {
                documentButtons.forEach(button => button.disabled = true); tableSource = null;
                activeDocumentId = null; jsonData = undefined; currentFilePath = null; fileName = ''; isModified = false;
                undoStack = []; redoStack = []; tableData = []; tableFilteredData = []; visibleRows = []; searchMatches = [];
                tableColumns = []; selectedPath = null; selectedIndex = -1; scrollTop = 0;
                hideTableView(); hideRawView(); hideDiffView(); hideMatchList();
                treeContainer.innerHTML = initialEmptyTree; byId('btnDropZoneOpen')?.addEventListener('click',openFile); byId('nodeCount').textContent = wx('Keine Datei geladen','No file loaded');
                byId('fileSize').textContent = ''; byId('loadTime').textContent = ''; status.textContent = wx('Bereit','Ready');
                searchInput.value = ''; searchInfo.textContent = ''; updateUndoButtons(); updateBreadcrumb(); updateTitle();
            }
        }
        documents = documents.filter(d => d.id !== id); renderDocumentTabs(); persistWorkspace();
    } finally { closePending = false; }
}
async function requestApplicationExit() {
    if (closePending || updateInstalling) return;
    if (documentBusy) { showNotification(wx('Bitte den laufenden Vorgang abwarten.','Please wait for the current operation.')); return; }
    closePending = true;
    try {
        if (await confirmDocumentsSaved(documents.map(d => d.id))) {
            persistWorkspace(); await window.__TAURI__.core.invoke('exit_application');
        }
    } finally { closePending = false; }
}
window.addEventListener('beforeunload', event => {
    stashDocument(); persistWorkspace();
    if (documents.some(d => d.state?.isModified)) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', persistWorkspace);
setInterval(persistWorkspace, 5000);
setTimeout(async () => {
    if (!window.__TAURI__ || documents.length) return;
    const saved = readPreference('json-viewer-workspace', {});
    if (!Array.isArray(saved.tabs)) return;
    const paths = new Set();
    for (const tab of saved.tabs.slice(0, 30)) {
        if (typeof tab?.path !== 'string' || paths.has(tab.path)) continue;
        paths.add(tab.path); documents.push({ id: nextDocumentId++, path: tab.path, name: getFileName(tab.path), view: WorkspaceCore.safeView(tab.view) });
    }
    const active = documents.find(d => d.path === saved.active) || documents[0];
    workspaceRestoring = true;
    try { if (active) await activateDocument(active.id); }
    finally { workspaceRestoring = false; renderDocumentTabs(); }
}, 1400);

function initializeTableColumns(cols) {
    tableAllColumns = [...cols]; tableHiddenColumns = new Set(cols.slice(MAX_TABLE_COLUMNS));
    tablePinnedColumns = new Set(); tableColumnRules = []; syncTableColumns(); renderColumnPanel();
}
function syncTableColumns() {
    const visible = tableAllColumns.filter(c => !tableHiddenColumns.has(c));
    tableColumns = [...visible.filter(c => tablePinnedColumns.has(c)), ...visible.filter(c => !tablePinnedColumns.has(c))];
}
function applyPinnedColumns() {
    const count = tableColumns.filter(c => tablePinnedColumns.has(c)).length;
    for (const row of byId('tableScroll').querySelectorAll('tr')) {
        for (let i = 1; i <= count; i++) { const cell = row.children[i]; if (cell) { cell.classList.add('pinned'); cell.style.left = `${(i - 1) * 180}px`; } }
    }
}
function refreshTableSettings() { syncTableColumns(); renderTable(byId('tableFilterInput').value); }
function renderColumnPanel() {
    const panel = byId('columnPanel'); panel.replaceChildren();
    const hint = document.createElement('p'); hint.className = 'hint';
    hint.textContent = wx('Spalten anzeigen, fixieren und verschieben. Alle Filter gelten gemeinsam. = vergleicht den Datentyp; Zahlenvergleiche gelten nur für Zahlen. Maximal 200 sichtbare Spalten.', 'Show, pin and reorder columns. All filters apply together. = compares types; numeric comparisons apply to numbers only. Up to 200 visible columns.'); panel.append(hint);
    const reset = document.createElement('button'); reset.textContent = wx('Zurücksetzen','Reset'); reset.onclick = () => { initializeTableColumns([...tableAllColumns].sort()); refreshTableSettings(); }; panel.append(reset);
    for (const column of [...tableAllColumns.filter(c => tablePinnedColumns.has(c)), ...tableAllColumns.filter(c => !tablePinnedColumns.has(c))]) {
        const row = document.createElement('div'); row.className = 'column-settings-row';
        const visible = document.createElement('input'); visible.type = 'checkbox'; visible.checked = !tableHiddenColumns.has(column); visible.setAttribute('aria-label',wx('Anzeigen: ','Show: ') + column);
        visible.onchange = () => {
            if (visible.checked && tableColumns.length >= MAX_TABLE_COLUMNS) { visible.checked = false; showNotification(wx('Zuerst eine andere Spalte ausblenden.','Hide another column first.')); return; }
            if (visible.checked) tableHiddenColumns.delete(column); else tableHiddenColumns.add(column);
            refreshTableSettings();
        };
        const name = document.createElement('span'); name.className = 'column-name'; name.textContent = column; name.title = column;
        const pin = document.createElement('button'); pin.textContent = tablePinnedColumns.has(column) ? wx('Lösen','Unpin') : wx('Fixieren','Pin');
        pin.onclick = () => { if (tablePinnedColumns.has(column)) tablePinnedColumns.delete(column); else tablePinnedColumns.add(column); refreshTableSettings(); renderColumnPanel(); };
        const move = direction => { const i = tableAllColumns.indexOf(column), next = i + direction; if (next < 0 || next >= tableAllColumns.length) return; [tableAllColumns[i],tableAllColumns[next]] = [tableAllColumns[next],tableAllColumns[i]]; refreshTableSettings(); renderColumnPanel(); };
        const up = document.createElement('button'); up.textContent = '↑'; up.title = wx('Nach links','Move left'); up.onclick = () => move(-1); up.disabled = tableAllColumns[0] === column;
        const down = document.createElement('button'); down.textContent = '↓'; down.title = wx('Nach rechts','Move right'); down.onclick = () => move(1); down.disabled = tableAllColumns.at(-1) === column;
        const op = document.createElement('select'); op.setAttribute('aria-label',wx('Filter: ','Filter: ') + column);
        for (const [value,label] of [['',wx('Kein Filter','No filter')],['contains',wx('enthält','contains')],['eq','='],['ne','≠'],['gt','>'],['gte','≥'],['lt','<'],['lte','≤'],['missing',wx('fehlt','missing')],['null','null'],['empty',wx('leer','empty')]]) op.add(new Option(label,value));
        const rule = tableColumnRules.find(r => r.column === column); op.value = rule?.op || '';
        const input = document.createElement('input'); input.type = 'text'; input.value = rule?.value || ''; input.placeholder = wx('Filterwert','Filter value'); input.setAttribute('aria-label',column + ' ' + input.placeholder);
        const setRule = () => { tableColumnRules = tableColumnRules.filter(r => r.column !== column); if (op.value) tableColumnRules.push({column,op:op.value,value:input.value}); input.disabled = !op.value || ['missing','null','empty'].includes(op.value); };
        input.disabled = !op.value || ['missing','null','empty'].includes(op.value);
        op.onchange = () => { setRule(); refreshTableSettings(); }; input.oninput = () => { setRule(); clearTimeout(_tableFilterTimer); _tableFilterTimer = setTimeout(refreshTableSettings,200); };
        row.append(visible,name,pin,up,down,op,input); panel.append(row);
    }
}
byId('btnTableColumns').onclick = () => { byId('columnPanel').hidden = !byId('columnPanel').hidden; if (!byId('columnPanel').hidden) renderColumnPanel(); renderVirtualTable(); };

async function writeExport(text, suggestedName) {
    if (!window.__TAURI__) {
        const url = URL.createObjectURL(new Blob([text],{type:'application/json'}));
        const a = document.createElement('a'); a.href = url; a.download = suggestedName; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); return true;
    }
    const path = await window.__TAURI__.dialog.save({defaultPath:suggestedName,filters:[{name:'JSON',extensions:['json']}]});
    if (!path) return false;
    // Backend also checks file identity (symlinks/hard links) against every open source.
    await window.__TAURI__.core.invoke('validate_export_path',{path,sources:documents.map(d => d.id === activeDocumentId ? currentFilePath : d.path).filter(Boolean)});
    let started = false;
    try {
        await window.__TAURI__.core.invoke('save_file_start',{path}); started = true;
        for (let i = 0; i < text.length;) {
            let end = Math.min(i + 1024 * 1024,text.length);
            if (end < text.length && /[\uD800-\uDBFF]/.test(text[end-1])) end--;
            await window.__TAURI__.core.invoke('save_file_chunk',{path,content:text.slice(i,end),crlf:false}); i = end;
        }
        await window.__TAURI__.core.invoke('save_file_finish',{path}); return true;
    } catch (err) { if (started) await window.__TAURI__.core.invoke('save_file_cancel',{path}).catch(()=>{}); throw err; }
}
function showMaskedExport() {
    if (jsonData === undefined || documentBusy) return;
    const sourceData = jsonData, sourceName = fileName;
    const dialog = document.createElement('dialog'); dialog.className = 'workspace-dialog';
    dialog.innerHTML = `<h3>${wx('Maskierter Export','Masked export')}</h3><p>${wx('Ausgewählte Feldnamen werden auf allen Ebenen durch den Ersatztext ersetzt, auch innerhalb von Arrays. Der Export enthält das gesamte Dokument.','Selected field names are replaced at every level, including inside arrays. The export contains the entire document.')}</p><input id="maskSearch" placeholder="${wx('Feldnamen suchen','Find field names')}"><div class="mask-fields"></div><label>${wx('Ersatztext','Replacement')} <input id="maskReplacement" value="[MASKIERT]"></label><p class="mask-count"></p><pre class="mask-preview"></pre><div class="dialog-actions"><button class="mask-close">${wx('Abbrechen','Cancel')}</button><button class="mask-generate">${wx('Vorschau erstellen','Generate preview')}</button><button class="mask-save primary" disabled>${wx('Kopie exportieren','Export copy')}</button></div>`;
    const selected = new Set(), fields = WorkspaceCore.fieldNames(sourceData), fieldsBox = dialog.querySelector('.mask-fields');
    let result = null;
    const save = dialog.querySelector('.mask-save'), preview = dialog.querySelector('.mask-preview'), count = dialog.querySelector('.mask-count');
    const invalidate = () => { result = null; save.disabled = true; preview.textContent = ''; count.textContent = `${selected.size} ${wx('Feldnamen ausgewählt','field names selected')}`; };
    const render = query => {
        fieldsBox.replaceChildren();
        fields.filter(key => key.toLocaleLowerCase().includes(query.toLocaleLowerCase())).forEach(key => {
            const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = selected.has(key);
            input.onchange = () => { if (input.checked) selected.add(key); else selected.delete(key); invalidate(); };
            label.append(input,document.createTextNode(' ' + JSON.stringify(key))); fieldsBox.append(label);
        });
    };
    dialog.querySelector('#maskSearch').oninput = e => render(e.target.value);
    dialog.querySelector('#maskReplacement').oninput = invalidate;
    dialog.querySelector('.mask-generate').onclick = () => {
        if (!selected.size) { count.textContent = wx('Bitte mindestens ein Feld auswählen.','Select at least one field.'); return; }
        result = WorkspaceCore.serializeMasked(sourceData,[...selected],dialog.querySelector('#maskReplacement').value);
        preview.textContent = result.text.slice(0, 16000) + (result.text.length > 16000 ? '\n… ' + wx('Vorschau gekürzt; Export enthält alle Daten.','Preview truncated; export contains all data.') : '');
        count.textContent = `${result.count} ${wx('Felder ersetzt','fields replaced')}`; save.disabled = result.count === 0;
    };
    const close = () => { dialog.close(); dialog.remove(); result = null; };
    dialog.querySelector('.mask-close').onclick = close; dialog.oncancel = e => { e.preventDefault(); if (!documentBusy) close(); };
    save.onclick = async () => {
        if (!result) return;
        try {
            const exported = await queueDocumentOperation(() => writeExport(result.text,sourceName.replace(/\.[^.]+$/,'') + '-masked.json'));
            if (exported) { close(); showNotification(wx('Maskierte Kopie exportiert.','Masked copy exported.')); }
        } catch (err) { count.textContent = String(err.message || err); }
    };
    render(''); invalidate(); document.body.append(dialog); dialog.showModal();
}
byId('btnMaskedExport').onclick = showMaskedExport;

let updateRunning = false, updateInstalling = false;
async function checkForUpdates(interactive = false) {
    if (!window.__TAURI__ || updateRunning || documentBusy) return;
    updateRunning = true; let accepted = false, progressDialog = null, unlisten = null;
    try {
        const update = await window.__TAURI__.core.invoke('check_for_update');
        if (!update) {
            if (interactive) await chooseDialog(wx('Software-Update','Software update'),wx('Die App ist auf dem neuesten Stand.','The app is up to date.'),[['ok','OK']]);
            return;
        }
        // Startup checks never interrupt a file operation or another modal.
        if (!interactive && (documentBusy || document.querySelector('dialog[open]'))) return;
        const choice = await chooseDialog(wx('Update verfügbar','Update available'),`${update.current_version} → ${update.version}\n${update.body || ''}`, [['cancel',wx('Später','Later')],['install',wx('Herunterladen und installieren','Download and install')]]);
        if (choice !== 'install') return;
        if (documentBusy || !(await confirmDocumentsSaved(documents.map(d => d.id)))) return;
        accepted = true; updateInstalling = true; persistWorkspace();
        progressDialog = document.createElement('dialog'); progressDialog.className = 'workspace-dialog';
        progressDialog.innerHTML = '<h3></h3><p></p><progress class="update-progress"></progress>';
        progressDialog.querySelector('h3').textContent = wx('Update wird installiert','Installing update');
        progressDialog.oncancel = e => e.preventDefault(); document.body.append(progressDialog); progressDialog.showModal();
        unlisten = await window.__TAURI__.event.listen('update-progress', ({payload}) => {
            const progress = progressDialog.querySelector('progress');
            if (payload.total) { progress.max = payload.total; progress.value = payload.downloaded; }
            progressDialog.querySelector('p').textContent = payload.phase === 'installing' ? wx('Signatur prüfen und installieren…','Verifying signature and installing…') : `${wx('Herunterladen','Downloading')}: ${formatSize(payload.downloaded)}`;
        });
        await window.__TAURI__.core.invoke('install_update');
        progressDialog.close(); progressDialog.remove(); progressDialog = null;
        await chooseDialog(wx('Update installiert','Update installed'),wx('Die App wird jetzt neu gestartet.','The app will now restart.'),[['ok',wx('Neu starten','Restart')]]);
        await window.__TAURI__.core.invoke('restart_application');
    } catch (err) {
        if (progressDialog) { progressDialog.close(); progressDialog.remove(); progressDialog = null; }
        if (interactive || accepted) await chooseDialog(wx('Update fehlgeschlagen','Update failed'),String(err.message || err),[['ok','OK']]);
        else console.warn('Update check:',String(err));
    } finally { unlisten?.(); if (progressDialog) { progressDialog.close(); progressDialog.remove(); } updateRunning = false; updateInstalling = false; }
}
byId('btnCheckUpdates').onclick = () => checkForUpdates(true);
if (window.__TAURI__) {
    window.__TAURI__.event.listen('request-app-exit',requestApplicationExit);
    window.__TAURI__.window.getCurrentWindow().onCloseRequested(event => { event.preventDefault(); requestApplicationExit(); });
    setTimeout(() => checkForUpdates(false),5000);
}
renderDocumentTabs();

function nativeUndo(forward) {
    if (documentBusy || updateInstalling) return;
    const focused = document.activeElement;
    if (focused?.matches('input,textarea,[contenteditable=true]')) document.execCommand(forward ? 'redo' : 'undo');
    else if (forward) redo(); else undo();
}

/* Desktop workspace features; shares the editor's state without copying document data. */
// WebKitGTK native select painting can override the app's theme colors.
document.documentElement.classList.toggle('platform-linux', /Linux/i.test(navigator.platform));
const wx = (de, en) => currentLang === 'en' ? en : de;
const byId = id => document.getElementById(id);
let documents = [], activeDocumentId = null, nextDocumentId = 1, documentBeingLoaded = null;
let documentBusy = false, operationQueue = Promise.resolve(), workspaceRestoring = false;
let explicitOpenRequested = false;
let tableAllColumns = [], tableHiddenColumns = new Set(), tablePinnedColumns = new Set(), tableColumnRules = [];
let tableBuildGeneration = 0, tableSource = null;
const initialEmptyTree = treeContainer.innerHTML;
const documentButtons = [...document.querySelectorAll('button[disabled]')];
function readPreference(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writePreference(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
let recentFiles = readPreference('json-viewer-recent', []);
if (!Array.isArray(recentFiles)) recentFiles = [];
recentFiles = recentFiles.filter(p => typeof p === 'string').slice(0, 12);
let savedViews = WorkspaceCore.safeSavedViews(readPreference('json-viewer-saved-views', []));
let activeSavedViewName = readPreference('json-viewer-active-view', null);
if (!savedViews.some(view => view.name === activeSavedViewName)) activeSavedViewName = null;
const workspaceBar = document.createElement('div');
workspaceBar.className = 'workspace-bar';
workspaceBar.innerHTML = '<div class="document-tabs" id="documentTabs" role="tablist"></div><select id="recentFiles" aria-label="Zuletzt geöffnet"></select><select id="savedViewSelect" class="saved-view-select" aria-label="Gespeicherte Ansicht"></select><button id="btnManageViews"></button><button id="btnMaskedExport"></button><button id="btnDataProfile"></button><button id="btnPipeline"></button>';
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
        isModified, currentExpandLevel, maxDepth, undoStack, redoStack, scrollTop, bookmarks, visibleRows, metadataDirty,
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
    const activeView = savedViews.find(view => view.name === activeSavedViewName);
    if (activeView) applySavedView(activeView, false);
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
        isModified, currentExpandLevel, maxDepth, undoStack, redoStack, scrollTop, bookmarks, visibleRows, metadataDirty,
        searchMatches, currentMatchIndex, searchKeysOnly, searchValuesOnly, searchRegex,
        tableSource, tableData, tableColumns, tableAllColumns, tableHiddenColumns, tablePinnedColumns, tableColumnRules,
        tableFilteredData, tableSortCol, tableSortAsc, tableVirtualStart } = state);
    editingPath = null; editingKey = false; minimapNeedsRedraw = true;
    window._collapsedInExpandAll = state.collapsed || new Set(); searchInput.value = state.searchText;
    byId('tableFilterInput').value = state.tableFilter; byId('tableTitle').textContent = state.tableTitle;
    byId('jsonpathInput').value = state.jsonPathText; byId('jsonpathResultCount').textContent = '';
    byId('nodeCount').textContent = state.statusText; byId('loadTime').textContent = state.loadText;
    byId('fileSize').textContent = formatSize(fileSize); status.textContent = fileName;
    searchInfo.textContent = searchMatches.length ? `${currentMatchIndex + 1} / ${searchMatches.length}` : '';
    diffSecondData = null; enableButtons(); updateUndoButtons(); updateTitle(); updateLevelDisplay();
    updateSearchOptionButtons(); renderTree(!metadataDirty); updateBreadcrumb();
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
    byId('btnDataProfile').textContent = wx('Datenprofil…','Data profile…');
    byId('btnDataProfile').disabled = jsonData === undefined;
    byId('btnPipeline').textContent = wx('Transformationen…','Transformations…');
    byId('btnPipeline').disabled = jsonData === undefined;
    byId('btnManageViews').textContent = wx('Ansichten…','Views…');
    byId('btnManageViews').disabled = jsonData === undefined;
    const updateButton = byId('btnCheckUpdates');
    updateButton.querySelector('span:last-child').textContent = wx('Update','Update');
    updateButton.title = wx('Nach Updates suchen','Check for updates');
    const recent = byId('recentFiles'); recent.replaceChildren(new Option(wx('Zuletzt geöffnet…','Recent files…'),''));
    recentFiles.forEach(path => recent.add(new Option(path,path)));
    const viewSelect = byId('savedViewSelect'); viewSelect.replaceChildren(new Option(wx('Ansicht wählen…','Choose view…'),''));
    savedViews.forEach(view => viewSelect.add(new Option(view.name,view.name)));
    viewSelect.value = activeSavedViewName || '';
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
loadFileFromPath = path => {
    explicitOpenRequested = true;
    return queueDocumentOperation(async () => {
    const existing = documents.find(d => d.path === path || (d.id === activeDocumentId && currentFilePath === path));
    if (existing) return activateDocumentNow(existing.id);
    return originalPathLoader(path);
    });
};
const originalBrowserLoader = loadFile;
loadFile = file => {
    explicitOpenRequested = true;
    return queueDocumentOperation(() => originalBrowserLoader(file));
};
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
async function initializeWorkspace() {
    if (!window.__TAURI__) return;
    // Resolve Explorer/CLI intent before consulting the saved workspace.
    // A failed explicit load must also not silently load the previous file.
    let startupPath = null;
    try { startupPath = await window.__TAURI__.core.invoke('get_startup_file'); }
    catch (error) { showLoadError(error); }
    if (startupPath) { await loadFileFromPath(startupPath); return; }
    // The explicit-open flag only guards the startup window; clear it once decided.
    const explicitOpen = explicitOpenRequested; explicitOpenRequested = false;
    if (explicitOpen || documentBusy || documents.length) return;
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
}
setTimeout(() => initializeWorkspace().catch(error => showLoadError(error)), 1400);

function initializeTableColumns(cols) {
    tableAllColumns = [...cols]; tableHiddenColumns = new Set(cols.slice(MAX_TABLE_COLUMNS));
    tablePinnedColumns = new Set(); tableColumnRules = []; syncTableColumns(); renderColumnPanel();
    const active = savedViews.find(view => view.name === activeSavedViewName);
    if (active) setTimeout(() => applySavedView(active, false), 0);
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

function persistSavedViews() {
    savedViews = WorkspaceCore.safeSavedViews(savedViews);
    writePreference('json-viewer-saved-views', savedViews);
    writePreference('json-viewer-active-view', activeSavedViewName);
    renderDocumentTabs();
}
function captureSavedView(name) {
    return { name, columns: [...tableAllColumns], hidden: [...tableHiddenColumns], pinned: [...tablePinnedColumns],
        rules: tableColumnRules.map(rule => ({...rule})), filter: byId('tableFilterInput').value,
        jsonPath: byId('jsonpathInput').value.trim(), sortColumn: tableSortCol, sortAscending: tableSortAsc,
        tree: { expanded: [...expandedPaths], collapsed: [...(window._collapsedInExpandAll || [])], expandAllMode,
            expandDepth: Number.isFinite(expandAllDepthLimit) ? expandAllDepthLimit : null, level: currentExpandLevel,
            lineNumbers: showLineNumbers, minimap: showMinimap, indentGuides: showIndentGuides } };
}
function applySavedTree(tree) {
    if (!tree) return;
    expandedPaths = new Set(tree.expanded.length ? tree.expanded : ['root']);
    window._collapsedInExpandAll = new Set(tree.collapsed); expandAllMode = tree.expandAllMode;
    expandAllDepthLimit = tree.expandDepth ?? Infinity;
    currentExpandLevel = Math.max(1,Math.min(maxDepth || tree.level,tree.level));
    showLineNumbers = tree.lineNumbers; showMinimap = tree.minimap; showIndentGuides = tree.indentGuides;
    byId('btnLineNum').style.opacity = showLineNumbers ? '1' : '0.5';
    byId('btnMinimap').style.opacity = showMinimap ? '1' : '0.5';
    byId('btnGuides').style.opacity = showIndentGuides ? '1' : '0.5';
    byId('minimap').style.display = showMinimap ? 'block' : 'none'; minimapNeedsRedraw = true;
    updateLevelDisplay(); renderTree(); if (showMinimap) requestAnimationFrame(updateMinimap);
}
function applySavedView(view, notify = true) {
    if (!view) return;
    activeSavedViewName = view.name; writePreference('json-viewer-active-view', activeSavedViewName);
    byId('jsonpathInput').value = view.jsonPath || '';
    if (view.jsonPath) { byId('jsonpathBar').classList.add('visible'); executeJsonPath(); }
    applySavedTree(view.tree);
    if (tableAllColumns.length) {
        const applied = WorkspaceCore.applySavedView(view, tableAllColumns);
        tableAllColumns = applied.columns; tableHiddenColumns = new Set(applied.hidden);
        tablePinnedColumns = new Set(applied.pinned); tableColumnRules = applied.rules;
        tableSortCol = applied.sortColumn; tableSortAsc = applied.sortAscending;
        byId('tableFilterInput').value = applied.filter;
        syncTableColumns(); prepareTableData(applied.filter); renderVirtualTable(); renderColumnPanel();
    }
    renderDocumentTabs();
    if (notify) showNotification(`${wx('Ansicht angewendet','View applied')}: ${view.name}`);
}
function showSavedViews() {
    const dialog = document.createElement('dialog'); dialog.className = 'workspace-dialog';
    dialog.innerHTML = `<h3>${wx('Gespeicherte Ansichten und Abfragen','Saved views and queries')}</h3><p>${wx('Speichert Spalten, Filter, Sortierung, JSONPath, aufgeklappte Baumebenen, Zeilennummern, Minimap und Einrückungslinien. Die aktive Ansicht wird beim nächsten Dokument wiederverwendet.','Saves columns, filters, sorting, JSONPath, expanded tree levels, line numbers, minimap and indentation guides. The active view is reused for the next document.')}</p><div class="saved-view-form"><input class="saved-view-name" maxlength="80" placeholder="${wx('Name der Ansicht','View name')}"><button class="saved-view-save primary">${wx('Aktuelle Ansicht speichern','Save current view')}</button></div><div class="saved-view-list"></div><div class="dialog-actions"><button class="saved-view-none">${wx('Aktive Ansicht lösen','Clear active view')}</button><button class="saved-view-close">${wx('Schließen','Close')}</button></div>`;
    const list = dialog.querySelector('.saved-view-list'), nameInput = dialog.querySelector('.saved-view-name');
    const render = () => {
        list.replaceChildren();
        if (!savedViews.length) { const empty = document.createElement('p'); empty.textContent = wx('Noch keine Ansichten gespeichert.','No saved views yet.'); list.append(empty); }
        for (const view of savedViews) {
            const row = document.createElement('div'); row.className = `saved-view-row${view.name === activeSavedViewName ? ' active' : ''}`;
            const info = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('small');
            title.textContent = view.name; detail.textContent = `${view.columns.length - view.hidden.length}/${view.columns.length} ${wx('Spalten','columns')} · ${view.rules.length} ${wx('Filter','filters')}${view.jsonPath ? ' · JSONPath' : ''}${view.tree ? ` · ${wx('Baumebene','tree level')} ${view.tree.level}` : ''}`; info.append(title,detail);
            const apply = document.createElement('button'); apply.textContent = wx('Anwenden','Apply'); apply.onclick = () => { applySavedView(view); render(); };
            const remove = document.createElement('button'); remove.textContent = wx('Löschen','Delete'); remove.onclick = () => { savedViews = savedViews.filter(item => item.name !== view.name); if (activeSavedViewName === view.name) activeSavedViewName = null; persistSavedViews(); render(); };
            row.append(info,apply,remove); list.append(row);
        }
    };
    dialog.querySelector('.saved-view-save').onclick = () => {
        const name = nameInput.value.trim();
        if (!name) { nameInput.focus(); return; }
        const saved = captureSavedView(name), index = savedViews.findIndex(view => view.name === name);
        if (index >= 0) savedViews[index] = saved; else savedViews.push(saved);
        activeSavedViewName = name; persistSavedViews(); nameInput.value = ''; render();
        showNotification(`${wx('Ansicht gespeichert','View saved')}: ${name}`);
    };
    dialog.querySelector('.saved-view-none').onclick = () => { activeSavedViewName = null; persistSavedViews(); render(); };
    const close = () => { dialog.close(); dialog.remove(); };
    dialog.querySelector('.saved-view-close').onclick = close; dialog.oncancel = event => { event.preventDefault(); close(); };
    render(); document.body.append(dialog); dialog.showModal(); nameInput.focus();
}
byId('savedViewSelect').onchange = event => { const view = savedViews.find(item => item.name === event.target.value); if (view) applySavedView(view); };
byId('btnManageViews').onclick = showSavedViews;

async function writeExport(text, suggestedName, format = 'json') {
    const csv = format === 'csv';
    if (!window.__TAURI__) {
        const url = URL.createObjectURL(new Blob([text],{type:csv ? 'text/csv;charset=utf-8' : 'application/json'}));
        const a = document.createElement('a'); a.href = url; a.download = suggestedName; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); return true;
    }
    const path = await window.__TAURI__.dialog.save({defaultPath:suggestedName,filters:[{name:csv ? 'CSV' : 'JSON',extensions:[csv ? 'csv' : 'json']}]});
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
function savePipelineProfile(saved, name, plan) {
    name = name.trim();
    if (!name || name.length > 80) throw new Error(wx('Bitte einen Profilnamen mit 1 bis 80 Zeichen eingeben.','Enter a profile name with 1 to 80 characters.'));
    const steps = PipelineCore.steps(plan);
    const next = saved.map(profile => ({...profile}));
    let index = next.findIndex(profile => profile.name === name);
    if (index < 0) {
        if (next.length >= 50) throw new Error(wx('Maximal 50 Profile.','Maximum of 50 profiles.'));
        index = next.length; next.push({name,steps});
    } else next[index] = {name,steps};
    localStorage.setItem('json-viewer-pipelines',JSON.stringify(next));
    return {profiles:next,index};
}
function showPipeline() {
    if(jsonData===undefined||documentBusy)return;
    const source=jsonData, sourceName=fileName;
    let saved=PipelineCore.profiles(readPreference('json-viewer-pipelines',[]));
    let plan=[],busy=false,cancelled=false;
    const dialog=document.createElement('dialog');dialog.className='workspace-dialog pipeline-dialog';
    dialog.innerHTML=`<h3>${wx('Transformationsassistent','Transformation assistant')}</h3>
      <p>${wx('Schritte werden in der gezeigten Reihenfolge auf das gesamte Dokument angewendet. Feldnamen gelten auf allen Objektebenen, auch innerhalb von Arrays. Fehlende Quellfelder werden übersprungen; Zielkonflikte und ungültige Werte brechen den gesamten Ablauf ab.','Steps run in the shown order on the entire document. Field names match at all object levels, including arrays. Missing source fields are skipped; target conflicts and invalid values abort the whole pipeline.')}</p>
      <div class="pipeline-presets"><select class="pipeline-saved" aria-label="Profil"></select><input class="pipeline-name" maxlength="80" placeholder="${wx('Profilname','Profile name')}"><button class="pipeline-save">${wx('Profil speichern','Save profile')}</button><button class="pipeline-delete">${wx('Profil löschen','Delete profile')}</button></div>
      <p class="pipeline-status" role="status" aria-live="polite"></p>
      <ol class="pipeline-steps"></ol><button class="pipeline-add">+ ${wx('Schritt hinzufügen','Add step')}</button>
      <pre class="mask-preview pipeline-preview"></pre>
      <div class="dialog-actions"><button class="pipeline-close">${wx('Schließen / Abbrechen','Close / Cancel')}</button><button class="pipeline-preview-button">${wx('Stichprobenvorschau','Sample preview')}</button><button class="pipeline-apply">${wx('Anwenden','Apply')}</button><button class="pipeline-new primary">${wx('In neuem Tab öffnen','Open in new tab')}</button></div>`;
    const q=s=>dialog.querySelector(s),status=q('.pipeline-status'),preview=q('.pipeline-preview');
    const labels={rename:wx('Feld umbenennen','Rename field'),delete:wx('Feld löschen','Delete field'),convert:wx('Typ konvertieren','Convert type'),trim:wx('Text trimmen','Trim text'),replace:wx('Text ersetzen','Replace text'),merge:wx('Felder zusammenführen','Merge fields'),split:wx('Feld aufteilen','Split field'),flatten:'Flatten',unflatten:'Unflatten'};
    function clear(){preview.textContent='';status.textContent='';status.classList.remove('pipeline-error');}
    function listProfiles(){const select=q('.pipeline-saved');select.replaceChildren(new Option(wx('Profil laden…','Load profile…'),''));saved.forEach((p,i)=>select.add(new Option(p.name,String(i))));}
    function render() {
        const list=q('.pipeline-steps');list.replaceChildren();
        plan.forEach((step,i)=>{
            const li=document.createElement('li'),op=document.createElement('select');op.setAttribute('aria-label',wx('Operation','Operation'));
            for(const [value,label]of Object.entries(labels))op.add(new Option(label,value));op.value=step.op;
            op.onchange=()=>{plan[i]={op:op.value,field:'',target:'',value:'',separator:['flatten','unflatten'].includes(op.value)?'.':' ',arrays:'preserve',type:'string'};clear();render();};li.append(op);
            function input(key,label){const wrap=document.createElement('label');wrap.textContent=label;const control=document.createElement('input');control.value=step[key]||'';control.maxLength=1000;control.dataset.step=String(i+1);control.dataset.field=key;control.required=key==='field'||(key==='target'&&step.op!=='replace')||key==='value'||(key==='separator'&&step.op==='split');if(control.required)wrap.textContent+=' *';if(key==='field')control.placeholder=wx('z.B. name','e.g. name');control.oninput=()=>{step[key]=control.value;control.removeAttribute('aria-invalid');clear();};wrap.append(control);li.append(wrap);}
            function select(key,label,choices){const wrap=document.createElement('label');wrap.textContent=label;const control=document.createElement('select');choices.forEach(([v,l])=>control.add(new Option(l,v)));control.value=step[key];control.onchange=()=>{step[key]=control.value;clear();};wrap.append(control);li.append(wrap);}
            if(['flatten','unflatten'].includes(step.op)) {
                select('separator',wx('Trennzeichen','Separator'),[['.','(.)'],['_','(_)'],['/','(/)']]);
                if(step.op==='flatten')select('arrays','Arrays',[['preserve',wx('Erhalten','Preserve')],['indices',wx('Indizes','Indices')]]);
            } else {
                input('field',step.op==='merge'?wx('Quellfelder (kommagetrennt)','Source fields (comma separated)'):wx('Feldname','Field name'));
                if(['rename','merge','split','replace'].includes(step.op))input('target',step.op==='replace'?wx('Ersetzen durch','Replace with'):step.op==='split'?wx('Zielfelder (kommagetrennt)','Target fields (comma separated)'):wx('Zielfeld','Target field'));
                if(step.op==='replace')input('value',wx('Suchtext (wörtlich)','Find text (literal)'));
                if(['split','merge'].includes(step.op))input('separator',wx('Trennzeichen','Separator'));
                if(step.op==='convert')select('type',wx('Zieltyp','Target type'),[['string','String'],['number','Number'],['boolean','Boolean'],['null','Null']]);
            }
            for(const [label,action,disabled]of [['↑',()=>{[plan[i-1],plan[i]]=[plan[i],plan[i-1]];},i===0],['↓',()=>{[plan[i+1],plan[i]]=[plan[i],plan[i+1]];},i===plan.length-1],['×',()=>plan.splice(i,1),false]]) {
                const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.onclick=()=>{action();clear();render();};li.append(b);
            }
            list.append(li);
        });
    }
    listProfiles();
    q('.pipeline-add').onclick=()=>{if(plan.length>=50)return;plan.push({op:'trim',field:'',target:'',value:'',separator:' ',arrays:'preserve',type:'string'});clear();render();};
    q('.pipeline-saved').onchange=()=>{const p=saved[Number(q('.pipeline-saved').value)];if(q('.pipeline-saved').value===''||!p)return;plan=PipelineCore.steps(p.steps);q('.pipeline-name').value=p.name;clear();render();};
    q('.pipeline-save').onclick=()=>{
        clear();
        try {
            const name=q('.pipeline-name');
            if(!name.value.trim()){name.focus();throw new Error(wx('Bitte oben einen Profilnamen eingeben.','Enter a profile name above.'));}
            for(const input of dialog.querySelectorAll('.pipeline-steps input[required]')) {
                const empty=['separator','value'].includes(input.dataset.field) ? !input.value : !input.value.trim();
                if(empty){input.setAttribute('aria-invalid','true');input.focus();throw new Error(`${wx('Schritt','Step')} ${input.dataset.step}: ${wx('Bitte das markierte Pflichtfeld ausfüllen.','Complete the highlighted required field.')}`);}
            }
            const result=savePipelineProfile(saved,name.value,plan);
            saved=result.profiles;listProfiles();q('.pipeline-saved').value=String(result.index);
            status.textContent=wx('Profil gespeichert: ','Profile saved: ')+saved[result.index].name;
        }catch(e){status.classList.add('pipeline-error');status.textContent=e.message;}
    };
    q('.pipeline-delete').onclick=()=>{const value=q('.pipeline-saved').value;if(value==='')return;saved.splice(Number(value),1);writePreference('json-viewer-pipelines',saved);listProfiles();};
    function close(){cancelled=true;if(!busy){dialog.close();dialog.remove();}}
    q('.pipeline-close').onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
    async function execute(mode) {
        if(busy)return;
        try {
            const steps=PipelineCore.steps(plan);busy=true;cancelled=false;
            const controls=[...dialog.querySelectorAll('button,input,select')].filter(c=>c!==q('.pipeline-close'));
            const disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
            try {
                clear();status.textContent=wx('Arbeitskopie wird vorbereitet…','Preparing working copy…');
                await new Promise(resolve=>setTimeout(resolve,16));
                const input=mode==='preview'?boundedTransformSample(source).value:source;
                const result=await PipelineCore.run(input,steps,{indexKeys:JsonCore.seedKeys,cancelled:()=>cancelled,step:(i,n)=>{status.textContent=`${wx('Schritt','Step')} ${i} / ${n}`;}});
                if(mode==='preview') {preview.textContent=boundedTransformSample(result).text;status.textContent=wx('Stichprobe: maximal 300 Knoten; gekürzte Werte. Nur eine Orientierung, keine vollständige Prüfung. Anwenden verarbeitet alle Daten erneut.','Sample: up to 300 nodes; shortened values. Guidance only, not full validation. Apply processes all data again.');return;}
                status.textContent=wx('Anzeige wird vorbereitet…','Preparing display…');
                await prepareTransformTree(result,()=>cancelled);
                if(cancelled)return;
                // The modal prevents user edits; still verify the source before committing.
                if(jsonData!==source)throw new Error(wx('Das aktive Dokument hat sich geändert.','The active document changed.'));
                if(mode==='apply') {
                    undoStack.push({path:'root',snapshot:source,reference:true});if(undoStack.length>MAX_UNDO)undoStack.shift();redoStack=[];
                    jsonData=result;resetPreparedPipelineTree();updateUndoButtons();stashDocument();renderDocumentTabs();
                } else {
                    await queueDocumentOperation(async()=>{const start=performance.now();await finalizeLoad({jsonData:result,name:sourceName.replace(/\.json$/i,'')+'-transformed.json',fileSize:0,nodeCount:0,parseTime:0,prepared:true,indent:'  ',crlf:false},null,start);isModified=true;updateTitle();stashDocument();renderDocumentTabs();});
                }
                cancelled=true;
            } finally {controls.forEach((c,i)=>c.disabled=disabled[i]);busy=false;if(cancelled){dialog.close();dialog.remove();}}
        } catch(error){status.textContent=error.message;}
    }
    q('.pipeline-preview-button').onclick=()=>execute('preview');q('.pipeline-apply').onclick=()=>execute('apply');q('.pipeline-new').onclick=()=>execute('new');
    document.body.append(dialog);dialog.showModal();q('.pipeline-add').click();
}
function resetPreparedPipelineTree() {
    tableSource=null;currentExpandLevel=1;metadataDirty=false;totalExpandedCount=metadataSize(jsonData)||1;maxDepth=(metadataDepths(jsonData)?.length||1)-1;
    expandedPaths=new Set(['root']);expandAllMode=false;window._collapsedInExpandAll=new Set();scrollTop=0;selectedPath=null;selectedIndex=-1;
    searchMatches=[];currentMatchIndex=-1;searchInfo.textContent='';isModified=true;updateTitle();updateLevelDisplay();renderTree();
}
byId('btnPipeline').onclick=showPipeline;

function showDataProfile() {
    if (jsonData === undefined || documentBusy) return;
    const source = jsonData, selected = selectedPath ? getValueAtPath(selectedPath) : undefined;
    const sourceName = fileName;
    const rootKeys = source && typeof source === 'object' && !Array.isArray(source) ? JsonCore.sortedKeys(source) : [];
    const recordKeys = rootKeys.length <= 100 ? rootKeys.filter(key=>Array.isArray(source[key])) : [];
    const recordKey = recordKeys.length === 1 ? recordKeys[0] : null;
    const dialog = document.createElement('dialog'); dialog.className = 'workspace-dialog profile-dialog';
    dialog.innerHTML = `<h3>${wx('Datenprofil und Qualitätsprüfung','Data profile and quality')}</h3>
        <p>${wx('Analysiert alle Datensätze oder eine schnelle Stichprobe und bis zu 200 direkte Felder. Objektfelder können bis Tiefe 20 mitgeprüft werden. Arrays bleiben ein Feld; deren Einträge bitte separat als Datensätze auswählen.','Analyzes all records or a quick sample and up to 200 direct fields. Object fields can be included up to depth 20. Arrays remain a single field; select their entries separately as records.')}</p>
        <label>${wx('Bereich','Scope')} <select class="profile-scope">${recordKey !== null ? `<option value="records">${wx('Datensätze','Records')}: ${escapeHtml(recordKey)} (${source[recordKey].length.toLocaleString()})</option>` : ''}<option value="document">${recordKey !== null ? wx('Dokumenthülle (1 Objekt)','Document wrapper (1 object)') : wx('Gesamtes Dokument','Entire document')}</option><option value="selected" ${selected === undefined ? 'disabled' : ''}>${wx('Ausgewählter Knoten','Selected node')}</option></select></label>
        <label>${wx('Umfang','Coverage')} <select class="profile-coverage"><option value="all">${wx('Alle Datensätze','All records')}</option><option value="sample">${wx('Stichprobe: erste 10.000','Sample: first 10,000')}</option></select></label>
        <label><input type="checkbox" class="profile-nested" checked> ${wx('Verschachtelte Objektfelder einbeziehen','Include nested object fields')}</label>
        <p class="profile-scope-hint"></p>
        <p class="profile-status" role="status" aria-live="polite"></p><div class="profile-results"></div>
        <div class="dialog-actions"><button class="profile-close">${wx('Schließen / Abbrechen','Close / Cancel')}</button><button class="profile-run">${wx('Analysieren','Analyze')}</button><label>${wx('Berichtsformat','Report format')} <select class="profile-format"><option value="json">JSON</option><option value="csv">CSV (Excel)</option></select></label><button class="profile-export" disabled>${wx('Bericht exportieren','Export report')}</button></div>`;
    const status=dialog.querySelector('.profile-status'), resultBox=dialog.querySelector('.profile-results');
    const coverage=dialog.querySelector('.profile-coverage'), nested=dialog.querySelector('.profile-nested');
    const scope=dialog.querySelector('.profile-scope'), run=dialog.querySelector('.profile-run'), save=dialog.querySelector('.profile-export');
    scope.value = recordKey !== null ? 'records' : 'document';
    function updateScopeHint() {
        dialog.querySelector('.profile-scope-hint').textContent = scope.value === 'document' && recordKey !== null
            ? wx('Hier wird nur das äußere Objekt geprüft. Für die einzelnen Einträge bitte „Datensätze: ' + recordKey + '“ wählen.', 'This only checks the outer object. Choose “Records: ' + recordKey + '” to analyze its entries.')
            : scope.value === 'records' ? `${source[recordKey].length.toLocaleString()} ${wx('Datensätze unter','records under')} ${recordKey}` : '';
    }
    updateScopeHint();
    let cancelled=false, report=null;
    function close() { cancelled=true;dialog.close();dialog.remove(); }
    dialog.querySelector('.profile-close').onclick=close;
    dialog.oncancel=event=>{event.preventDefault();close();};
    nested.onchange=coverage.onchange=scope.onchange=()=>{report=null;save.disabled=true;resultBox.replaceChildren();status.textContent='';updateScopeHint();};
    run.onclick=async()=>{
        run.disabled=true;scope.disabled=true;coverage.disabled=true;nested.disabled=true;save.disabled=true;report=null;resultBox.replaceChildren();
        status.textContent=wx('Analyse läuft…','Analyzing…');
        try {
            await new Promise(resolve=>setTimeout(resolve,16));
            if (cancelled) return;
            const target=scope.value==='selected'?selected:scope.value==='records'?source[recordKey]:source;
            // Avoid enumerating a known multi-million-field object even for a sample.
            if (target && typeof target==='object' && !Array.isArray(target) && JsonCore.sortedKeys(target).length>100000)
                throw new Error(wx('Dieses Objekt ist zu breit. Bitte einen kleineren Knoten oder ein Array mit Datensätzen auswählen.','This object is too wide. Select a smaller node or an array of records.'));
            const result=await WorkspaceCore.profileData(target,{nested:nested.checked,maxRecords:coverage.value==='all'?Infinity:10000,cancelled:()=>cancelled,
                progress:(count,total)=>{status.textContent=`${count.toLocaleString()} / ${total.toLocaleString()}`;}});
            if (cancelled) return;
            report={file:sourceName,scope:scope.value,recordField:scope.value==='records'?recordKey:null,createdAt:new Date().toISOString(),...result};
            status.textContent=`${result.analyzedRecords.toLocaleString()} / ${result.totalRecords.toLocaleString()} ${wx('Datensätze analysiert','records analyzed')}${result.sampled?wx(' — Stichprobe, keine Gesamtprüfung',' — sample, not a full audit'):''}${result.fieldsLimited?wx(' — Feldauswahl auf 200 begrenzt',' — fields limited to 200'):''}${result.depthLimited?wx(' — Tiefe auf 20 begrenzt',' — depth limited to 20'):''}`;
            const table=document.createElement('table');table.className='profile-table';
            const header=table.createTHead().insertRow();
            for(const title of [wx('Feld','Field'),wx('Typen / Anzahl','Types / Count'),wx('Fehlend','Missing'),'null',wx('Leerstring','Empty string'),wx('Eindeutig / Wiederholungen¹','Distinct / Repetitions¹'),'Min / Max / Ø',wx('Häufigste Werte¹','Most frequent values¹')]) {
                const th=document.createElement('th');th.textContent=title;header.append(th);
            }
            const body=table.createTBody();
            for(const field of result.fields) {
                const row=body.insertRow();if(field.mixedTypes) row.className='profile-mixed';
                const numeric=field.numeric;
                const values=[field.recordValue?wx('[Datensatzwert]','[Record value]'):field.field,Object.entries(field.types).map(([type,count])=>`${type}: ${count}`).join(', ')+(field.mixedTypes?wx(' ⚠ gemischt',' ⚠ mixed'):''),field.missing,field.nulls,field.emptyStrings,
                    field.present === (field.types.object||0)+(field.types.array||0) ? '—' : field.valuesLimited?wx('nicht ermittelt (Limit)','not determined (limit)'):`${field.distinctScalars} / ${field.duplicateScalars}`,
                    numeric.count?`${numeric.min} / ${numeric.max} / ${numeric.mean}`:'—',
                    field.topValues.map(v=>`${JSON.stringify(v.value)} (${v.count}×)`).join('; ')||'—'];
                for(const value of values) row.insertCell().textContent=String(value);
            }
            resultBox.append(table);
            const note=document.createElement('p');note.textContent=wx('¹ Nur skalare Werte, einschließlich null. Wiederholungen zählen jedes zusätzliche Vorkommen. Ab mehr als 1.000 verschiedenen Werten oder Texten über 500 Zeichen werden diese Kennzahlen ausgelassen. Alle Angaben beziehen sich auf die analysierten Datensätze.','¹ Scalar values only, including null. Repetitions count each additional occurrence. These metrics are omitted above 1,000 distinct values or for text longer than 500 characters. All metrics refer to analyzed records.');resultBox.append(note);
            save.disabled=false;
        } catch(error) { if(!cancelled) status.textContent=error.message; }
        finally { if(!cancelled) {run.disabled=false;scope.disabled=false;coverage.disabled=false;nested.disabled=false;} }
    };
    save.onclick=async()=>{
        if(!report) return;
        save.disabled=true;
        try {
            const format=dialog.querySelector('.profile-format').value;
            const text=format==='csv'?WorkspaceCore.profileCsv(report,currentLang):JSON.stringify(report,null,2);
            await writeExport(text,sourceName.replace(/\.(json|jsonl|ndjson)$/i,'')+'-profile.'+format,format);
        }
        catch(error) {if(!cancelled) status.textContent=error.message;}
        finally {if(!cancelled) save.disabled=false;}
    };
    document.body.append(dialog);dialog.showModal();
}
byId('btnDataProfile').onclick=showDataProfile;

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

let smartDiffFileName = '', smartDiffResult = null, smartDiffLeft = null, smartDiffRight = null;
function dataPath(segments) {
    let path = 'root';
    for (const segment of segments) path = typeof segment === 'number' ? `${path}[${segment}]` : appendPath(path, segment);
    return path;
}
function smartDiffValue(value) {
    if (value === undefined) return wx('(fehlt)','(missing)');
    const text = JSON.stringify(value, null, 2);
    return text.length > 1200 ? text.slice(0,1200) + '…' : text;
}
function showSmartDiffView() {
    if (!allowDocumentFeature()) return;
    if (jsonData === undefined) return;
    byId('diffOverlay').classList.add('visible'); byId('diffModal').classList.add('visible');
    if (diffSecondData) prepareSmartDiff();
    else { byId('diffResults').innerHTML = `<div class="smart-diff-empty">${wx('Bitte eine zweite JSON-Datei laden.','Load a second JSON file.')}</div>`; byId('diffSummary').textContent = ''; }
}
function hideSmartDiffView() { byId('diffOverlay').classList.remove('visible'); byId('diffModal').classList.remove('visible'); }
function prepareSmartDiff() {
    smartDiffLeft = WorkspaceCore.findRecordArray(jsonData); smartDiffRight = WorkspaceCore.findRecordArray(diffSecondData);
    const select = byId('diffKeyField'), previous = select.value; select.replaceChildren(new Option(wx('Schlüsselfeld wählen…','Choose key field…'),''));
    if (!smartDiffLeft || !smartDiffRight) {
        byId('diffResults').innerHTML = `<div class="smart-diff-empty">${wx('Beide Dateien müssen ein Array mit Objekten enthalten.','Both files must contain an array of objects.')}</div>`;
        byId('diffSummary').textContent = ''; return;
    }
    const leftFields = new Set(WorkspaceCore.comparisonFields(smartDiffLeft.rows));
    const common = WorkspaceCore.comparisonFields(smartDiffRight.rows).filter(field => leftFields.has(field));
    common.forEach(field => select.add(new Option(field,field)));
    const preferred = ['id','ID','uuid','hostname','name'].find(field => common.includes(field));
    select.value = common.includes(previous) ? previous : preferred || '';
    byId('diffResults').innerHTML = `<div class="smart-diff-empty">${wx('Schlüsselfeld wählen und Vergleich starten. Die Reihenfolge der Datensätze spielt keine Rolle.','Choose a key field and start comparison. Record order does not matter.')}</div>`;
    byId('diffSummary').textContent = `${fileName || 'JSON'} ⇔ ${smartDiffFileName || wx('zweite Datei','second file')} · ${smartDiffLeft.rows.length} / ${smartDiffRight.rows.length} ${wx('Datensätze','records')}`;
    if (select.value) runSmartDiff();
}
async function loadSmartDiffFile() {
    try {
        let data, name;
        if (window.__TAURI__) {
            const selected = await window.__TAURI__.dialog.open({multiple:false,filters:[{name:'JSON',extensions:['json','jsonl','ndjson','txt']}]});
            if (!selected) return;
            const path = Array.isArray(selected) ? selected[0] : selected;
            byId('diffSummary').textContent = wx('Vergleichsdatei wird geladen…','Loading comparison file…');
            const result = await readFileContent(path); data = parseJSON(result.text); name = getFileName(path);
        } else {
            const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.jsonl,.ndjson,.txt';
            const file = await new Promise(resolve => { input.onchange = event => resolve(event.target.files[0] || null); input.click(); });
            if (!file) return; data = parseJSON(await file.text()); name = file.name;
        }
        diffSecondData = data; smartDiffFileName = name; smartDiffResult = null; prepareSmartDiff();
    } catch (error) { showNotification(`${wx('Vergleichsdatei konnte nicht geladen werden','Could not load comparison file')}: ${error.message || error}`,'error',5000); }
}
function runSmartDiff() {
    if (!allowDocumentFeature()) return;
    if (!smartDiffLeft || !smartDiffRight) return;
    const key = byId('diffKeyField').value;
    if (!key) { showNotification(wx('Bitte ein Schlüsselfeld wählen.','Choose a key field.')); return; }
    const ignored = byId('diffIgnoreFields').value.split(',').map(value => value.trim()).filter(Boolean);
    smartDiffResult = WorkspaceCore.keyedCompare(smartDiffLeft.rows,smartDiffRight.rows,key,ignored);
    renderSmartDiffResults();
}
function renderSmartDiffResults() {
    const container = byId('diffResults'); container.replaceChildren();
    if (!smartDiffResult) return;
    if (smartDiffResult.duplicates.length) {
        const error = document.createElement('div'); error.className = 'smart-diff-empty';
        error.textContent = `${wx('Schlüsselfeld ist nicht eindeutig. Doppelte Werte','Key field is not unique. Duplicate values')}: ${smartDiffResult.duplicates.slice(0,10).map(String).join(', ')}`; container.append(error); return;
    }
    const changedRecords = smartDiffResult.records.filter(record => record.status !== 'unchanged');
    const counts = {added:0,removed:0,changed:0,unchanged:0}; smartDiffResult.records.forEach(record => counts[record.status]++);
    byId('diffSummary').textContent = `${counts.changed} ${wx('geändert','changed')} · ${counts.added} ${wx('hinzugefügt','added')} · ${counts.removed} ${wx('entfernt','removed')} · ${counts.unchanged} ${wx('unverändert','unchanged')} · ${smartDiffResult.missing.left.length + smartDiffResult.missing.right.length} ${wx('ohne Schlüssel','without key')}`;
    if (!changedRecords.length) { const empty = document.createElement('div'); empty.className = 'smart-diff-empty'; empty.textContent = wx('Keine Unterschiede gefunden.','No differences found.'); container.append(empty); return; }
    const visible = changedRecords.slice(0,2000);
    visible.forEach((record, recordIndex) => {
        const box = document.createElement('section'); box.className = `diff-record diff-record-${record.status}`;
        const header = document.createElement('div'); header.className = 'diff-record-header';
        const key = document.createElement('span'); key.className = 'diff-record-key'; key.textContent = `${byId('diffKeyField').value} = ${smartDiffValue(record.key)}`;
        const badge = document.createElement('span'); badge.className = 'diff-badge'; badge.textContent = record.status === 'added' ? wx('nur rechts','right only') : record.status === 'removed' ? wx('nur links','left only') : `${record.changes.length} ${wx('Änderungen','changes')}`;
        header.append(key,badge);
        if (record.status !== 'changed') {
            const apply = document.createElement('button'); apply.className = 'diff-apply'; apply.textContent = record.status === 'added' ? wx('Datensatz übernehmen','Add record') : wx('Datensatz entfernen','Remove record');
            apply.onclick = () => applySmartDiffChange(record,null); header.append(apply);
        }
        box.append(header);
        record.changes.forEach(change => {
            const row = document.createElement('div'); row.className = 'diff-field';
            const path = document.createElement('div'); path.className = 'diff-field-path'; path.textContent = change.path || wx('(Datensatz)','(record)');
            const left = document.createElement('div'); left.className = 'diff-value'; left.textContent = smartDiffValue(change.left);
            const arrow = document.createElement('div'); arrow.className = 'diff-arrow'; arrow.textContent = '←';
            const right = document.createElement('div'); right.className = 'diff-value'; right.textContent = smartDiffValue(change.right);
            const apply = document.createElement('button'); apply.className = 'diff-apply'; apply.textContent = wx('Übernehmen','Apply'); apply.onclick = () => applySmartDiffChange(record,change);
            row.append(path,left,arrow,right,apply); box.append(row);
        });
        container.append(box);
    });
    if (changedRecords.length > visible.length) { const more = document.createElement('div'); more.className = 'smart-diff-empty'; more.textContent = `${changedRecords.length-visible.length} ${wx('weitere Unterschiede werden aus Performancegründen nicht dargestellt.','more differences are not shown for performance reasons.')}`; container.append(more); }
}
function applySmartDiffChange(record, change) {
    if (!smartDiffLeft || !smartDiffRight) return;
    const arrayPath = dataPath(smartDiffLeft.path);
    if (record.status === 'added') {
        saveUndoState(arrayPath); smartDiffLeft.rows.push(JSON.parse(JSON.stringify(smartDiffRight.rows[record.rightIndex])));
    } else if (record.status === 'removed') {
        saveUndoState(arrayPath); smartDiffLeft.rows.splice(record.leftIndex,1);
    } else {
        const target = smartDiffLeft.rows[record.leftIndex], recordPath = `${arrayPath}[${record.leftIndex}]`;
        saveUndoState(recordPath);
        let parent = target;
        for (const segment of change.segments.slice(0,-1)) {
            if (!Object.hasOwn(parent,segment) || !parent[segment] || typeof parent[segment] !== 'object') JsonCore.define(parent,segment,{});
            parent = parent[segment];
        }
        const last = change.segments.at(-1);
        if (change.right === undefined) delete parent[last]; else JsonCore.define(parent,last,JSON.parse(JSON.stringify(change.right)));
    }
    markModified(); updateUndoButtons(); renderTree(); stashDocument();
    smartDiffLeft = WorkspaceCore.findRecordArray(jsonData); runSmartDiff();
    showNotification(wx('Änderung übernommen.','Change applied.'));
}
byId('btnDiff').onclick = showSmartDiffView;
byId('btnDiffClose').onclick = hideSmartDiffView;
byId('diffOverlay').onclick = hideSmartDiffView;
byId('btnDiffLoad').onclick = loadSmartDiffFile;
byId('btnDiffRun').onclick = runSmartDiff;
byId('diffKeyField').onchange = () => { if (byId('diffKeyField').value) runSmartDiff(); };

let transformResult = null, transformResultOptions = null;
function transformSelectionAvailable() {
    return typeof selectedPath === 'string' && selectedPath !== 'root' && getValueAtPath(selectedPath) !== undefined;
}
function invalidateTransformPreview() {
    cancelTransform();
    transformResult = null; transformResultOptions = null;
    byId('btnTransformApply').disabled = false; byId('btnTransformNewTab').disabled = false;
    byId('transformSummary').textContent = wx('Noch keine Vorschau erstellt.','No preview generated yet.');
    byId('transformPreview').textContent = wx('Die Vorschau zeigt maximal 12.000 Zeichen.','The preview shows up to 12,000 characters.');
}
function transformOptions() {
    return { operation: byId('transformOperation').value, scope: byId('transformScope').value,
        separator: byId('transformSeparator').value, arrays: byId('transformArrays').value };
}
function transformSource(options) {
    if (options.scope === 'selected') {
        if (!transformSelectionAvailable()) throw new Error(wx('Bitte zuerst einen Knoten auswählen.','Select a node first.'));
        return getValueAtPath(selectedPath);
    }
    return jsonData;
}
let transformWorker = null, transformGeneration = 0, transformPending = null, transformBusy = false;
function setTransformBusy(busy) {
    transformBusy = busy;
    for (const id of ['btnTransformPreview','btnTransformApply','btnTransformNewTab','transformOperation','transformScope','transformSeparator','transformArrays']) byId(id).disabled = busy;
    if (!busy) byId('transformArrays').disabled = byId('transformOperation').value === 'unflatten';
    if (!busy) byId('transformScope').querySelector('option[value="selected"]').disabled = !transformSelectionAvailable();
}
function cancelTransform() {
    transformGeneration++;
    if (transformWorker) { transformWorker.terminate(); transformWorker = null; }
    transformPending?.(); transformPending = null;
    setTransformBusy(false);
}
async function buildTransformResult(previewOnly = false) {
    cancelTransform();
    const generation = transformGeneration;
    const options = transformOptions();
    const source = previewOnly ? boundedTransformSample(transformSource(options)).value : transformSource(options);
    const started = performance.now();
    setTransformBusy(true);
    byId('transformSummary').textContent = wx('Transformation läuft… Abbrechen ist jederzeit möglich.', 'Transforming… You can cancel at any time.');
    // Paint the busy state before structured cloning the input for the worker.
    await new Promise(resolve => setTimeout(resolve, 30));
    if (generation !== transformGeneration) return null;
    if (options.operation === 'flatten') {
        try {
            const result = await WorkspaceCore.flattenDataAsync(source, options, {
                indexKeys: (value, keys) => JsonCore.seedKeys(value, keys),
                cancelled: () => generation !== transformGeneration,
                progress: count => { byId('transformSummary').textContent = `${count.toLocaleString()} ${wx('Schritte verarbeitet – Abbrechen möglich', 'steps processed – cancellation available')}`; }
            });
            if (generation !== transformGeneration) return null;
            if (!previewOnly) {
                byId('transformSummary').textContent = wx('Anzeige wird vorbereitet…', 'Preparing display…');
                await prepareTransformTree(result, () => generation !== transformGeneration);
                if (generation !== transformGeneration) return null;
            }
            const sample = previewOnly ? boundedTransformSample(result) : {text:'',clipped:false};
            return {result, options, preview: sample.text, clipped: sample.clipped, extent: Array.isArray(result) ? result.length : 1, elapsed: performance.now() - started};
        } catch (error) { if (generation !== transformGeneration) return null; throw error; }
        finally { if (generation === transformGeneration) setTransformBusy(false); }
    }
    return new Promise((resolve, reject) => {
        const worker = new Worker('transform-worker.js');
        transformWorker = worker; transformPending = () => resolve(null);
        const finish = () => { worker.terminate(); if (transformWorker === worker) { transformWorker = null; transformPending = null; setTransformBusy(false); } };
        worker.onmessage = ({data}) => {
            if (generation !== transformGeneration) { finish(); resolve(null); return; }
            if (data.error) { finish(); reject(new Error(data.error)); return; }
            finish(); resolve({ result: data.result, preview: data.preview, clipped: data.clipped, extent: data.extent, options, elapsed: performance.now() - started });
        };
        worker.onerror = event => { finish(); reject(new Error(event.message || 'Transformation fehlgeschlagen')); };
        try { worker.postMessage({ source, options }); }
        catch (error) { finish(); reject(error); }
    });
}
async function prepareTransformTree(root, cancelled) {
    if (root === null || typeof root !== 'object') return;
    const frame = value => ({value, keys: Array.isArray(value) ? null : JsonCore.sortedKeys(value), i: 0, size: 1, counts: [1]});
    const stack = [frame(root)];
    let until = performance.now() + 8;
    while (stack.length) {
        if (performance.now() >= until) {
            await new Promise(resolve => setTimeout(resolve, 0));
            if (cancelled()) throw new Error('Transformation abgebrochen');
            until = performance.now() + 8;
        }
        const f = stack[stack.length - 1], count = f.keys ? f.keys.length : f.value.length;
        if (f.i < count) {
            const child = f.value[f.keys ? f.keys[f.i++] : f.i++];
            if (child !== null && typeof child === 'object') stack.push(frame(child));
            else { f.size++; f.counts[1] = (f.counts[1] || 0) + 1; }
        } else {
            let sum = 0;
            const ds = f.counts.map(n => sum += n || 0);
            f.value[nodeSizeSymbol] = f.size; f.value[nodeDepthsSymbol] = ds;
            stack.pop();
            if (stack.length) {
                const parent = stack[stack.length - 1]; parent.size += f.size;
                for (let d = 0; d < f.counts.length; d++) parent.counts[d+1] = (parent.counts[d+1] || 0) + (f.counts[d] || 0);
            }
        }
    }
}
function boundedTransformSample(value) {
    let budget = 300, clipped = false;
    function sample(value, depth = 0) {
        if (--budget <= 0 || depth > 25) { clipped = true; return '…'; }
        if (typeof value === 'string' && value.length > 500) { clipped = true; return value.slice(0,500) + '…'; }
        if (value === null || typeof value !== 'object') return value;
        const result = Array.isArray(value) ? [] : {};
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                if (budget <= 0) { clipped = true; break; }
                result.push(sample(value[i], depth + 1));
            }
            return result;
        }
        for (const key in value) if (Object.hasOwn(value,key)) {
            if (budget <= 0) { clipped = true; break; }
            Object.defineProperty(result,key,{value:sample(value[key],depth+1),enumerable:true});
        }
        return result;
    }
    const sampled = sample(value), text = JSON.stringify(sampled,null,2);
    return {value:sampled,text:text.slice(0,12000),clipped:clipped || text.length > 12000};
}
function showTransform() {
    const scope = byId('transformScope'), selected = scope.querySelector('option[value="selected"]');
    selected.disabled = !transformSelectionAvailable();
    if (selected.disabled && scope.value === 'selected') scope.value = 'document';
    byId('transformArrays').disabled = byId('transformOperation').value === 'unflatten';
    invalidateTransformPreview(); byId('transformModal').showModal();
}
function hideTransform() {
    cancelTransform();
    const dialog = byId('transformModal'); if (dialog.open) dialog.close();
    transformResult = null; transformResultOptions = null;
}
async function previewTransform() {
    try {
        invalidateTransformPreview();
        const generated = await buildTransformResult(true);
        if (!generated) return;
        // A sample must never become the result used by Apply or New Tab.
        byId('transformPreview').textContent = generated.preview;
        byId('transformSummary').textContent = wx('Stichprobe: maximal 300 Werte, gekürzte Texte und Tiefe. Keine vollständige Prüfung. Die Aktionen verarbeiten das gesamte gewählte Ziel.', 'Sample: up to 300 values, shortened text and depth. Not a full validation. Actions process the entire selected scope.');
        byId('btnTransformApply').disabled = false; byId('btnTransformNewTab').disabled = false;
    } catch (error) {
        invalidateTransformPreview(); showNotification(error.message || String(error), 'error', 5000);
    }
}
async function ensureCurrentTransformResult() {
    if (transformBusy) return false;
    try {
        const generated = await buildTransformResult();
        if (!generated) return false;
        transformResult = generated.result; transformResultOptions = generated.options;
        return true;
    } catch (error) {
        invalidateTransformPreview();
        showNotification(error.message || String(error), 'error', 5000);
        return false;
    }
}
async function applyTransform() {
    if (!(await ensureCurrentTransformResult())) return;
    const path = transformResultOptions.scope === 'selected' ? selectedPath : 'root';
    // The transformed tree is independent. Keep the detached original as the undo
    // snapshot instead of serializing hundreds of megabytes on the window thread.
    undoStack.push({path, snapshot: getValueAtPath(path)});
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    const prepared = transformResultOptions.operation === 'flatten';
    setValueAtPath(path, transformResult, prepared);
    if (prepared && path === 'root') {
        metadataDirty = false;
        totalExpandedCount = metadataSize(jsonData) || 1;
        maxDepth = (metadataDepths(jsonData)?.length || 1) - 1;
        expandedPaths = new Set(['root']); expandAllMode = false;
        window._collapsedInExpandAll = new Set(); scrollTop = 0;
    }
    updateUndoButtons(); renderTree(); stashDocument();
    const label = transformResultOptions.operation === 'flatten' ? 'Flatten' : 'Unflatten';
    hideTransform(); showNotification(`${label}: ${wx('Transformation angewendet.','transformation applied.')}`);
}
async function openTransformInNewTab() {
    if (!(await ensureCurrentTransformResult())) return;
    const result = transformResult, options = transformResultOptions;
    const base = (fileName || 'data.json').replace(/\.json$/i, '');
    const name = `${base}-${options.operation}.json`;
    hideTransform();
    try {
        await queueDocumentOperation(async () => {
            const started = performance.now();
            await finalizeLoad({ jsonData: result, name, fileSize: options.scope === 'document' ? fileSize : 0,
                prepared: options.operation === 'flatten', nodeCount: 0, parseTime: performance.now() - started, wasConcatenated: false, indent: '  ', crlf: false }, null, started);
            isModified = true; updateTitle(); stashDocument(); renderDocumentTabs();
        });
        showNotification(wx('Transformation in neuem Tab geöffnet.','Transformation opened in a new tab.'));
    } catch (error) { showNotification(error.message || String(error), 'error', 5000); }
}
byId('btnTransform').onclick = showTransform;
byId('btnTransformCancel').onclick = hideTransform;
byId('btnTransformPreview').onclick = previewTransform;
byId('btnTransformApply').onclick = applyTransform;
byId('btnTransformNewTab').onclick = openTransformInNewTab;
for (const id of ['transformOperation','transformScope','transformSeparator','transformArrays']) {
    byId(id).onchange = () => { byId('transformArrays').disabled = byId('transformOperation').value === 'unflatten'; invalidateTransformPreview(); };
}
byId('transformModal').oncancel = event => { event.preventDefault(); hideTransform(); };
document.addEventListener('keydown', event => { if (event.key === 'Escape' && byId('transformModal').open) hideTransform(); });

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

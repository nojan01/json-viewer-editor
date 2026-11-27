(() => {
    const lines = [];
    const originalInvoke = window.__TAURI__?.core?.invoke;
    const panel = document.getElementById('diagnosticPanel');
    const log = document.getElementById('diagnosticLog');
    let previousFocus;
    window.showDiagnostics = () => {
        if (!panel.hidden) return;
        previousFocus = document.activeElement;
        panel.hidden = false;
        log.scrollTop = log.scrollHeight;
        log.focus();
    };
    document.getElementById('closeDiagnostics').addEventListener('click', () => {
        panel.hidden = true;
        previousFocus?.focus();
    });
    const save = document.getElementById('saveDiagnostics');
    const saveStatus = document.getElementById('diagnosticSaveStatus');
    save.addEventListener('click', async () => {
        save.disabled = true;
        saveStatus.hidden = true;
        try {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const path = await originalInvoke('choose_save_path', {
                defaultPath: 'json-viewer-diagnose-' + stamp + '.txt',
                filters: [{ name: 'Diagnoseprotokoll', extensions: ['txt'] }]
            });
            if (!path) return;
            await originalInvoke('write_export_text', {path, content: lines.join('\n') + '\n'});
            saveStatus.textContent = 'Protokoll gespeichert.';
            saveStatus.hidden = false;
        } catch (error) {
            saveStatus.textContent = 'Protokoll konnte nicht gespeichert werden: ' + String(error);
            saveStatus.hidden = false;
        } finally {
            save.disabled = false;
        }
    });

    window.diag = message => {
        const line = new Date().toISOString() + ' ' + String(message);
        lines.push(line);
        const follow = log.scrollHeight - log.scrollTop - log.clientHeight <= 4;
        log.append(line + '\n');
        if (follow) log.scrollTop = log.scrollHeight;
        if (originalInvoke) originalInvoke('diagnostic_event', {event:line}).catch(() => {});
    };
    window.addEventListener('error', event => {
        diag('JS ERROR ' + event.message + ' at ' + event.filename?.split('/').pop() + ':' + event.lineno);
    });
    window.addEventListener('unhandledrejection', event => {
        diag('UNHANDLED ' + (event.reason?.name || typeof event.reason));
    });
    document.addEventListener('securitypolicyviolation', event => diag('CSP ' + event.violatedDirective + ' blocked=' + event.blockedURI));
    if (originalInvoke) {
        try {
            window.__TAURI__.core.invoke = async (command, ...args) => {
                diag('IPC begin ' + command);
                try {
                    const result = await originalInvoke(command,...args);
                    diag('IPC done ' + command + ' type=' + (result === null ? 'null' : Array.isArray(result) ? 'array' : typeof result));
                    return result;
                } catch (error) { diag('IPC failed ' + command + ' error=' + (error?.name || typeof error)); throw error; }
            };
        } catch (error) { diag('IPC wrapper unavailable ' + error.name); }
    }
    document.addEventListener('click', event => diag('click ' + (event.target.closest('button')?.id || event.target.tagName)),true);
    new MutationObserver(() => diag('body inert=' + document.body.inert)).observe(document.body,{attributes:true,attributeFilter:['inert']});
    originalInvoke?.('graphics_mode').then(mode => diag('Grafikmodus: ' + (mode === 'compatible' ? 'Kompatibel' : 'Standard'))).catch(() => {});
    diag('bootstrap readyState=' + document.readyState + ' ipc=' + !!originalInvoke);
})();

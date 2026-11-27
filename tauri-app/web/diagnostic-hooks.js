(() => {
    for (const name of ['initSettings','initMinimapEvents','initUIEventListeners','initWindowStateTracking','openFile','loadFileFromPath','readAndParseFile','finalizeLoad','initializeWorkspace']) {
        const original = window[name];
        if (typeof original !== 'function') { diag('missing function ' + name); continue; }
        window[name] = function(...args) {
            diag('begin ' + name);
            try {
                const result = original.apply(this,args);
                if (result?.then) return result.then(value => { diag('done ' + name); return value; },error => { diag('failed ' + name + ' ' + error?.name); throw error; });
                diag('done ' + name); return result;
            } catch (error) { diag('failed ' + name + ' ' + error?.name); throw error; }
        };
    }
    document.addEventListener('DOMContentLoaded',() => diag('DOMContentLoaded reached'));
    diag('hooks installed');
    function snapshot() {
        for (const id of ['treeContainer','virtualContent','helpModal','helpOverlay']) {
            const el = document.getElementById(id);
            if (!el) { diag('DOM missing '+id); continue; }
            const css = getComputedStyle(el), rect = el.getBoundingClientRect();
            diag('DOM '+id+' class='+el.className+' children='+el.children.length+' display='+css.display+' visibility='+css.visibility+' opacity='+css.opacity+' rect='+[rect.x,rect.y,rect.width,rect.height].map(Math.round).join(','));
        }
    }
    document.addEventListener('click', () => setTimeout(snapshot,100));
    setTimeout(snapshot,4000);
    setTimeout(snapshot,15000);
})();

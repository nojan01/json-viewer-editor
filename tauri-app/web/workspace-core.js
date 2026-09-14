/* Pure operations for table views, masked copies and workspace persistence. */
(function (root) {
    'use strict';
    function matchesFilter(value, rule) {
        const text = rule.value ?? '';
        switch (rule.op) {
            case 'missing': return value === undefined;
            case 'null': return value === null;
            case 'empty': return value === undefined || value === null || value === '';
            case 'contains': return value != null && String(value).toLocaleLowerCase().includes(text.toLocaleLowerCase());
            case 'eq': case 'ne': {
                let expected;
                try { expected = JSON.parse(text); } catch { expected = text; }
                const equal = value !== undefined && JSON.stringify(value) === JSON.stringify(expected);
                return rule.op === 'eq' ? equal : !equal;
            }
            case 'gt': case 'gte': case 'lt': case 'lte': {
                if (typeof value !== 'number' || !text.trim() || !Number.isFinite(Number(text))) return false;
                const n = Number(text);
                return rule.op === 'gt' ? value > n : rule.op === 'gte' ? value >= n : rule.op === 'lt' ? value < n : value <= n;
            }
            default: return true;
        }
    }
    function filterRows(rows, rules) {
        return rows.filter(row => rules.every(rule => matchesFilter(Object.hasOwn(row, rule.column) ? row[rule.column] : undefined, rule)));
    }
    function fieldNames(data) {
        const names = new Set(), stack = [data];
        while (stack.length) {
            const value = stack.pop();
            if (value === null || typeof value !== 'object') continue;
            for (const key of Object.keys(value)) {
                if (!Array.isArray(value)) names.add(key);
                if (value[key] !== null && typeof value[key] === 'object') stack.push(value[key]);
            }
        }
        return [...names].sort((a, b) => a.localeCompare(b));
    }
    // Uses JSON's replacer: matching objects/arrays are replaced as a whole.
    // Never mutates source data or serializes it to an intermediate unmasked copy.
    // A separate root flag also handles an actual object field named "" correctly.
    function serializeMasked(data, keys, replacement = '[MASKIERT]', indent = 2) {
        const selected = new Set(keys);
        let first = true, count = 0;
        const text = JSON.stringify(data, function (key, value) {
            if (first) { first = false; return value; }
            if (!Array.isArray(this) && selected.has(key)) { count++; return replacement; }
            return value;
        }, indent);
        return { text, count };
    }
    function safeView(view = {}) {
        return {
            scrollTop: Number.isFinite(view.scrollTop) ? Math.max(0, view.scrollTop) : 0,
            expanded: Array.isArray(view.expanded) ? view.expanded.filter(p => typeof p === 'string').slice(0, 500) : ['root'],
            expandAllMode: view.expandAllMode === true,
            depth: Number.isInteger(view.depth) && view.depth > 0 ? view.depth : null,
            collapsed: Array.isArray(view.collapsed) ? view.collapsed.filter(p => typeof p === 'string').slice(0, 500) : [],
            selectedPath: typeof view.selectedPath === 'string' ? view.selectedPath : null
        };
    }
    const api = { matchesFilter, filterRows, fieldNames, serializeMasked, safeView };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.WorkspaceCore = api;
})(globalThis);

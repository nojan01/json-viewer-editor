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
    function safeSavedViews(value) {
        if (!Array.isArray(value)) return [];
        const names = new Set(), result = [];
        for (const item of value.slice(0, 50)) {
            const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 80) : '';
            if (!name || names.has(name)) continue;
            names.add(name);
            const strings = input => Array.isArray(input) ? input.filter(v => typeof v === 'string').slice(0, 500) : [];
            const rules = Array.isArray(item.rules) ? item.rules.filter(rule =>
                rule && typeof rule.column === 'string' && typeof rule.op === 'string' && typeof rule.value === 'string'
            ).slice(0, 200).map(rule => ({ column: rule.column, op: rule.op, value: rule.value })) : [];
            const tree = item.tree && typeof item.tree === 'object' ? {
                expanded: strings(item.tree.expanded), collapsed: strings(item.tree.collapsed),
                expandAllMode: item.tree.expandAllMode === true,
                expandDepth: Number.isInteger(item.tree.expandDepth) && item.tree.expandDepth > 0 ? item.tree.expandDepth : null,
                level: Number.isInteger(item.tree.level) && item.tree.level > 0 ? item.tree.level : 1,
                lineNumbers: item.tree.lineNumbers === true, minimap: item.tree.minimap === true,
                indentGuides: item.tree.indentGuides !== false
            } : null;
            result.push({ name, columns: strings(item.columns), hidden: strings(item.hidden), pinned: strings(item.pinned), rules,
                filter: typeof item.filter === 'string' ? item.filter.slice(0, 1000) : '',
                jsonPath: typeof item.jsonPath === 'string' ? item.jsonPath.slice(0, 2000) : '',
                sortColumn: typeof item.sortColumn === 'string' ? item.sortColumn : null, sortAscending: item.sortAscending !== false, tree });
        }
        return result;
    }
    function applySavedView(view, availableColumns) {
        const columns = [...new Set((availableColumns || []).filter(v => typeof v === 'string'))];
        const known = new Set(columns), preferred = (view?.columns || []).filter(c => known.has(c));
        const order = [...preferred, ...columns.filter(c => !preferred.includes(c))];
        return {
            columns: order,
            hidden: (view?.hidden || []).filter(c => known.has(c)),
            pinned: (view?.pinned || []).filter(c => known.has(c)),
            rules: (view?.rules || []).filter(rule => known.has(rule.column)),
            filter: typeof view?.filter === 'string' ? view.filter : '',
            jsonPath: typeof view?.jsonPath === 'string' ? view.jsonPath : '',
            sortColumn: known.has(view?.sortColumn) ? view.sortColumn : null,
            sortAscending: view?.sortAscending !== false
        };
    }
    function getField(object, field) {
        if (!object || typeof object !== 'object') return undefined;
        const parts = String(field).split('.').filter(Boolean);
        let value = object;
        for (const part of parts) {
            if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
            value = value[part];
        }
        return value;
    }
    function comparisonFields(rows, limit = 200) {
        const fields = new Set();
        const visit = (value, prefix, depth) => {
            if (value === null || typeof value !== 'object' || Array.isArray(value) || depth > 3) return;
            for (const key of Object.keys(value)) {
                const path = prefix ? `${prefix}.${key}` : key, child = value[key];
                if (child === null || typeof child !== 'object') fields.add(path);
                else if (!Array.isArray(child)) visit(child, path, depth + 1);
                if (fields.size >= limit) return;
            }
        };
        for (const row of (rows || []).slice(0, 100)) { visit(row, '', 0); if (fields.size >= limit) break; }
        return [...fields].sort((a, b) => a.localeCompare(b));
    }
    function findRecordArray(data, depth = 0, path = []) {
        if (depth > 6 || data === null || typeof data !== 'object') return null;
        if (Array.isArray(data) && data.some(item => item && typeof item === 'object' && !Array.isArray(item))) return { rows: data, path };
        for (const key of Object.keys(data)) {
            const found = findRecordArray(data[key], depth + 1, [...path, key]);
            if (found) return found;
        }
        return null;
    }
    function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
    function keyedCompare(leftRows, rightRows, keyField, ignoredFields = []) {
        const ignored = new Set((ignoredFields || []).map(v => String(v).trim()).filter(Boolean));
        const keyOf = row => {
            const value = getField(row, keyField);
            return value === undefined || value === null ? null : `${typeof value}:${JSON.stringify(value)}`;
        };
        const build = rows => {
            const map = new Map(), duplicates = [], missing = [];
            rows.forEach((row, index) => {
                const token = keyOf(row);
                if (token === null) { missing.push(index); return; }
                if (map.has(token)) duplicates.push(getField(row, keyField));
                else map.set(token, { row, index, value: getField(row, keyField) });
            });
            return { map, duplicates, missing };
        };
        const left = build(leftRows || []), right = build(rightRows || []);
        if (left.duplicates.length || right.duplicates.length) return { records: [], duplicates: [...left.duplicates, ...right.duplicates], missing: { left: left.missing, right: right.missing } };
        const changes = (a, b, path = [], output = []) => {
            const label = path.join('.'), last = path.at(-1);
            if (ignored.has(label) || ignored.has(last)) return output;
            if (a === b) return output;
            if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) {
                output.push({ path: label, segments: [...path], type: a === undefined ? 'added' : b === undefined ? 'removed' : 'changed', left: clone(a), right: clone(b) });
                return output;
            }
            const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
            for (const key of keys) changes(Object.hasOwn(a, key) ? a[key] : undefined, Object.hasOwn(b, key) ? b[key] : undefined, [...path, key], output);
            return output;
        };
        const tokens = new Set([...left.map.keys(), ...right.map.keys()]), records = [];
        for (const token of tokens) {
            const l = left.map.get(token), r = right.map.get(token), value = l?.value ?? r?.value;
            if (!l) records.push({ key: clone(value), status: 'added', leftIndex: null, rightIndex: r.index, changes: [] });
            else if (!r) records.push({ key: clone(value), status: 'removed', leftIndex: l.index, rightIndex: null, changes: [] });
            else {
                const fields = changes(l.row, r.row);
                records.push({ key: clone(value), status: fields.length ? 'changed' : 'unchanged', leftIndex: l.index, rightIndex: r.index, changes: fields });
            }
        }
        return { records, duplicates: [], missing: { left: left.missing, right: right.missing } };
    }
    const api = { matchesFilter, filterRows, fieldNames, serializeMasked, safeView, safeSavedViews, applySavedView,
        getField, comparisonFields, findRecordArray, keyedCompare };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.WorkspaceCore = api;
})(globalThis);

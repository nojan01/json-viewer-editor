/* Join two record arrays on a key field (inner, left or full). Pure and cooperative: work runs in short time slices. */
(function (root) {
    'use strict';
    const MODES = new Set(['inner', 'left', 'full']);
    const RESOLUTIONS = new Set(['left', 'right', 'both']);
    const SAMPLE = 10;

    function getField(object, field) {
        if (!object || typeof object !== 'object' || Array.isArray(object)) return undefined;
        let value = object;
        for (const part of String(field).split('.').filter(Boolean)) {
            if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
            value = value[part];
        }
        return value;
    }
    // Same key identity as the smart file comparison: type and JSON value, so 1 and "1" stay different.
    function keyToken(row, field) {
        const value = getField(row, field);
        if (value === undefined || value === null || typeof value === 'object') return null;
        return `${typeof value}:${JSON.stringify(value)}`;
    }
    function same(a, b) {
        if (a === b) return true;
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
        return JSON.stringify(a) === JSON.stringify(b);
    }
    function defineOwn(object, key, value) {
        Object.defineProperty(object, key, { value, enumerable: true, configurable: true, writable: true });
    }
    function slicer(cancelled) {
        let until = performance.now() + 8;
        return async () => {
            if (performance.now() < until) return;
            await new Promise(resolve => setTimeout(resolve, 0));
            if (cancelled()) throw new Error('Zusammenführen abgebrochen / Join cancelled');
            until = performance.now() + 8;
        };
    }
    async function index(rows, field, tick) {
        const map = new Map(), missing = [], duplicates = new Map();
        for (let i = 0; i < rows.length; i++) {
            const token = keyToken(rows[i], field);
            if (token === null) missing.push(i);
            else if (map.has(token)) duplicates.set(token, (duplicates.get(token) || 1) + 1);
            else map.set(token, i);
            if ((i & 1023) === 0) await tick();
        }
        return { map, missing, duplicates };
    }
    function duplicateReport(duplicates) {
        return { count: duplicates.size, sample: [...duplicates].slice(0, SAMPLE).map(([token, n]) => ({ key: JSON.parse(token.slice(token.indexOf(':') + 1)), occurrences: n })) };
    }

    async function analyzeJoin(leftRows, rightRows, keyField, { cancelled = () => false } = {}) {
        if (!Array.isArray(leftRows) || !Array.isArray(rightRows)) throw new Error('Beide Quellen müssen Arrays sein / Both sources must be arrays');
        if (!String(keyField || '').trim()) throw new Error('Kein Schlüsselfeld gewählt / No key field selected');
        const tick = slicer(cancelled);
        const left = await index(leftRows, keyField, tick), right = await index(rightRows, keyField, tick);
        const conflicts = new Map();
        let matched = 0;
        for (const [token, li] of left.map) {
            const ri = right.map.get(token);
            if (ri === undefined) continue;
            matched++;
            const l = leftRows[li], r = rightRows[ri];
            for (const field of Object.keys(r)) {
                if (!Object.hasOwn(l, field) || same(l[field], r[field])) continue;
                let entry = conflicts.get(field);
                if (!entry) conflicts.set(field, entry = { field, count: 0, example: { key: getField(l, keyField), left: l[field], right: r[field] } });
                entry.count++;
            }
            await tick();
        }
        let rightOnly = 0;
        for (const token of right.map.keys()) if (!left.map.has(token)) rightOnly++;
        return {
            keyField, matched, leftOnly: left.map.size - matched, rightOnly,
            leftRecords: leftRows.length, rightRecords: rightRows.length,
            missing: { left: left.missing.length, right: right.missing.length },
            duplicates: { left: duplicateReport(left.duplicates), right: duplicateReport(right.duplicates) },
            conflicts: [...conflicts.values()].sort((a, b) => b.count - a.count || a.field.localeCompare(b.field))
        };
    }

    function merge(l, r, resolve, suffix) {
        const out = {};
        for (const field of Object.keys(l)) defineOwn(out, field, l[field]);
        for (const field of Object.keys(r)) {
            if (!Object.hasOwn(l, field)) { defineOwn(out, field, r[field]); continue; }
            if (same(l[field], r[field])) continue;
            const choice = resolve(field);
            if (choice === 'right') defineOwn(out, field, r[field]);
            else if (choice === 'both') {
                const target = field + suffix;
                if (Object.hasOwn(l, target) || Object.hasOwn(r, target)) throw new Error(`Zielfeld „${target}“ existiert bereits / Target field "${target}" already exists`);
                defineOwn(out, target, r[field]);
            }
        }
        return out;
    }

    async function joinRecords(leftRows, rightRows, keyField, options = {}) {
        const { mode = 'inner', resolutions = {}, defaultResolution = 'left', suffix = '_2', cancelled = () => false } = options;
        if (!MODES.has(mode)) throw new Error(`Unbekannte Join-Art: ${mode}`);
        if (!RESOLUTIONS.has(defaultResolution)) throw new Error(`Unbekannte Konfliktregel: ${defaultResolution}`);
        for (const value of Object.values(resolutions)) if (!RESOLUTIONS.has(value)) throw new Error(`Unbekannte Konfliktregel: ${value}`);
        if ((defaultResolution === 'both' || Object.values(resolutions).includes('both')) && !String(suffix)) throw new Error('Suffix erforderlich / Suffix required');
        const tick = slicer(cancelled);
        const left = await index(leftRows, keyField, tick), right = await index(rightRows, keyField, tick);
        if (left.duplicates.size || right.duplicates.size) throw new Error('Schlüsselfeld ist nicht eindeutig / Key field is not unique');
        const resolve = field => Object.hasOwn(resolutions, field) ? resolutions[field] : defaultResolution;
        const rows = [], usedRight = new Set();
        const missingLeft = new Set(left.missing);
        for (let i = 0; i < leftRows.length; i++) {
            // Copies keep the new document independent: editing it must never change the source tabs.
            if (missingLeft.has(i)) { if (mode !== 'inner') rows.push(structuredClone(leftRows[i])); continue; }
            const ri = right.map.get(keyToken(leftRows[i], keyField));
            if (ri === undefined) { if (mode !== 'inner') rows.push(structuredClone(leftRows[i])); }
            else { usedRight.add(ri); rows.push(structuredClone(merge(leftRows[i], rightRows[ri], resolve, suffix))); }
            if ((i & 255) === 0) await tick();
        }
        if (mode === 'full') {
            for (let i = 0; i < rightRows.length; i++) {
                if (!usedRight.has(i)) rows.push(structuredClone(rightRows[i]));
                if ((i & 1023) === 0) await tick();
            }
        }
        return rows;
    }

    // Put the joined rows back where the record array was found, copying only the containers on that path.
    function replaceAtPath(document, path, rows) {
        if (!path.length) return rows;
        const [head, ...rest] = path, isArray = Array.isArray(document);
        const copy = isArray ? new Array(document.length) : {};
        for (const key of isArray ? document.keys() : Object.keys(document)) {
            const value = String(key) === String(head) ? replaceAtPath(document[key], rest, rows) : structuredClone(document[key]);
            if (isArray) copy[key] = value; else defineOwn(copy, key, value);
        }
        return copy;
    }

    const api = { analyzeJoin, joinRecords, replaceAtPath, keyToken };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.JoinCore = api;
})(globalThis);

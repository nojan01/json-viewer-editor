/* Shared, DOM-independent JSON operations. */
(function (root) {
    'use strict';
    const own = (object, key) => object !== null && object !== undefined && Object.prototype.hasOwnProperty.call(object, key);
    const define = (object, key, value) => Object.defineProperty(object, key, { value, writable: true, enumerable: true, configurable: true });

    function appendPath(path, key) {
        if (typeof key === 'number') return `${path}[${key}]`;
        return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
    }

    function parsePath(path) {
        if (!path.startsWith('root')) throw new Error('Ungültiger Pfad');
        const parts = [];
        let i = 4;
        while (i < path.length) {
            if (path[i] === '.') {
                const start = ++i;
                while (i < path.length && !'.['.includes(path[i])) i++;
                if (i === start) throw new Error('Leeres Pfadsegment');
                parts.push(path.slice(start, i));
            } else if (path[i] === '[') {
                i++;
                if (path[i] === '"') {
                    const start = i++;
                    let escaped = false;
                    while (i < path.length) {
                        const ch = path[i++];
                        if (escaped) escaped = false;
                        else if (ch === '\\') escaped = true;
                        else if (ch === '"') break;
                    }
                    parts.push(JSON.parse(path.slice(start, i)));
                } else {
                    const match = /^\d+/.exec(path.slice(i));
                    if (!match) throw new Error('Ungültiger Arrayindex');
                    const index = Number(match[0]);
                    if (!Number.isSafeInteger(index)) throw new Error('Ungültiger Arrayindex');
                    parts.push(index);
                    i += match[0].length;
                }
                if (path[i++] !== ']') throw new Error('Ungültiger Pfadabschluss');
            } else throw new Error('Ungültiger Pfad');
        }
        return parts;
    }
    const pathFromParts = parts => parts.reduce(appendPath, 'root');
    const parentPath = path => pathFromParts(parsePath(path).slice(0, -1));
    function getAtPath(data, path) {
        for (const part of parsePath(path)) {
            if (!own(data, part)) return undefined;
            data = data[part];
        }
        return data;
    }

    // Parse every input byte. Never salvage valid objects from malformed JSON.
    function parseDocument(input) {
        const text = String(input).replace(/^\uFEFF/, '').trim();
        if (!text) throw new Error('Die JSON-Datei ist leer');
        let data, concatenated = false;
        try { data = JSON.parse(text); }
        catch (originalError) {
            const values = [];
            let i = 0;
            while (i < text.length) {
                while (/\s/.test(text[i] || '') && i < text.length) i++;
                if (i === text.length) break;
                const start = i;
                if (text[i] === '{' || text[i] === '[') {
                    const stack = [];
                    let inString = false, escaped = false;
                    do {
                        const ch = text[i++];
                        if (inString) {
                            if (escaped) escaped = false;
                            else if (ch === '\\') escaped = true;
                            else if (ch === '"') inString = false;
                        } else if (ch === '"') inString = true;
                        else if (ch === '{' || ch === '[') stack.push(ch);
                        else if (ch === '}' || ch === ']') {
                            if (stack.pop() !== (ch === '}' ? '{' : '[')) throw originalError;
                        }
                    } while (stack.length && i < text.length);
                    if (stack.length || inString) throw originalError;
                } else {
                    const match = /^(?:"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s|$)/.exec(text.slice(i));
                    if (!match) throw originalError;
                    i += match[0].length;
                }
                values.push(JSON.parse(text.slice(start, i)));
            }
            if (values.length < 2) throw originalError;
            data = values;
            concatenated = true;
        }
        const sample = text.slice(0, 32768);
        const indents = [...sample.matchAll(/\n([ \t]+)\S/g)].map(match => match[1]);
        let indent = '';
        if (indents.some(value => value.includes('\t'))) indent = '\t';
        else if (indents.length) {
            const gcd = (a, b) => b ? gcd(b, a % b) : a;
            indent = ' '.repeat(Math.min(10, indents.reduce((n, value) => gcd(n, value.length), 0)));
        }
        return { data, wasConcatenated: concatenated, indent, crlf: sample.includes('\r\n') };
    }

    // Validate the complete operation before touching the document.
    function bulkEdit(data, op, from, to, valueText) {
        if (!from) throw new Error('Bitte Key-Name eingeben');
        let replacement, expected;
        if (op === 'renameKey' && !to) throw new Error('Bitte neuen Key-Namen eingeben');
        if (op === 'replaceValue' || op === 'addKey') replacement = JSON.parse(valueText || 'null');
        if (op === 'replaceValue') expected = JSON.parse(to);
        const objects = [], stack = [data];
        while (stack.length) {
            const item = stack.pop();
            if (item === null || typeof item !== 'object') continue;
            if (!Array.isArray(item)) objects.push(item);
            for (const key of Object.keys(item)) stack.push(item[key]);
        }
        if (op === 'renameKey') {
            if (from === to) return 0;
            if (objects.some(item => own(item, from) && own(item, to))) throw new Error(`Der Ziel-Key "${to}" existiert bereits. Keine Änderungen vorgenommen.`);
        }
        let count = 0;
        for (const item of objects) {
            if (op === 'addKey' && !own(item, from)) {
                define(item, from, JSON.parse(JSON.stringify(replacement))); count++;
            } else if (own(item, from)) {
                if (op === 'renameKey') { define(item, to, item[from]); delete item[from]; count++; }
                else if (op === 'deleteKey') { delete item[from]; count++; }
                else if (op === 'replaceValue' && JSON.stringify(item[from]) === JSON.stringify(expected)) {
                    define(item, from, JSON.parse(JSON.stringify(replacement))); count++;
                }
            }
        }
        return count;
    }

    const api = { own, define, appendPath, parsePath, pathFromParts, parentPath, getAtPath, parseDocument, bulkEdit };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.JsonCore = api;
})(globalThis);

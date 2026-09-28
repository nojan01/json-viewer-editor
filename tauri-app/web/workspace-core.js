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
    function clone(value) { return value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value)); }
    function defineOwn(object, key, value) {
        Object.defineProperty(object, key, { value, enumerable: true, configurable: true, writable: true });
    }
    function escapeFlatSegment(value, separator) {
        if (value === '') return '\\e';
        return String(value).replaceAll('\\', '\\\\').replaceAll(separator, `\\${separator}`)
            .replaceAll('[', '\\[').replaceAll(']', '\\]');
    }
    function splitFlatPath(path, separator) {
        const tokens = [], key = [];
        const pushKey = () => { if (key.length) { tokens.push({ type: 'key', value: key.join('') }); key.length = 0; } };
        for (let i = 0; i < path.length;) {
            if (path[i] === '\\') {
                if (i + 1 >= path.length) throw new Error('Ungültige Escape-Sequenz am Ende des Pfads');
                if (path[i + 1] === 'e' && !key.length) { tokens.push({ type: 'key', value: '' }); i += 2; }
                else if (path.startsWith(separator, i + 1)) { key.push(separator); i += separator.length + 1; }
                else { key.push(path[i + 1]); i += 2; }
            } else if (path.startsWith(separator, i)) {
                pushKey(); i += separator.length;
            } else if (path[i] === '[') {
                const end = path.indexOf(']', i + 1), index = end < 0 ? '' : path.slice(i + 1, end);
                if (end > i + 1 && /^(0|[1-9]\d*)$/.test(index)) { pushKey(); tokens.push({ type: 'index', value: Number(index) }); i = end + 1; }
                else { key.push(path[i++]); }
            } else key.push(path[i++]);
        }
        pushKey();
        if (!tokens.length) throw new Error('Leerer Flatten-Pfad');
        return tokens;
    }
    function assertTransformOptions(options = {}) {
        const separator = options.separator ?? '.';
        if (!['.', '_', '/'].includes(separator)) throw new Error('Nicht unterstütztes Trennzeichen');
        const arrays = options.arrays ?? 'preserve';
        if (!['preserve', 'indices'].includes(arrays)) throw new Error('Nicht unterstützter Array-Modus');
        return { separator, arrays };
    }
    function flattenObject(value, options) {
        const { separator, arrays } = assertTransformOptions(options), output = {};
        const visit = (current, parts) => {
            const isArray = Array.isArray(current), isObject = current !== null && typeof current === 'object';
            const keys = isObject ? Object.keys(current) : [];
            const leaf = !isObject || !keys.length || (isArray && arrays === 'preserve');
            if (leaf) {
                if (parts.length) defineOwn(output, parts.join(separator), clone(current));
                return;
            }
            for (const key of keys) {
                const segment = isArray ? `[${key}]` : escapeFlatSegment(key, separator);
                const nextParts = isArray && parts.length
                    ? [...parts.slice(0, -1), `${parts.at(-1)}${segment}`]
                    : [...parts, segment];
                visit(current[key], nextParts);
            }
        };
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return clone(value);
        for (const key of Object.keys(value)) visit(value[key], [escapeFlatSegment(key, separator)]);
        return output;
    }
    function flattenData(value, options = {}) {
        assertTransformOptions(options);
        return Array.isArray(value) ? value.map(item => flattenObject(item, options)) : flattenObject(value, options);
    }
    // Cooperative traversal: never structured-clone the complete document into a worker.
    async function flattenDataAsync(value, options = {}, {cancelled = () => false, progress = () => {}, indexKeys = () => {}} = {}) {
        const {separator, arrays} = assertTransformOptions(options);
        function* copy(value) {
            yield;
            if (value === null || typeof value !== 'object') return value;
            const result = Array.isArray(value) ? [] : {};
            for (const key in value) if (Object.hasOwn(value, key)) defineOwn(result, key, yield* copy(value[key]));
            return result;
        }
        function* flatten(value) {
            if (value === null || typeof value !== 'object' || Array.isArray(value)) return yield* copy(value);
            const result = {}, keys = [];
            function put(path, value) { defineOwn(result, path, value); keys.push(path); }
            function* visit(current, path) {
                yield;
                if (current === null || typeof current !== 'object' || (Array.isArray(current) && arrays === 'preserve')) {
                    put(path, yield* copy(current)); return;
                }
                let any = false;
                for (const key in current) if (Object.hasOwn(current, key)) {
                    any = true;
                    yield* visit(current[key], Array.isArray(current) ? `${path}[${key}]` : `${path}${separator}${escapeFlatSegment(key, separator)}`);
                }
                if (!any) put(path, Array.isArray(current) ? [] : {});
            }
            for (const key in value) if (Object.hasOwn(value, key)) yield* visit(value[key], escapeFlatSegment(key, separator));
            indexKeys(result, keys);
            return result;
        }
        function* run() {
            if (!Array.isArray(value)) return yield* flatten(value);
            const result = [];
            for (const row of value) result.push(yield* flatten(row));
            return result;
        }
        const iterator = run(); let count = 0;
        while (true) {
            if (cancelled()) throw new Error('Transformation abgebrochen');
            const until = performance.now() + 8;
            // Use the time budget, not a fixed node count: browser timer clamping
            // otherwise adds seconds of idle time for millions of tiny values.
            for (;;) {
                const step = iterator.next(); count++;
                if (step.done) return step.value;
                if (performance.now() >= until) break;
            }
            progress(count);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    function unflattenObject(value, options) {
        const { separator } = assertTransformOptions(options);
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return clone(value);
        const output = {};
        for (const [path, sourceValue] of Object.entries(value)) {
            const tokens = splitFlatPath(path, separator);
            let current = output;
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i], last = i === tokens.length - 1, next = tokens[i + 1];
                if (token.type === 'index' && !Array.isArray(current)) throw new Error(`Pfadkonflikt bei „${path}“`);
                const key = token.value;
                if (last) {
                    if (Object.hasOwn(current, key)) throw new Error(`Doppelter oder widersprüchlicher Pfad „${path}“`);
                    defineOwn(current, key, clone(sourceValue));
                    continue;
                }
                const expectedArray = next.type === 'index';
                if (!Object.hasOwn(current, key)) defineOwn(current, key, expectedArray ? [] : {});
                else if (current[key] === null || typeof current[key] !== 'object' || Array.isArray(current[key]) !== expectedArray) {
                    throw new Error(`Pfadkonflikt bei „${path}“`);
                }
                current = current[key];
            }
        }
        return output;
    }
    function unflattenData(value, options = {}) {
        assertTransformOptions(options);
        return Array.isArray(value) ? value.map(item => unflattenObject(item, options)) : unflattenObject(value, options);
    }
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
    async function profileData(data, {maxRecords = 10000, nested = false, cancelled = () => false, progress = () => {}} = {}) {
        if (maxRecords !== Infinity && (!Number.isInteger(maxRecords) || maxRecords < 1)) throw new Error("Invalid record limit");
        const rows = Array.isArray(data) ? data : [data];
        const sampleCount = Math.min(rows.length, maxRecords), fields = new Map(), recordValue = Symbol();
        const seen = new Set();
        let fieldsLimited = false, depthLimited = false, until = performance.now() + 8;
        function observe(key, value, path = null) {
            let f = fields.get(key);
            if (!f) {
                if (fields.size >= 200) { fieldsLimited = true; return; }
                f = {field:key,path,present:0,types:{},empty:0,numbers:0,min:null,max:null,mean:null,frequencies:new Map(),valuesLimited:false};
                fields.set(key,f);
            }
            f.present++;
            const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
            f.types[type] = (f.types[type] || 0) + 1;
            if (value === '') f.empty++;
            if (type === 'number' && Number.isFinite(value)) {
                f.numbers++;f.min=f.min===null?value:Math.min(f.min,value);f.max=f.max===null?value:Math.max(f.max,value);
                f.mean = f.numbers === 1 ? value : f.mean * ((f.numbers-1)/f.numbers) + value/f.numbers;
            }
            // Container identity isn't a content comparison. Only scalar values are counted.
            if (type === 'object' || type === 'array') return;
            if (type === 'string' && value.length > 500) { f.valuesLimited = true; return; }
            const token=type+':'+JSON.stringify(value), entry=f.frequencies.get(token);
            if (entry) entry.count++;
            else if (f.frequencies.size < 1000) f.frequencies.set(token,{type,value,count:1});
            else f.valuesLimited=true;
        }
        function* entries(row, path = []) {
            for (const key in row) if (Object.hasOwn(row,key)) {
                const parts=[...path,key], value=row[key];
                yield {key:parts.map(k=>escapeFlatSegment(k,'.')).join('.'),value,path:parts};
                if (nested && value !== null && typeof value === 'object' && !Array.isArray(value)) {
                    if (parts.length < 20) yield* entries(value,parts);
                    else depthLimited=true;
                }
            }
        }
        function retained(row, f) {
            if (!f.path) return;
            let value=row;
            for (const key of f.path) {
                if (value === null || typeof value !== 'object' || !Object.hasOwn(value,key)) return;
                value=value[key];
            }
            observe(f.field,value,f.path);
        }
        for (let i=0;i<sampleCount;i++) {
            if (cancelled()) throw new Error('Analyse abgebrochen / Analysis cancelled');
            const row=rows[i];
            if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
                if (fieldsLimited) {
                    for (const f of fields.values()) retained(row,f);
                } else {
                    for (const entry of entries(row)) {
                        observe(entry.key,entry.value,entry.path);
                        if (fieldsLimited) {
                            for (const f of fields.values()) if (!seen.has(f.field)) retained(row,f);
                            break;
                        }
                        seen.add(entry.key);
                    }
                }
            } else observe(recordValue,row);
            seen.clear();
            if (performance.now() >= until) {
                progress(i+1,sampleCount);
                await new Promise(resolve=>setTimeout(resolve,0));until=performance.now()+8;
            }
        }
        if (cancelled()) throw new Error('Analyse abgebrochen / Analysis cancelled');
        return {totalRecords:rows.length,analyzedRecords:sampleCount,sampled:rows.length>sampleCount,fieldsLimited,depthLimited,nested,
            limits:{records:Number.isFinite(maxRecords)?maxRecords:null,fields:200,depth:20,distinctScalars:1000,stringLength:500},
            fields:[...fields.values()].map(f=>{
                const frequencies=[...f.frequencies.values()].sort((a,b)=>b.count-a.count);
                const scalarCount=frequencies.reduce((n,v)=>n+v.count,0);
                return {field:f.field === recordValue ? '[value]' : f.field,recordValue:f.field === recordValue,path:f.path,present:f.present,missing:sampleCount-f.present,types:f.types,
                    nulls:f.types.null||0,emptyStrings:f.empty,mixedTypes:Object.keys(f.types).length>1,
                    numeric:{count:f.numbers,min:f.min,max:f.max,mean:f.mean},
                    distinctScalars:f.valuesLimited?null:frequencies.length,
                    duplicateScalars:f.valuesLimited?null:scalarCount-frequencies.length,
                    valuesLimited:f.valuesLimited,topValues:f.valuesLimited?[]:frequencies.slice(0,5)};
            })};
    }

    function profileCsv(report, language = 'de') {
        const de = language !== 'en';
        const columns = de
            ? ['Datei','Bereich','Datensätze gesamt','Analysiert','Stichprobe','Feldlimit erreicht','Tiefenlimit erreicht','Feld','Pfad (JSON)','Datensatzwert','Typen (JSON)','Vorhanden','Fehlend','Null','Leerstrings','Gemischte Typen','Zahlenanzahl','Minimum','Maximum','Durchschnitt','Eindeutige Skalarwerte','Wiederholungen','Wertelimit erreicht','Häufigste Werte (JSON)']
            : ['File','Scope','Total records','Analyzed','Sampled','Field limit reached','Depth limit reached','Field','Path (JSON)','Record value','Types (JSON)','Present','Missing','Null','Empty strings','Mixed types','Number count','Minimum','Maximum','Mean','Distinct scalar values','Repetitions','Value limit reached','Top values (JSON)'];
        function cell(value) {
            let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
            if (typeof value === 'number' && de) text = text.replace('.', ',');
            // Treat untrusted file and field names as text when opened in a spreadsheet.
            if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
            return '"' + text.replaceAll('"','""') + '"';
        }
        const rows = [columns];
        for (const f of report.fields.length ? report.fields : [null]) {
            rows.push([report.file,report.recordField ?? report.scope,report.totalRecords,report.analyzedRecords,
                report.sampled,report.fieldsLimited,report.depthLimited,f?.field,f?.path,f?.recordValue,f?.types,
                f?.present,f?.missing,f?.nulls,f?.emptyStrings,f?.mixedTypes,f?.numeric.count,
                f?.numeric.min,f?.numeric.max,f?.numeric.mean,f?.distinctScalars,f?.duplicateScalars,
                f?.valuesLimited,f?.topValues]);
        }
        return '\uFEFF' + rows.map(row=>row.map(cell).join(';')).join('\r\n') + '\r\n';
    }

    const api = { parseFlatPath: splitFlatPath, profileCsv, profileData, matchesFilter, filterRows, fieldNames, serializeMasked, safeView, safeSavedViews, applySavedView,
        getField, comparisonFields, findRecordArray, keyedCompare, flattenData, flattenDataAsync, unflattenData };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.WorkspaceCore = api;
})(globalThis);

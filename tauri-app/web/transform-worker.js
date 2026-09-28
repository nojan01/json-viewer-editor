/* Keep traversal and preview serialization off the window thread. */
importScripts('workspace-core.js');
self.onmessage = ({data: {source, options}}) => {
    try {
        const result = options.operation === 'flatten'
            ? WorkspaceCore.flattenData(source, options)
            : WorkspaceCore.unflattenData(source, options);
        let remaining = 300, clipped = false;
        function sample(value, depth = 0) {
            if (--remaining < 0 || depth > 30) { clipped = true; return '…'; }
            if (typeof value === 'string' && value.length > 1000) { clipped = true; return value.slice(0, 1000) + '…'; }
            if (value === null || typeof value !== 'object') return value;
            const output = Array.isArray(value) ? [] : {};
            for (const key in value) {
                if (!Object.hasOwn(value, key)) continue;
                if (remaining <= 0) { clipped = true; break; }
                Object.defineProperty(output, key, {value: sample(value[key], depth + 1), enumerable: true});
            }
            return output;
        }
        const text = JSON.stringify(sample(result), null, 2);
        clipped ||= text.length > 12000;
        self.postMessage({result, preview: text.slice(0, 12000) + (clipped ? '\n…' : ''), clipped,
            extent: result && typeof result === 'object' ? Object.keys(result).length : 1});
    } catch (error) { self.postMessage({error: error.message || String(error)}); }
};

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyzeJoin, joinRecords, replaceAtPath } = require('../web/join-core.js');

const left = [{ id: 1, name: 'a', nested: { v: 1 } }, { id: 2, name: 'b' }, { name: 'no key' }, { id: 4, name: 'd' }];
const right = [{ id: 1, name: 'A', city: 'X' }, { id: 2, name: 'b', city: 'Y' }, { id: 3, city: 'Z' }, { id: '1', city: 'string key' }];

test('join analysis reports matches, unmatched keys, missing keys and conflicts', async () => {
    const a = await analyzeJoin(left, right, 'id');
    assert.equal(a.matched, 2); assert.equal(a.leftOnly, 1); assert.equal(a.rightOnly, 2);
    assert.deepEqual(a.missing, { left: 1, right: 0 });
    assert.deepEqual(a.conflicts.map(c => [c.field, c.count, c.example.left, c.example.right]), [['name', 1, 'a', 'A']]);
});

test('join analysis reports duplicate keys and joining refuses them', async () => {
    const dup = [{ id: 1 }, { id: 1 }, { id: 1 }, { id: 2 }];
    const a = await analyzeJoin(dup, right, 'id');
    assert.equal(a.duplicates.left.count, 1); assert.deepEqual(a.duplicates.left.sample, [{ key: 1, occurrences: 3 }]);
    await assert.rejects(joinRecords(dup, right, 'id'), /nicht eindeutig/);
});

test('inner, left and full joins keep source order and resolve conflicts per field', async () => {
    const inner = await joinRecords(left, right, 'id', { mode: 'inner' });
    assert.deepEqual(inner, [{ id: 1, name: 'a', nested: { v: 1 }, city: 'X' }, { id: 2, name: 'b', city: 'Y' }]);
    const leftJoin = await joinRecords(left, right, 'id', { mode: 'left', resolutions: { name: 'right' } });
    assert.deepEqual(leftJoin.map(r => r.name), ['A', 'b', 'no key', 'd']);
    const full = await joinRecords(left, right, 'id', { mode: 'full', resolutions: { name: 'both' }, suffix: '_r' });
    assert.equal(full.length, 6);
    assert.equal(full[0].name_r, 'A'); assert.equal(Object.hasOwn(full[1], 'name_r'), false);
    assert.deepEqual(full.slice(4), [{ id: 3, city: 'Z' }, { id: '1', city: 'string key' }]);
});

test('joined output is independent of both sources', async () => {
    const result = await joinRecords(left, right, 'id', { mode: 'full' });
    result[0].nested.v = 99; result[4].city = 'changed';
    assert.equal(left[0].nested.v, 1); assert.equal(right[2].city, 'Z');
});

test('join rejects suffix collisions and unknown options', async () => {
    await assert.rejects(joinRecords([{ id: 1, a: 1, a_2: 0 }], [{ id: 1, a: 2 }], 'id', { resolutions: { a: 'both' } }), /a_2/);
    await assert.rejects(joinRecords(left, right, 'id', { mode: 'cross' }), /Join-Art/);
    await assert.rejects(joinRecords(left, right, 'id', { resolutions: { name: 'x' } }), /Konfliktregel/);
});

test('join handles __proto__ field names as data', async () => {
    const l = JSON.parse('[{"id":1,"__proto__":{"x":1}}]'), r = JSON.parse('[{"id":1,"__proto__":{"x":2}}]');
    const [row] = await joinRecords(l, r, 'id', { resolutions: JSON.parse('{"__proto__":"right"}') });
    assert.ok(Object.hasOwn(row, '__proto__')); assert.equal(row.__proto__.x, 2); assert.equal(({}).x, undefined);
});

test('result replaces the nested record array and copies the surrounding document', () => {
    const doc = JSON.parse('{"meta":{"v":1},"__proto__":{"p":1},"data":{"rows":[1]}}');
    const result = replaceAtPath(doc, ['data', 'rows'], [2]);
    assert.deepEqual(result.data.rows, [2]); assert.notEqual(result.meta, doc.meta);
    assert.ok(Object.hasOwn(result, '__proto__')); assert.deepEqual(doc.data.rows, [1]);
    assert.deepEqual(replaceAtPath([0, [1]], [1], [9]), [0, [9]]);
});

test('join of 205,265 records stays cooperative', async () => {
    const n = 205265;
    const l = Array.from({ length: n }, (_, id) => ({ id, name: `host-${id}`, ram: id % 64 }));
    const r = Array.from({ length: n }, (_, i) => ({ id: n - 1 - i, owner: `o${i}`, ram: (n - 1 - i) % 63 }));
    let maxGap = 0, last = performance.now();
    const timer = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 5);
    try {
        const a = await analyzeJoin(l, r, 'id');
        assert.equal(a.matched, n); assert.equal(a.conflicts[0].field, 'ram');
        const rows = await joinRecords(l, r, 'id', { mode: 'inner', resolutions: { ram: 'both' } });
        assert.equal(rows.length, n); assert.equal(rows[n - 1].owner, 'o0'); assert.equal(rows[64].ram_2, 1);
    } finally { clearInterval(timer); }
    assert.ok(maxGap < 250, `UI blocked for ${maxGap.toFixed(1)} ms`);
});

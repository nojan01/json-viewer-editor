const {test}=require('node:test');
const assert=require('node:assert/strict');
const json=require('../web/json-core.js');

test('parseNdjson reads one record per non-empty line and tolerates BOM and CRLF',()=>{
 const text='\uFEFF{"a":1}\r\n\r\n{"a":2}\n';
 assert.deepEqual(json.parseNdjson(text),[{a:1},{a:2}]);
});

test('parseNdjson reports the failing line number',()=>{
 assert.throws(()=>json.parseNdjson('{"a":1}\n{broken\n'),/Ungültige JSON-Zeile 2/);
});

test('parseNdjson rejects input without records',()=>{
 assert.throws(()=>json.parseNdjson('\n  \n'),/keine Datensätze/);
});

test('document and line parsers reject silently rounded or overflowing numbers', () => {
    for (const parse of [json.parseDocument, json.parseNdjson]) {
        for (const number of ['9007199254740993', '1e400', '1.00000000000000001', '1e-400', '-0']) {
            assert.throws(() => parse('{"id":' + number + '}'), /verlustfrei/);
        }
    }
    const text = '{"id":"9007199254740993","value":1.2300e2}';
    assert.deepEqual(json.parseDocument(text).data, {id: '9007199254740993', value: 123});
});

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

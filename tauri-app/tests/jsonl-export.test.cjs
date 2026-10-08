const {test}=require('node:test');
const assert=require('node:assert/strict');
const json=require('../web/json-core.js');

test('jsonToJsonl writes one element per line for array roots',()=>{
 assert.equal(json.jsonToJsonl([{a:1},{b:[2,3]}]),'{"a":1}\n{"b":[2,3]}\n');
});

test('jsonToJsonl writes a single line for non-array roots',()=>{
 assert.equal(json.jsonToJsonl({a:1}),'{"a":1}\n');
});

test('jsonToJsonl keeps newlines inside strings escaped',()=>{
 const out=json.jsonToJsonl([{t:'x\ny'}]);
 assert.equal(out.split('\n').length-1,1);
 assert.deepEqual(json.parseNdjson(out),[{t:'x\ny'}]);
});

test('jsonToJsonl of an empty array yields an empty line set',()=>{
 assert.equal(json.jsonToJsonl([]),'\n');
});

test('JSONL round-trip through JSON array is lossless',()=>{
 const data=[{id:1,tags:['a'],n:null},{id:2,ok:true}];
 assert.deepEqual(JSON.parse(json.jsonlToJson(json.jsonToJsonl(data))),data);
});

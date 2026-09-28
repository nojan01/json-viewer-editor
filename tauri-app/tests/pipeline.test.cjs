const {test}=require('node:test');
const assert=require('node:assert/strict');
const pipeline=require('../web/pipeline-core.js');
const json=require('../web/json-core.js');
test('ordered pipeline changes nested records atomically and retains original values',async()=>{
 const source={rows:[{first:' Ada ',last:'Lovelace',age:'36',obsolete:1}]};const before=JSON.stringify(source);
 const result=await pipeline.run(source,[{op:'trim',field:'first'},{op:'merge',field:'first,last',target:'name',separator:' '},{op:'convert',field:'age',type:'number'},{op:'rename',field:'age',target:'years'},{op:'delete',field:'obsolete'},{op:'replace',field:'name',value:'Ada',target:'A.'},{op:'split',field:'name',target:'initial,surname',separator:' '}]);
 assert.deepEqual(result.rows[0],{first:'Ada',last:'Lovelace',name:'A. Lovelace',years:36,initial:'A.',surname:'Lovelace'});assert.equal(JSON.stringify(source),before);
});
test('errors and cancellation never commit partial changes to the source',async()=>{
 const source=[{x:' 4 '},{x:'no'}],before=JSON.stringify(source);
 await assert.rejects(pipeline.run(source,[{op:'trim',field:'x'},{op:'convert',field:'x',type:'number'}]),/Schritt 2/);
 assert.equal(JSON.stringify(source),before);
 await assert.rejects(pipeline.run({a:1,b:2},[{op:'rename',field:'a',target:'b'}]),/Zielfeld/);
 await assert.rejects(pipeline.run({x:'a:b:c'},[{op:'split',field:'x',target:'a,b',separator:':'}]),/Anzahl/);
 let cancel=false;await assert.rejects(pipeline.run(Array.from({length:50000},()=>({x:' abc '})),[{op:'trim',field:'x'}],{cancelled:()=>cancel,progress:()=>{cancel=true;}}),/abgebrochen/);
});
test('flatten and cooperative unflatten round-trip literal paths and reject collisions',async()=>{
 const source=JSON.parse('{"__proto__":{"x":1},"a.b":{"list":[1,{"x":2}]}}');
 const opts={separator:'.',arrays:'indices'};
 assert.deepEqual(await pipeline.run(source,[{op:'flatten',...opts},{op:'unflatten',...opts}]),source);
 await assert.rejects(pipeline.run({'a':{},'a.b':1},[{op:'unflatten',...opts}]),/Pfadkonflikt/);
 const flat=Object.fromEntries(Array.from({length:1500},(_,i)=>['row'+i+'.x',i]));
 const restored=await pipeline.run(flat,[{op:'unflatten',...opts}]);assert.equal(restored.row1499.x,1499);
});
test('profiles reject invalid steps and final key indexes reflect later edits',async()=>{
 assert.deepEqual(pipeline.profiles([{name:'bad',steps:[{op:'code'}]}]),[]);
 assert.equal(pipeline.profiles([{name:'trim',steps:[{op:'trim',field:'x'}],data:'secret'}])[0].data,undefined);
 const result=await pipeline.run({z:{x:1}},[{op:'flatten',separator:'.',arrays:'preserve'},{op:'rename',field:'z.x',target:'new'}],{indexKeys:json.seedKeys});
 assert.deepEqual(json.sortedKeys(result),['new']);
});

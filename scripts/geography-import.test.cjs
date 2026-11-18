const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {audit,stableId}=require('./geography-import.cjs');
test('source audit preserves all source IDs and quarantines duplicates',()=>{
 const result=audit(fs.readFileSync(require('node:path').join(__dirname,'../docs/data/carenet-geography-v1.sql'),'utf8'));
 assert.deepEqual(['region','district','township'].map(kind=>result.rows.filter(row=>row.kind===kind).length),[15,85,323]);
 assert.equal(new Set(result.rows.map(row=>row.id)).size,423);
 assert.ok(result.trimmed.length>0); assert.ok(result.duplicates.length>0);
 for(const group of result.duplicates) for(const row of group) assert.equal(row.active,false);
 assert.equal(stableId('township',290),stableId('township',290));
});
test('invalid parents, duplicate IDs and unrecognized statements fail before seed generation',()=>{
 assert.throws(()=>audit("insert into township (id, district_id, name) values (1, 1, 'Tamwe');"),/Invalid parent/);
 assert.throws(()=>audit("insert into region (id, name) values (1, 'A');\ninsert into region (id, name) values (1, 'B');"),/Duplicate source ID/);
 assert.throws(()=>audit('DROP TABLE users;'),/Unrecognized source SQL/);
});

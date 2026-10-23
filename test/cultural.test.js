import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { migrateCultural, validateRecording } from '../server/recordings.js';
import { initialState, migrateLocalState, completeSession, completeLocalRecording } from '../src/state.js';
import { RECORDING_TICKET_MS, MAX_RECORDING_BYTES } from '../src/recording-policy.js';

const webm = () => {const b=Buffer.alloc(2048,1);b.set([0x1a,0x45,0xdf,0xa3]);return b;};

test('Cultural migration preserves old local awards, preferences and guilds exactly once',()=>{
  const old={...initialState(),points:{academics:2,career:0,social:0,fitness:1,creativity:7,cultural:1},interests:'creativity',history:[{category:'creativity',points:7}],customGuilds:[{aspect:'creativity'}],session:{id:'create',category:'creativity',endsAt:1}};
  const migrated=migrateLocalState(old);
  assert.equal(migrated.points.cultural,8);assert.equal(migrated.points.academics,2);assert.equal('creativity' in migrated.points,false);
  assert.equal(migrated.interests,'cultural');assert.equal(migrated.history[0].category,'cultural');assert.equal(migrated.customGuilds[0].aspect,'cultural');assert.equal(migrated.session,null);
  assert.deepEqual(migrateLocalState(migrated),migrated);
});
test('Cultural cannot complete via local timer; captured submissions award once',()=>{
  const s=initialState();s.session={category:'cultural',mode:'recording',points:1,endsAt:0};assert.equal(completeSession(s,100),false);s.session=null;
  assert.equal(completeLocalRecording(s,{id:'a',bytes:0}),false);assert.equal(completeLocalRecording(s,{id:'a',bytes:2048}),true);assert.equal(completeLocalRecording(s,{id:'a',bytes:2048}),false);assert.equal(s.points.cultural,1);
});
test('recording containers and size limits reject empty, unsupported and malformed content',()=>{
  assert.equal(validateRecording(webm(),'video/webm;codecs=vp8,opus').mime,'video/webm');
  const mp4=Buffer.alloc(2048);mp4.write('ftyp',4);assert.equal(validateRecording(mp4,'video/mp4').mime,'video/mp4');
  for(const [body,mime]of [[Buffer.alloc(0),'video/webm'],[webm(),'image/png'],[Buffer.alloc(2048),'video/webm'],[{},'video/webm']])assert.throws(()=>validateRecording(body,mime));
  assert.throws(()=>validateRecording(Buffer.alloc(MAX_RECORDING_BYTES+1),'video/webm'),{status:413});
});
test('server migration preserves totals and cancels legacy creative timers',()=>{
  const backend=createApp({filename:':memory:'});const db=backend.db;
  try {
    db.prepare('INSERT INTO users(id,username,password,name,interests,updated_at) VALUES(?,?,?,?,?,?)').run('u','old_user','unused','Old User','creativity',1);
    db.prepare('INSERT INTO activity VALUES(?,?,?,?,?,?,?)').run('completed','u','create',0,1,null,'completed');
    db.prepare('INSERT INTO activity VALUES(?,?,?,?,?,?,?)').run('active','u','create',0,1,null,'active');
    db.prepare('INSERT INTO awards VALUES(?,?,?,?,?)').run('completed','u','creativity',3,1);
    db.prepare('INSERT INTO guilds VALUES(?,?,?,?,?)').run('g','Old Guild','Keep history','creativity','u');
    migrateCultural(db);migrateCultural(db);
    assert.equal(db.prepare('SELECT interests FROM users').get().interests,'cultural');assert.equal(db.prepare('SELECT aspect FROM guilds').get().aspect,'cultural');
    assert.deepEqual({...db.prepare('SELECT category,points FROM awards').get()},{category:'cultural',points:3});assert.equal(db.prepare("SELECT status FROM activity WHERE id='active'").get().status,'cancelled');
  }finally{backend.close();}
});
test('recording API requires capture session, blocks timer rewards, isolates ownership and awards once',async t=>{
  let time=Date.now();const backend=createApp({filename:':memory:',now:()=>time});const server=backend.app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));backend.close();});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const client=()=>{let cookie='';return async(path,method='GET',body,expected=200,mime='application/json')=>{const response=await fetch(base+path,{method,headers:{cookie,'X-Zindagi':'1','Content-Type':mime},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;};};
  const a=client(),b=client();await a('/recordings/start','POST',{},401);
  for(const [c,name]of [[a,'performer'],[b,'otheruser']])await c('/auth/register','POST',{username:name,name,password:'recording-test-password'},201);
  await a('/sessions','POST',{taskId:'create'},400);
  const start=await a('/recordings/start','POST',{},201);
  await a('/recordings/start','POST',{},409);await a('/sessions','POST',{taskId:'study'},409);
  await a(`/sessions/${start.id}/complete`,'POST',{},400);
  await b(`/recordings/${start.id}/submit`,'POST',webm(),404,'video/webm');
  await a(`/recordings/${start.id}/submit`,'POST',{points:1},415);
  await a(`/recordings/${start.id}/submit`,'POST',Buffer.alloc(0),400,'video/webm');
  const result=await a(`/recordings/${start.id}/submit`,'POST',webm(),200,'video/webm');assert.equal(result.points.cultural,1);
  assert.equal((await a(`/recordings/${start.id}/submit`,'POST',webm(),200,'video/webm')).points.cultural,1);
  assert.equal(backend.db.prepare('SELECT COUNT(*) n FROM recording_receipts').get().n,1);
  const repeat=await a('/recordings/start','POST',{},201);await a(`/recordings/${repeat.id}/submit`,'POST',webm(),409,'video/webm');
  await b(`/recordings/${repeat.id}`,'DELETE',undefined,404);await a('/recordings/current','DELETE');await a(`/recordings/${repeat.id}/submit`,'POST',webm(),409,'video/webm');
  const expired=await a('/recordings/start','POST',{},201);time+=RECORDING_TICKET_MS+1;await a(`/recordings/${expired.id}/submit`,'POST',webm(),409,'video/webm');
  const fresh=await a('/recordings/start','POST',{},201);await a(`/recordings/${fresh.id}`,'DELETE');assert.equal((await a('/me')).points.cultural,1);
  const metadata=backend.db.prepare('PRAGMA table_info(recording_receipts)').all();assert.ok(!metadata.some(c=>c.type==='BLOB'));
});

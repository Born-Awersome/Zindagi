import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
const jpeg=()=>{const b=Buffer.alloc(2048,1);b.set([255,216]);b.set([255,217],2046);return b;};
const webm=()=>{const b=Buffer.alloc(2048,1);b.set([0x1a,0x45,0xdf,0xa3]);return b;};
async function setup(t,filename=':memory:'){let time=Date.now();const backend=createApp({filename,now:()=>time}),server=backend.app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
 let closed=false;const shutdown=async()=>{if(closed)return;closed=true;server.closeAllConnections();await new Promise(r=>server.close(r));backend.close();};t.after(shutdown);
 const client=()=>{let cookie='';return async(path,method='GET',body,mime='application/json')=>{const r=await fetch(url+'/api'+path,{method,headers:{cookie,'X-Zindagi':'1','Content-Type':mime},body:body===undefined?undefined:mime==='application/json'?JSON.stringify(body):body});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const data=r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer());return {status:r.status,data,headers:r.headers};};};
 const register=async name=>{const c=client(),r=await c('/auth/register','POST',{username:name,name,password:'test-password-123'});assert.equal(r.status,201);return {c,id:r.data.id};};
 return {backend,client,register,shutdown,advance:ms=>time+=ms};
}
const capture=async(c,kind='photo')=>{const r=await c('/moments/captures','POST',{kind});assert.equal(r.status,201);return r.data.id;};
const publish=async(c,kind='photo')=>{const id=await capture(c,kind),r=await c('/moments/captures/'+id+'/publish?public=true','POST',kind==='photo'?jpeg():webm(),kind==='photo'?'image/jpeg':'video/webm');assert.equal(r.status,201);return r.data.id;};
test('public media requires explicit choice, owned capture, valid type and unexpired session',async t=>{
 const {register,client,advance,backend}=await setup(t),{c:a}=await register('author'),{c:b}=await register('other');
 assert.equal((await client()('/moments')).status,401);const ticket=await capture(a);
 const path='/moments/captures/'+ticket+'/publish';
 assert.equal((await a(path,'POST',jpeg(),'image/jpeg')).status,400);
 assert.equal((await b(path+'?public=true','POST',jpeg(),'image/jpeg')).status,404);
 assert.equal((await a(path+'?public=true','POST',Buffer.alloc(2048),'image/jpeg')).status,400);
 assert.equal((await a(path+'?public=true','POST',webm(),'video/webm')).status,400);
 const saved=await a(path+'?public=true','POST',jpeg(),'image/jpeg');assert.equal(saved.status,201);
 assert.equal((await a(path+'?public=true','POST',jpeg(),'image/jpeg')).data.id,saved.data.id);
 assert.equal(backend.db.prepare('SELECT COUNT(*) n FROM moments').get().n,1);
 assert.equal((await a('/me')).data.points.cultural,0);
 const expired=await capture(a);advance(16*60000);assert.equal((await a('/moments/captures/'+expired+'/publish?public=true','POST',jpeg(),'image/jpeg')).status,404);
 const cancelled=await capture(a);await a('/moments/captures/'+cancelled,'DELETE');assert.equal((await a('/moments/captures/'+cancelled+'/publish?public=true','POST',jpeg(),'image/jpeg')).status,404);
});
test('each account can open exactly once, including concurrent requests; metadata has no media',async t=>{
 const {register}=await setup(t),{c:a}=await register('author'),{c:b}=await register('viewer'),{c:c}=await register('viewer2');const id=await publish(a),path='/moments/'+id+'/view';
 const feed=(await b('/moments')).data;assert.equal(feed.posts[0].viewed,0);assert.equal(feed.posts[0].media,undefined);assert.equal(feed.posts[0].url,undefined);
 assert.equal((await b(path)).status,404);
 const results=await Promise.all([b(path,'POST'),b(path,'POST')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,410]);
 const success=results.find(r=>r.status===200);assert.deepEqual(success.data,jpeg());assert.match(success.headers.get('cache-control'),/no-store/);
 assert.equal((await b('/moments')).data.posts[0].viewed,1);assert.equal((await c(path,'POST')).status,200);assert.equal((await a(path,'POST')).status,200);assert.equal((await a(path,'POST')).status,410);
});
test('blocking and owner removal revoke further access without affecting earned points',async t=>{
 const {register}=await setup(t),{c:a,id:author}=await register('author'),{c:b}=await register('viewer');const id=await publish(a);
 assert.equal((await b('/moments/'+id,'DELETE')).status,403);
 await b('/blocks/'+author,'POST');assert.equal((await b('/moments')).data.posts.length,0);assert.equal((await b('/moments/'+id+'/view','POST')).status,404);
 assert.equal((await a('/moments/'+id,'DELETE')).status,200);assert.equal((await a('/moments/'+id+'/view','POST')).status,404);
});
test('quest recordings remain private by default; opted-in publication is atomic and idempotent',async t=>{
 const {register,backend}=await setup(t),{c:a}=await register('performer');
 let ticket=(await a('/recordings/start','POST',{})).data.id;
 assert.equal((await a('/recordings/'+ticket+'/submit','POST',webm(),'video/webm')).status,200);
 assert.equal((await a('/moments')).data.posts.length,0);
 ticket=(await a('/recordings/start','POST',{})).data.id;const bytes=webm();bytes[100]=2;
 const path='/recordings/'+ticket+'/submit?public=true';assert.equal((await a(path,'POST',bytes,'video/webm')).status,200);assert.equal((await a(path,'POST',bytes,'video/webm')).status,200);
 assert.equal((await a('/me')).data.points.cultural,2);assert.equal((await a('/moments')).data.posts.length,1);
 assert.equal(backend.db.prepare('SELECT recording_id FROM moments').get().recording_id,ticket);
});
test('per-author storage quota and mine filter',async t=>{
 const {register}=await setup(t),{c:a}=await register('author'),{c:b}=await register('viewer');
 for(let i=0;i<10;i++)await publish(a);
 const ticket=await capture(a);assert.equal((await a('/moments/captures/'+ticket+'/publish?public=true','POST',jpeg(),'image/jpeg')).status,409);
 assert.equal((await b('/moments?mine=true')).data.posts.length,0);assert.equal((await a('/moments?mine=true')).data.posts.length,10);
 assert.equal((await a('/moments?offset=-1')).status,400);
 const quest=(await a('/recordings/start','POST',{})).data.id;
 assert.equal((await a('/recordings/'+quest+'/submit?public=true','POST',webm(),'video/webm')).status,409);
 assert.equal((await a('/me')).data.points.cultural,0);
 assert.equal((await a('/recordings/'+quest+'/submit','POST',webm(),'video/webm')).status,200);
 assert.equal((await a('/me')).data.points.cultural,1);
});

test('public captures and consumed views survive backend restart',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'zindagi-moments-')),filename=join(dir,'db.sqlite');
 const first=await setup(t,filename),{c:a}=await first.register('author'),{c:b}=await first.register('viewer');const id=await publish(a);
 assert.equal((await b('/moments/'+id+'/view','POST')).status,200);await first.shutdown();
 const second=await setup(t,filename);t.after(()=>rmSync(dir,{recursive:true,force:true}));const viewer=second.client();
 assert.equal((await viewer('/auth/login','POST',{username:'viewer',password:'test-password-123'})).status,200);
 assert.equal((await viewer('/moments')).data.posts[0].viewed,1);
 assert.equal((await viewer('/moments/'+id+'/view','POST')).status,410);
 const author=second.client();await author('/auth/login','POST',{username:'author',password:'test-password-123'});
 assert.deepEqual((await author('/moments/'+id+'/view','POST')).data,jpeg());
});

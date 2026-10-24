import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
const webm=()=>{const b=Buffer.alloc(2048,1);b.set([0x1a,0x45,0xdf,0xa3]);return b;};
async function setup(t,filename=':memory:'){let time=Date.now();const backend=createApp({filename,now:()=>time}),server=backend.app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
 let closed=false;const shutdown=async()=>{if(closed)return;closed=true;server.closeAllConnections();await new Promise(r=>server.close(r));backend.close();};t.after(shutdown);
 const client=()=>{let cookie='';return async(path,method='GET',body,mime='application/json',headers={})=>{const r=await fetch(url+'/api'+path,{method,headers:{cookie,'X-Zindagi':'1','Content-Type':mime,...headers},body:body===undefined?undefined:mime==='application/json'?JSON.stringify(body):body});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const data=r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer());return {status:r.status,data,headers:r.headers};};};
 const register=async name=>{const c=client(),r=await c('/auth/register','POST',{username:name,name,password:'test-password-123'});assert.equal(r.status,201);return {c,id:r.data.id};};
 return {backend,client,register,shutdown,advance:ms=>time+=ms};
}
const publish=async(c,makePublic=true,marker=1)=>{
 const ticket=(await c('/recordings/start','POST',{})).data.id,bytes=webm();bytes[100]=marker;
 const response=await c('/recordings/'+ticket+'/submit'+(makePublic?'?public=true':''),'POST',bytes,'video/webm');assert.equal(response.status,200);
 return (await c('/cultural-videos')).data.posts.find(p=>p.creatorId===response.data.id)?.id;
};
test('Cultural challenge publishing preserves private defaults and removes standalone capture APIs',async t=>{
 const {register,client}=await setup(t),{c:a}=await register('performer');
 assert.equal((await client()('/cultural-videos')).status,401);
 await publish(a,false);assert.equal((await a('/cultural-videos')).data.posts.length,0);
 const id=await publish(a,true,2);assert.ok(id);assert.equal((await a('/me')).data.points.cultural,2);
 assert.equal((await a('/moments/captures','POST',{kind:'photo'})).status,404);
 assert.equal((await a('/moments/'+id+'/view','POST')).status,404);
});
test('Cultural videos support unlimited concurrent playback and range seeking',async t=>{
 const {register}=await setup(t),{c:a}=await register('performer'),{c:b}=await register('viewer');const id=await publish(a),url='/cultural-videos/'+id+'/media';
 const results=await Promise.all([b(url),b(url),b(url)]);for(const r of results){assert.equal(r.status,200);assert.deepEqual(r.data,webm());}
 const range=await b(url,'GET',undefined,'application/json',{Range:'bytes=10-99'});assert.equal(range.status,206);assert.equal(range.data.length,90);assert.equal(range.headers.get('content-range'),'bytes 10-99/2048');
 assert.equal((await b(url,'GET',undefined,'application/json',{Range:'bytes=-10'})).data.length,10);
 assert.equal((await b(url,'GET',undefined,'application/json',{Range:'bytes=9000-'})).status,416);
 assert.equal((await b(url,'GET',undefined,'application/json',{Range:'bytes=-0'})).status,416);
 assert.equal((await b(url)).status,200);assert.equal('viewed' in (await b('/cultural-videos')).data.posts[0],false);
});
test('blocking and creator removal still protect shared videos without removing points',async t=>{
 const {register}=await setup(t),{c:a,id:author}=await register('performer'),{c:b}=await register('viewer');const id=await publish(a);
 assert.equal((await b('/cultural-videos/'+id,'DELETE')).status,403);
 await b('/blocks/'+author,'POST');assert.equal((await b('/cultural-videos')).data.posts.length,0);assert.equal((await b('/cultural-videos/'+id+'/media')).status,404);
 await a('/cultural-videos/'+id,'DELETE');assert.equal((await a('/cultural-videos/'+id+'/media')).status,404);assert.equal((await a('/me')).data.points.cultural,1);
});
test('legacy standalone moments stay out of Cultural gallery and old view records do not lock videos',async t=>{
 const {register,backend}=await setup(t),{c:a,id:author}=await register('performer');const id=await publish(a);
 backend.db.exec('CREATE TABLE moment_views(moment_id TEXT,user_id TEXT,viewed_at INTEGER)');backend.db.prepare('INSERT INTO moment_views VALUES(?,?,?)').run(id,author,Date.now());
 backend.db.prepare('INSERT INTO moments VALUES(?,?,?,?,?,?,?)').run('old-photo',author,'image/jpeg',webm(),2048,Date.now(),null);
 assert.equal((await a('/cultural-videos')).data.posts.length,1);assert.equal((await a('/cultural-videos/old-photo/media')).status,404);
 for(let i=0;i<3;i++)assert.equal((await a('/cultural-videos/'+id+'/media')).status,200);
});
test('Cultural video replay survives restart',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'zindagi-videos-')),filename=join(dir,'db.sqlite');
 const first=await setup(t,filename),{c:a}=await first.register('performer');const id=await publish(a);await a('/cultural-videos/'+id+'/media');await first.shutdown();
 const second=await setup(t,filename);t.after(()=>rmSync(dir,{recursive:true,force:true}));const viewer=second.client();await viewer('/auth/login','POST',{username:'performer',password:'test-password-123'});
 assert.deepEqual((await viewer('/cultural-videos/'+id+'/media')).data,webm());assert.deepEqual((await viewer('/cultural-videos/'+id+'/media')).data,webm());
});

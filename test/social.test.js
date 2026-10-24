import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
async function setup(t,filename=':memory:'){
 let time=Date.now();const backend=createApp({filename,now:()=>time}),server=backend.app.listen(0,'127.0.0.1');await once(server,'listening');let closed=false;
 const close=async()=>{if(closed)return;closed=true;server.closeAllConnections();await new Promise(r=>server.close(r));backend.close();};t.after(close);
 const base='http://127.0.0.1:'+server.address().port;
 const client=()=>{let cookie='';return async(path,method='GET',body,status=200)=>{const r=await fetch(base+'/api'+path,{method,headers:{cookie,'Content-Type':'application/json','X-Zindagi':'1'},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;};};
 const register=async name=>{const c=client();const user=await c('/auth/register','POST',{username:name,name,password:'social-test-password'},201);return {c,id:user.id};};
 const fix=(c,meters=0,accuracy=2,extra={})=>c('/location','PUT',{latitude:0,longitude:meters/(6371000*Math.PI/180),accuracy,capturedAt:++time,...extra});
 return {backend,client,register,fix,now:()=>time,advance:ms=>time+=ms,close};
}
test('Friends require recipient consent at any distance, support exact username lookup, decline and cancellation',async t=>{
 const {register}=await setup(t),a=await register('alice'),b=await register('bob'),c=await register('outsider');
 assert.equal((await a.c('/people?username=bob')).person.id,b.id);assert.equal((await a.c('/social')).presence.sharing,false);
 await a.c(`/social/friend/${a.id}/request`,'POST',{},404);
 await a.c(`/social/friend/${b.id}/request`,'POST',{},201);await a.c(`/social/friend/${b.id}/request`,'POST',{});
 assert.equal((await a.c('/me')).friends.length,0);await a.c(`/social/friend/${b.id}/accept`,'POST',{},403);
 await c.c(`/social/friend/${a.id}/accept`,'POST',{},404);await b.c(`/social/friend/${a.id}/request`,'POST',{},409);
 await b.c(`/social/friend/${a.id}/accept`,'POST',{});await b.c(`/social/friend/${a.id}/accept`,'POST',{});
 assert.deepEqual((await a.c('/me')).friends,[b.id]);assert.deepEqual((await b.c('/me')).friends,[a.id]);
 await b.c(`/social/friend/${a.id}`,'DELETE');assert.equal((await a.c('/me')).friends.length,0);
 await a.c(`/social/friend/${b.id}/request`,'POST',{},201);await b.c(`/social/friend/${a.id}/decline`,'POST',{});assert.equal((await a.c('/social')).links.length,0);
 await a.c(`/social/friend/${b.id}/request`,'POST',{},201);await a.c(`/social/friend/${b.id}`,'DELETE');await b.c(`/social/friend/${a.id}/accept`,'POST',{},404);
});
test('Connect acceptance checks fresh precise distance and uncertainty on the server',async t=>{
 const {register,fix}=await setup(t),a=await register('alice'),b=await register('bob');
 await a.c(`/social/connect/${b.id}/request`,'POST',{},201);await b.c(`/social/connect/${a.id}/accept`,'POST',{},409);
 await fix(a.c,0);await fix(b.c,60);await b.c(`/social/connect/${a.id}/accept`,'POST',{},409);
 await fix(b.c,2);await b.c(`/social/connect/${a.id}/accept`,'POST',{},409);
 await fix(b.c,20,30);await b.c(`/social/connect/${a.id}/accept`,'POST',{},409);
 await fix(b.c,7,2);await b.c(`/social/connect/${a.id}/accept`,'POST',{},409);
 await fix(b.c,20,2);assert.equal((await b.c('/social')).links[0].proximity.ready,true);
 // Moving away after the UI says ready must still prevent acceptance.
 await fix(a.c,100);await b.c(`/social/connect/${a.id}/accept`,'POST',{},409);
 await fix(a.c,0);await a.c(`/social/connect/${b.id}/accept`,'POST',{},403);
 await b.c(`/social/connect/${a.id}/accept`,'POST',{});assert.deepEqual((await a.c('/me')).connections,[b.id]);assert.deepEqual((await b.c('/me')).connections,[a.id]);assert.equal((await a.c('/me')).friends.length,0);
 await a.c('/location','DELETE');await b.c('/location','DELETE');await b.c(`/social/connect/${a.id}/accept`,'POST',{});assert.equal((await b.c('/social')).links.length,1);
 await a.c(`/social/connect/${b.id}`,'DELETE');assert.equal((await b.c('/me')).connections.length,0);
});
test('precise fixes expire, cannot be refreshed by replay, are not returned to others, and logout clears them',async t=>{
 const {register,fix,advance,now}=await setup(t),a=await register('alice'),b=await register('bob');await a.c(`/social/connect/${b.id}/request`,'POST',{},201);
 await a.c('/location','PUT',{latitude:0,longitude:0},400);
 await a.c('/location','PUT',{latitude:0,longitude:0,accuracy:0,capturedAt:now()},400);
 await a.c('/location','PUT',{latitude:0,longitude:0,accuracy:2,capturedAt:now()-31000},400);
 await a.c('/location','PUT',{latitude:0,longitude:0,accuracy:2,capturedAt:now()+6000},400);
 await fix(a.c,0);const timestamp=now();await a.c('/location','PUT',{latitude:0,longitude:0,accuracy:2,capturedAt:timestamp},409);await fix(b.c,20);
 const data=JSON.stringify(await b.c('/social'));for(const key of ['latitude','longitude','capturedAt'])assert.ok(!data.includes(key));
 advance(30001);await fix(b.c,20);assert.equal((await a.c('/social')).presence.sharing,false);await b.c(`/social/connect/${a.id}/accept`,'POST',{},409);
 await fix(a.c,0);await a.c('/auth/logout','POST');await b.c(`/social/connect/${a.id}/accept`,'POST',{},409);
});
test('blocks clear both relationships and legacy circles never become friends',async t=>{
 const {register,backend,fix}=await setup(t),a=await register('alice'),b=await register('bob');
 backend.db.prepare('INSERT INTO connections VALUES(?,?)').run(a.id,b.id);assert.equal((await a.c('/me')).connections.length,0);assert.equal((await a.c('/me')).friends.length,0);
 for(const kind of ['friend','connect']){await a.c(`/social/${kind}/${b.id}/request`,'POST',{},201);if(kind==='connect'){await fix(a.c,0);await fix(b.c,20);}await b.c(`/social/${kind}/${a.id}/accept`,'POST',{});}
 await b.c(`/blocks/${a.id}`,'POST');assert.equal((await a.c('/social')).links.length,0);assert.equal((await a.c('/me')).friends.length,0);assert.equal((await a.c('/me')).connections.length,0);assert.equal((await a.c('/people?username=bob')).person,null);
 await a.c(`/social/friend/${b.id}/request`,'POST',{},404);await a.c(`/connections/${b.id}`,'POST',{},404);
});
test('friendships and requests persist across restart while precise location does not',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'zindagi-social-')),filename=join(dir,'db.sqlite');const first=await setup(t,filename),a=await first.register('alice'),b=await first.register('bob');
 await a.c(`/social/friend/${b.id}/request`,'POST',{},201);await b.c(`/social/friend/${a.id}/accept`,'POST',{});await a.c(`/social/connect/${b.id}/request`,'POST',{},201);await first.fix(a.c,0);await first.fix(b.c,20);await first.close();
 const second=await setup(t,filename);t.after(()=>rmSync(dir,{recursive:true,force:true}));const c=second.client();await c('/auth/login','POST',{username:'bob',password:'social-test-password'});assert.deepEqual((await c('/me')).friends,[a.id]);assert.equal((await c('/social')).presence.sharing,false);await c(`/social/connect/${a.id}/accept`,'POST',{},409);
 assert.equal(second.backend.db.prepare("SELECT name FROM sqlite_master WHERE name='locations'").get(),undefined);
});
test('precise sharing on a private profile does not expose that person through nearby guild discovery',async t=>{
 const {register,fix}=await setup(t),a=await register('private_person'),b=await register('viewer');
 const guild=await a.c('/guilds','POST',{name:'Private nearby member',description:'Test',aspect:'academics'},201);
 await fix(a.c,0);await fix(b.c,20);assert.equal((await b.c('/guilds?nearby=true&radius=5')).length,0);assert.equal((await b.c('/recommendations?nearby=true&radius=5')).people.length,0);
 await a.c('/me','PATCH',{name:'Visible person',goal:'',interests:'academics',discoverable:true});assert.equal((await b.c('/guilds?nearby=true&radius=5'))[0].id,guild.id);
 await a.c('/me','PATCH',{name:'Private person',goal:'',interests:'academics',discoverable:false});assert.equal((await a.c('/social')).presence.sharing,false);
});

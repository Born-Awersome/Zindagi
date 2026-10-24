import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server/app.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
async function setup(t,filename=':memory:'){
 const backend=createApp({filename}),server=backend.app.listen(0,'127.0.0.1');await once(server,'listening');let closed=false;
 const close=async()=>{if(closed)return;closed=true;server.closeAllConnections();await new Promise(r=>server.close(r));backend.close();};t.after(close);
 const base='http://127.0.0.1:'+server.address().port;
 const client=()=>{let cookie='';return async(path,method='GET',body,status=200)=>{const r=await fetch(base+'/api'+path,{method,headers:{cookie,'Content-Type':'application/json','X-Zindagi':'1'},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const result=await r.json();assert.equal(r.status,status,JSON.stringify(result));return result;};};
 const register=async name=>{const c=client(),u=await c('/auth/register','POST',{username:name,name,password:'community-test-password'},201);return {c,id:u.id};};
 const friend=async(a,b)=>{await a.c(`/social/friend/${b.id}/request`,'POST',{},201);await b.c(`/social/friend/${a.id}/accept`,'POST',{});};
 return {backend,client,register,friend,close};
}
test('request notifications are private, idempotent, persistent and read state belongs to the recipient',async t=>{
 const {register}=await setup(t),a=await register('alice'),b=await register('bob'),c=await register('carol');
 await a.c(`/social/friend/${b.id}/request`,'POST',{},201);await a.c(`/social/friend/${b.id}/request`,'POST',{});
 let inbox=await b.c('/notifications');assert.equal(inbox.items.length,1);assert.equal(inbox.unread,1);assert.equal(inbox.items[0].actionable,true);assert.equal((await c.c('/notifications')).items.length,0);
 await c.c('/notifications/read','POST',{through:inbox.items[0].id});assert.equal((await b.c('/notifications')).unread,1);
 await b.c('/notifications/read','POST',{through:inbox.items[0].id});assert.equal((await b.c('/notifications')).unread,0);
 await a.c(`/social/connect/${b.id}/request`,'POST',{},201);assert.equal((await b.c('/notifications')).unread,1);
 await b.c(`/social/friend/${a.id}/accept`,'POST',{});await b.c(`/social/friend/${a.id}/accept`,'POST',{});assert.equal((await a.c('/notifications')).items.length,1);assert.equal((await a.c('/notifications')).items[0].event,'accepted');
 await a.c(`/social/connect/${b.id}`,'DELETE');inbox=await b.c('/notifications');assert.ok(inbox.items.every(n=>!n.actionable));
 await b.c(`/blocks/${a.id}`,'POST');assert.equal((await b.c('/notifications')).items.length,0);assert.equal((await a.c('/notifications')).items.length,0);
});
test('DMs require accepted friendship or connection, preserve exact text, and deduplicate retries',async t=>{
 const {register,friend}=await setup(t),a=await register('alice'),b=await register('bob'),c=await register('carol');
 await a.c(`/messages/${b.id}`,'POST',{body:'Hello',clientId:'message-0001'},403);await a.c(`/messages/${b.id}`,'GET',undefined,403);
 await a.c(`/social/friend/${b.id}/request`,'POST',{},201);await b.c(`/messages/${a.id}`,'POST',{body:'Pending',clientId:'message-0001'},403);await b.c(`/social/friend/${a.id}/accept`,'POST',{});
 const message={body:'Hello <img src=x onerror=alert(1)>\nHow are you?',clientId:'message-0001'};const first=await a.c(`/messages/${b.id}`,'POST',message,201);assert.equal((await a.c(`/messages/${b.id}`,'POST',message)).id,first.id);
 const messages=(await b.c(`/messages/${a.id}`)).messages;assert.equal(messages.length,1);assert.equal(messages[0].body,message.body);
 await c.c(`/messages/${a.id}`,'GET',undefined,403);assert.equal((await c.c('/conversations')).length,0);
 await friend(a,c);await a.c(`/messages/${c.id}`,'POST',message,409);
 await a.c(`/messages/${b.id}`,'POST',{body:' ',clientId:'message-0002'},400);await a.c(`/messages/${b.id}`,'POST',{body:'x'.repeat(2001),clientId:'message-0002'},400);
 await b.c(`/social/friend/${a.id}`,'DELETE');await a.c(`/messages/${b.id}`,'GET',undefined,403);await a.c(`/messages/${b.id}`,'POST',{body:'Again',clientId:'message-0002'},403);
 // Connect alone is also sufficient, but must first pass the real acceptance check.
 await a.c(`/social/connect/${b.id}/request`,'POST',{},201);
 await a.c('/location','PUT',{latitude:0,longitude:0,accuracy:2,capturedAt:Date.now()});await b.c('/location','PUT',{latitude:0,longitude:20/(6371000*Math.PI/180),accuracy:2,capturedAt:Date.now()});await b.c(`/social/connect/${a.id}/accept`,'POST',{});
 await a.c(`/messages/${b.id}`,'POST',{body:'Connected hello',clientId:'message-0002'},201);
 await b.c(`/blocks/${a.id}`,'POST');await a.c(`/messages/${b.id}`,'GET',undefined,403);assert.ok(!(await a.c('/conversations')).some(p=>p.id===b.id));
});
test('message pagination and read cursors never expose another conversation or erase unread arrivals',async t=>{
 const {backend,register,friend}=await setup(t),a=await register('alice'),b=await register('bob'),c=await register('carol');await friend(a,b);await friend(a,c);
 const pair=[a.id,b.id].sort();for(let i=0;i<65;i++)backend.db.prepare('INSERT INTO direct_messages(sender,recipient,user_low,user_high,body,client_id,created_at) VALUES(?,?,?,?,?,?,?)').run(a.id,b.id,...pair,'Message '+i,'seed-'+i,Date.now()-120000);
 let page=await b.c(`/messages/${a.id}`);assert.equal(page.messages.length,50);assert.equal(page.hasMore,true);const first=page.messages[0].id,last=page.messages.at(-1).id;assert.equal((await b.c('/conversations'))[0].unread,65);
 page=await b.c(`/messages/${a.id}?before=${first}`);assert.equal(page.messages.length,15);assert.equal(page.hasMore,false);
 await b.c(`/messages/${a.id}/read`,'POST',{through:last-1});assert.equal((await b.c('/conversations'))[0].unread,1);
 await b.c(`/messages/${a.id}/read`,'POST',{through:first});assert.equal((await b.c('/conversations'))[0].unread,1);
 assert.equal((await c.c(`/messages/${a.id}`)).messages.length,0);await c.c(`/messages/${b.id}?after=${last}`,'GET',undefined,403);
 await a.c(`/messages/${b.id}`,'POST',{body:'New arrival',clientId:'arrival-0001'},201);await b.c(`/messages/${a.id}/read`,'POST',{through:last});assert.equal((await b.c('/conversations'))[0].unread,1);page=await b.c(`/messages/${a.id}?after=${last}`);assert.equal(page.messages.length,1);
 await b.c(`/messages/${a.id}?after=-1`,'GET',undefined,400);await b.c(`/messages/${a.id}?before=1&after=2`,'GET',undefined,400);
});
test('notifications and messages survive server restart with account isolation',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'zindagi-community-')),file=join(dir,'db.sqlite');const one=await setup(t,file),a=await one.register('alice'),b=await one.register('bob');await one.friend(a,b);await a.c(`/messages/${b.id}`,'POST',{body:'See you tomorrow',clientId:'persistent-0001'},201);await one.close();
 const two=await setup(t,file);t.after(()=>rmSync(dir,{recursive:true,force:true}));const c=two.client();await c('/auth/login','POST',{username:'bob',password:'community-test-password'});assert.equal((await c(`/messages/${a.id}`)).messages[0].body,'See you tomorrow');assert.equal((await c('/notifications')).items.length,1);assert.equal((await c('/conversations'))[0].unread,1);
});
test('existing pending requests receive one notification when upgrading, without duplicates on restart',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'zindagi-inbox-upgrade-')),file=join(dir,'db.sqlite');const one=await setup(t,file),a=await one.register('alice'),b=await one.register('bob');await a.c(`/social/friend/${b.id}/request`,'POST',{},201);one.backend.db.exec('DROP TABLE notifications');await one.close();
 const two=await setup(t,file);let client=two.client();await client('/auth/login','POST',{username:'bob',password:'community-test-password'});assert.equal((await client('/notifications')).unread,1);await two.close();
 const three=await setup(t,file);t.after(()=>rmSync(dir,{recursive:true,force:true}));client=three.client();await client('/auth/login','POST',{username:'bob',password:'community-test-password'});assert.equal((await client('/notifications')).items.length,1);
});

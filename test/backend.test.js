import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { rankPeople, rankTasks } from '../server/recommendations.js';

async function setup(t,filename=':memory:'){
 let time=Date.now();const backend=createApp({filename,now:()=>time});const server=backend.app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));backend.close();});
 const url=`http://127.0.0.1:${server.address().port}`;
 const client=()=>{let cookie='';return async(path,method='GET',body,expected=200)=>{if(path==='/location'&&method==='PUT')body={accuracy:5,capturedAt:++time,...body};const response=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json','X-Zindagi':'1',cookie},body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return result;};};
 return {client,url,backend,advance:ms=>time+=ms};
}
const register=(client,username)=>client('/auth/register','POST',{username,password:'test-password-123',name:username},201);
const visible=(client,name,interests='academics')=>client('/me','PATCH',{name,goal:'Study for exams and learn programming',interests,discoverable:true});

test('authenticated accounts, server scoring, guild isolation, connections and privacy',async t=>{
 const {client,url,advance}=await setup(t),a=client(),b=client(),outsider=client();
 await a('/me','GET',undefined,401);
 const alice=await register(a,'alice'),bob=await register(b,'bob');await register(outsider,'outsider');
 assert.equal(alice.points.academics,0);
 await a('/auth/login','POST',{username:'alice',password:'incorrect-password'},401);
 let recs=await a('/recommendations');assert.equal(recs.people.length,0);
 await visible(a,'Alice');await visible(b,'Bob');
 recs=await a('/recommendations');assert.equal(recs.people[0].id,bob.id);assert.ok(recs.people[0].reasons.length);
 assert.ok(!('password' in recs.people[0]));assert.ok(!('username' in recs.people[0]));
 await a('/location','PUT',{latitude:12.9716,longitude:77.5946});await b('/location','PUT',{latitude:12.98,longitude:77.60});
 recs=await a('/recommendations?nearby=true&radius=5');assert.equal(recs.people.length,1);assert.ok(!JSON.stringify(recs).includes('latitude'));assert.ok(!('distance' in recs.people[0]));
 await a('/recommendations?radius=NaN','GET',undefined,400);
 await a('/location','PUT',{latitude:91,longitude:0},400);
 const guild=await a('/guilds','POST',{name:'Shared Scholars',description:'Learn together',aspect:'academics'},201);
 await b(`/guilds/${guild.id}/leaderboard`,'GET',undefined,403);
 await b(`/guilds/${guild.id}/join`,'POST');await b(`/guilds/${guild.id}/join`,'POST');
 assert.equal((await a('/guilds'))[0].memberCount,2);
 await outsider(`/guilds/${guild.id}/leaderboard`,'GET',undefined,403);
 const session=(await a('/sessions','POST',{taskId:'study',points:999,minutes:0},201)).session;
 await b(`/sessions/${session.id}/complete`,'POST',undefined,404);
 await a('/sessions','POST',{taskId:'study'},409);
 await a(`/sessions/${session.id}/complete`,'POST',undefined,409);
 advance(3000000);await a(`/sessions/${session.id}/complete`,'POST',undefined,409);
 await a(`/sessions/${session.id}/pause`,'POST');advance(600000);await a(`/sessions/${session.id}/complete`,'POST',undefined,409);
 await a(`/sessions/${session.id}/resume`,'POST');advance(600000);
 const completed=await a(`/sessions/${session.id}/complete`,'POST');assert.equal(completed.points.academics,1);
 const repeated=await a(`/sessions/${session.id}/complete`,'POST');assert.equal(repeated.points.academics,1);assert.equal(repeated.history.length,1);
 const board=await b(`/guilds/${guild.id}/leaderboard`);assert.equal(board[0].id,alice.id);assert.equal(board[0].score,1);
 assert.equal((await b(`/guilds/${guild.id}/leaderboard?aspect=fitness`))[0].score,0);
 await a('/location','PUT',{latitude:12.97,longitude:77.59});await b('/location','PUT',{latitude:12.98,longitude:77.60});
 await a(`/social/friend/${bob.id}/request`,'POST',{},201);await b(`/social/friend/${alice.id}/accept`,'POST',{});assert.ok((await a('/me')).friends.includes(bob.id));
 await b(`/blocks/${alice.id}`,'POST');assert.equal((await a('/recommendations')).people.length,0);assert.equal((await a('/me')).friends.length,0);
 await a(`/social/friend/${bob.id}/request`,'POST',{},404);
 await b(`/guilds/${guild.id}/membership`,'DELETE');await b(`/guilds/${guild.id}/leaderboard`,'GET',undefined,403);
 await a('/location','DELETE');await a('/recommendations?nearby=true','GET',undefined,409);
 const response=await fetch(url+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);
 const cross=await fetch(url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Zindagi':'1',Origin:'https://attacker.example'},body:'{}'});assert.equal(cross.status,403);
 await a('/auth/logout','POST');await a('/me','GET',undefined,401);
});

test('opt-in, expired presence, and opt-out remove nearby eligibility',async t=>{
 const {client,advance}=await setup(t),a=client(),b=client();await register(a,'nearby_a');await register(b,'nearby_b');
 assert.equal((await a('/social')).presence.sharing,false);await visible(a,'A');await visible(b,'B');
 for(const c of [a,b])await c('/location','PUT',{latitude:0,longitude:0});
 assert.equal((await a('/recommendations?nearby=true')).people.length,1);
 advance(30001);await a('/location','PUT',{latitude:0,longitude:0});assert.equal((await a('/recommendations?nearby=true')).people.length,0);
 await b('/location','PUT',{latitude:0,longitude:0});await b('/me','PATCH',{name:'B',goal:'',interests:'fitness',discoverable:false});assert.equal((await a('/recommendations')).people.length,0);
});

test('database survives restart without persisting location',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'zindagi-test-'));const filename=join(dir,'test.sqlite');
 let time=Date.now();const first=createApp({filename,now:()=>time});const server=first.app.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(url+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-Zindagi':'1'},body:JSON.stringify({username:'persist',name:'Persistent',password:'test-password-123'})});assert.equal(response.status,201);const cookie=response.headers.get('set-cookie').split(';')[0];await response.json();
 const headers={'Content-Type':'application/json','X-Zindagi':'1',cookie};
 const task=await (await fetch(url+'/api/sessions',{method:'POST',headers,body:JSON.stringify({taskId:'study'})})).json();time+=3600001;
 assert.equal((await fetch(url+`/api/sessions/${task.session.id}/complete`,{method:'POST',headers})).status,200);
 assert.equal((await fetch(url+'/api/guilds',{method:'POST',headers,body:JSON.stringify({name:'Persistent Guild',description:'Saved across restarts',aspect:'academics'})})).status,201);
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));first.close();
 const second=createApp({filename,now:()=>time});const again=second.app.listen(0,'127.0.0.1');await once(again,'listening');t.after(async()=>{again.closeAllConnections();await new Promise(resolve=>again.close(resolve));second.close();rmSync(dir,{recursive:true,force:true});});
 const me=await fetch(`http://127.0.0.1:${again.address().port}/api/me`,{headers:{cookie}});const restored=await me.json();assert.equal(restored.name,'Persistent');assert.equal(restored.points.academics,1);assert.equal(restored.guildIds.length,1);assert.equal(restored.history.length,1);
 assert.equal(second.db.prepare("SELECT name FROM sqlite_master WHERE name='locations'").get(),undefined);
});

test('hybrid recommendations handle cold start, similarity, distance and deterministic ranking',()=>{
 const points={academics:0,career:0,social:0,fitness:0,cultural:0},now=Date.now();
 const viewer={id:'a',interests:'academics',goal:'Learn programming',points,location:{latitude:0,longitude:0}};
 const candidates=[{id:'b',name:'B',interests:'academics',goal:'Learn programming',points,discoverable:true,updatedAt:now,location:{latitude:0,longitude:.01}},{id:'c',name:'C',interests:'fitness',goal:'Train',points,discoverable:true,updatedAt:now,location:{latitude:0,longitude:10}},{id:'private',discoverable:false}];
 const ranked=rankPeople(viewer,candidates,{now});assert.equal(ranked[0].id,'b');assert.ok(ranked.every(p=>Number.isFinite(p.score)));assert.equal(ranked.length,2);
 assert.equal(rankPeople(viewer,candidates,{nearby:true,radius:5,now}).length,1);
 assert.equal(rankPeople({...viewer,location:null},candidates,{nearby:true,now}).length,0);
 assert.equal(rankTasks(viewer)[0].category,'academics');
 const tied=[{...candidates[0],id:'z'},{...candidates[0],id:'d'}];assert.deepEqual(rankPeople(viewer,tied,{now}).map(p=>p.id),['d','z']);
 const active={...viewer,points:{...points,academics:10}};const similar={...candidates[0],id:'similar',points:{...points,academics:20}};const different={...candidates[0],id:'different',points:{...points,fitness:20}};assert.equal(rankPeople(active,[different,similar],{now})[0].id,'similar');
});

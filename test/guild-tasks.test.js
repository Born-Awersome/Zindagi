import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
async function setup(t,filename=':memory:'){
 let time=Date.now();const backend=createApp({filename,now:()=>time});const server=backend.app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));backend.close();});
 const url=`http://127.0.0.1:${server.address().port}`;
 const client=()=>{let cookie='';return async(path,method='GET',body,expected=200)=>{const response=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json','X-Zindagi':'1',cookie},body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return result;};};
 return {client,url,backend,advance:ms=>time+=ms};
}
const register=(client,username)=>client('/auth/register','POST',{username,password:'test-password-123',name:username},201);
const visible=(client,name,interests='academics')=>client('/me','PATCH',{name,goal:'Study for exams and learn programming',interests,discoverable:true});


test('leader quests enforce permissions, approval, repeat safety and guild-only scoring',async t=>{
 const {client}=await setup(t),leader=client(),member=client(),other=client();
 await register(leader,'leader');const person=await register(member,'member');await register(other,'other');
 const guild=await leader('/guilds','POST',{name:'Local heroes',description:'Our challenges',aspect:'academics'},201),base=`/guilds/${guild.id}/tasks`;
 const payload={title:'Solve ten problems',description:'Practice and explain your solutions',category:'academics',points:17};
 await other(base,'GET',undefined,403);await member(`/guilds/${guild.id}/join`,'POST');
 await member(base,'POST',payload,403);await leader(base,'POST',{...payload,points:101},400);await leader(base,'POST',{...payload,points:1.5},400);
 const task=await leader(base,'POST',payload,201),path=`${base}/${task.id}`;
 assert.equal((await member(base)).isLeader,false);
 await member(path+'/submit','POST',{note:'Solved all ten problems'},201);
 assert.equal((await leader(`/guilds/${guild.id}/leaderboard`)).find(p=>p.id===person.id).score,0);
 await member(path+'/submit','POST',{note:'Duplicate'},409);
 await member(path+'/review/'+person.id,'POST',{decision:'approved'},403);
 await leader(path+'/review/'+person.id,'POST',{decision:'rejected'});
 await member(path+'/submit','POST',{note:'Corrected my solutions'},201);
 await leader(path+'/review/'+person.id,'POST',{decision:'approved'});
 await leader(path+'/review/'+person.id,'POST',{decision:'approved'});
 const board=await member(`/guilds/${guild.id}/leaderboard`);
 assert.equal(board[0].id,person.id);assert.equal(board[0].score,17);assert.equal(board[0].guildPoints,17);
 assert.equal((await member('/me')).points.academics,0);
 assert.equal((await member('/leaderboard')).find(p=>p.id===person.id).score,0);
 assert.equal((await member(`/guilds/${guild.id}/leaderboard?aspect=cultural`))[0].score,0);
 const second=await member('/guilds','POST',{name:'Other circle',description:'Separate',aspect:'academics'},201);
 assert.equal((await member(`/guilds/${second.id}/leaderboard`))[0].score,0);
 const closed=await leader(base,'POST',payload,201);
 await leader(`${base}/${closed.id}`,'PATCH',{closed:true});
 await member(`${base}/${closed.id}/submit`,'POST',{note:'Should be blocked'},409);
});
test('Cultural guild recording creates pending receipt and awards only approved guild points',async t=>{
 const {client,url}=await setup(t),leader=client(),member=client();
 await register(leader,'cultural_leader');const user=await register(member,'cultural_member');
 const guild=await leader('/guilds','POST',{name:'Music circle',description:'Play together',aspect:'cultural'},201);
 await member(`/guilds/${guild.id}/join`,'POST');
 const base=`/guilds/${guild.id}/tasks`,task=await leader(base,'POST',{title:'Perform a song',description:'Record your guitar performance',category:'cultural',points:12},201);
 await member(`${base}/${task.id}/submit`,'POST',{note:'No recording'},400);
 const login=await fetch(url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Zindagi':'1'},body:JSON.stringify({username:'cultural_member',password:'test-password-123'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const ticket=await member('/recordings/start','POST',{guildTaskId:task.id},201);
 const bytes=Buffer.alloc(2048);Buffer.from([0x1a,0x45,0xdf,0xa3]).copy(bytes);
 const response=await fetch(url+`/api/recordings/${ticket.id}/submit`,{method:'POST',headers:{cookie,'Content-Type':'video/webm','X-Zindagi':'1'},body:bytes});
 assert.equal(response.status,200);assert.equal((await response.json()).points.cultural,0);
 const pending=(await leader(base)).pending;assert.equal(pending.length,1);assert.equal(pending[0].recording_id,ticket.id);
 await leader(`${base}/${task.id}/review/${user.id}`,'POST',{decision:'approved'});
 assert.equal((await member(`/guilds/${guild.id}/leaderboard?aspect=cultural`))[0].score,12);
 assert.equal((await member('/me')).points.cultural,0);
});

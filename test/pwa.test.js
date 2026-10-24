import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const script=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(fetchImpl=async()=>new Response('online')){
 const handlers={},entries=new Map(),writes=[];
 const cache={addAll:async files=>{for(const file of files){writes.push(file);entries.set(file,new Response(file));}},match:async key=>entries.get(key)?.clone()};
 runInNewContext(script,{URL,Response,fetch:fetchImpl,self:{location:{origin:'https://zindagi.example'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>{handlers[name]=fn;}},caches:{open:async()=>cache,keys:async()=>['unrelated-app-cache','zindagi-offline-v1'],delete:async()=>true}});
 return {handlers,writes};
}
test('PWA caches offline resources but leaves accounts, videos and mutations to the network',async()=>{
 const {handlers,writes}=worker();let installed;handlers.install({waitUntil:p=>installed=p});await installed;
 assert.ok(writes.includes('/offline.html'));assert.ok(writes.every(p=>p==='/offline.html'||p.startsWith('/icons/')));
 for(const [path,method,mode] of [['/api/me','GET','cors'],['/api/cultural-videos/id/media','GET','cors'],['/api/recordings/id/submit','POST','cors'],['/','POST','navigate'],['https://other.example/','GET','navigate']]){
  let intercepted=false;handlers.fetch({request:{url:new URL(path,'https://zindagi.example').href,method,mode},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false,path);
 }
});
test('PWA navigation uses the live server and falls back to a reconnect page on network failure',async()=>{
 for(const offline of [false,true]){
  const {handlers}=worker(async()=>{if(offline)throw new Error('offline');return new Response('fresh application');});let installed;handlers.install({waitUntil:p=>installed=p});await installed;
  let response;handlers.fetch({request:{url:'https://zindagi.example/',method:'GET',mode:'navigate'},respondWith:p=>response=p});assert.equal(await(await response).text(),offline?'/offline.html':'fresh application');
 }
});

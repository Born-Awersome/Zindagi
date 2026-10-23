import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import https from 'node:https';
import { transportOptions, createWebServer } from '../server/transport.js';
import { createApp } from '../server/app.js';

test('TLS configuration fails closed instead of falling back to HTTP',()=>{
 assert.equal(transportOptions({}),null);
 assert.throws(()=>transportOptions({HTTPS_CERT:'missing'}),/both/);
 assert.throws(()=>transportOptions({HTTPS_KEY:'missing'}),/both/);
 assert.throws(()=>transportOptions({HTTPS_CERT:'missing',HTTPS_KEY:'missing'}),/ENOENT/);
});
test('HTTPS serves accounts and recording submissions with verified TLS and secure cookies',async t=>{
 try{execFileSync('openssl',['version'],{stdio:'ignore'});}catch{t.skip('OpenSSL is needed to generate a temporary test certificate');return;}
 const dir=mkdtempSync(join(tmpdir(),'zindagi-tls-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const cert=join(dir,'cert.pem'),key=join(dir,'key.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 const tls=transportOptions({HTTPS_CERT:cert,HTTPS_KEY:key}),backend=createApp({filename:':memory:',production:true});
 const server=createWebServer(backend.app,tls);server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));backend.close();});
 const origin='https://127.0.0.1:'+server.address().port;let cookie='';
 const request=(path,body,raw=false,requestOrigin=origin)=>new Promise((resolve,reject)=>{
  const req=https.request(origin+path,{method:body===undefined?'GET':'POST',ca:tls.cert,headers:{Origin:requestOrigin,'X-Zindagi':'1',Cookie:cookie,'Content-Type':raw?'video/webm':'application/json'}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data:JSON.parse(text)}));});req.on('error',reject);req.end(body===undefined?undefined:raw?body:JSON.stringify(body));
 });
 assert.equal((await request('/api/health')).status,200);
 const account=await request('/api/auth/register',{username:'tlsuser',name:'TLS user',password:'tls-test-password'});
 assert.equal(account.status,201);assert.match(account.headers['set-cookie'][0],/; Secure/);cookie=account.headers['set-cookie'][0].split(';')[0];
 assert.equal((await request('/api/me')).status,200);
 assert.equal((await request('/api/recordings/start',{},false,'https://other.example')).status,403);
 const ticket=await request('/api/recordings/start',{});assert.equal(ticket.status,201);
 const bytes=Buffer.alloc(2048);Buffer.from([0x1a,0x45,0xdf,0xa3]).copy(bytes);
 const result=await request('/api/recordings/'+ticket.data.id+'/submit',bytes,true);
 assert.equal(result.status,200);assert.equal(result.data.points.cultural,1);
 assert.match(result.headers['permissions-policy'],/camera=\(self\)/);
});

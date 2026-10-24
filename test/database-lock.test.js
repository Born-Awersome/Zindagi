import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'zindagi-lock-')),filename=join(dir,'db.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));const backend=createApp({filename});backend.db.exec("INSERT INTO users(id,username,password,name,interests,updated_at) VALUES('one','one','test','Existing player','academics',0)");backend.close();return filename;}
test('startup waits for a competing writer and preserves its committed data',async t=>{
 const filename=fixture(t);
 const worker=new Worker(`const {DatabaseSync}=require('node:sqlite');const {parentPort,workerData}=require('node:worker_threads');const db=new DatabaseSync(workerData);db.exec("BEGIN IMMEDIATE; UPDATE users SET name='Saved by other connection' WHERE id='one'");parentPort.postMessage('locked');setTimeout(()=>{db.exec('COMMIT');db.close();},250);`,{eval:true,workerData:filename});
 t.after(()=>worker.terminate());const exited=once(worker,'exit');await once(worker,'message');
 const backend=createApp({filename});try{assert.equal(backend.db.prepare('PRAGMA busy_timeout').get().timeout,5000);assert.equal(backend.db.prepare("SELECT name FROM users WHERE id='one'").get().name,'Saved by other connection');}finally{backend.close();}
 assert.equal((await exited)[0],0);
});
test('persistent lock gives recovery instructions and startup recovers after lock release',t=>{
 const filename=fixture(t),editor=new DatabaseSync(filename);editor.exec('BEGIN IMMEDIATE');
 try{assert.throws(()=>createApp({filename,busyTimeoutMs:30}),e=>e.code==='DATABASE_BUSY'&&e.message.includes('DB Browser')&&e.message.includes('Do not delete'));}finally{editor.exec('ROLLBACK');editor.close();}
 const backend=createApp({filename});try{assert.equal(backend.db.prepare('SELECT COUNT(*) n FROM users').get().n,1);}finally{backend.close();}
});
test('failed migration rolls back its earlier updates and releases the connection',t=>{
 const filename=fixture(t),editor=new DatabaseSync(filename);
 editor.exec("UPDATE users SET interests='creativity'; INSERT INTO guilds VALUES('guild','Test guild','test','creativity','one'); CREATE TRIGGER fail_migration BEFORE UPDATE ON guilds BEGIN SELECT RAISE(ABORT,'intentional migration failure'); END;");editor.close();
 assert.throws(()=>createApp({filename}),/intentional migration failure/);
 const check=new DatabaseSync(filename);assert.equal(check.prepare("SELECT interests FROM users WHERE id='one'").get().interests,'creativity');check.exec('DROP TRIGGER fail_migration');check.close();
 const recovered=createApp({filename});try{assert.equal(recovered.db.prepare("SELECT interests FROM users WHERE id='one'").get().interests,'cultural');}finally{recovered.close();}
});

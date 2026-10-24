import express from 'express';
import { randomUUID } from 'node:crypto';
import { validateRecording } from './recordings.js';
import { MAX_RECORDING_BYTES, RECORDING_TICKET_MS } from '../src/recording-policy.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function installMomentRoutes({app,db,now}) {
  db.exec(`CREATE TABLE IF NOT EXISTS moments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),mime TEXT NOT NULL,media BLOB NOT NULL,bytes INTEGER NOT NULL,created_at INTEGER NOT NULL,recording_id TEXT UNIQUE REFERENCES activity(id));
    CREATE TABLE IF NOT EXISTS moment_views(moment_id TEXT NOT NULL REFERENCES moments(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),viewed_at INTEGER NOT NULL,PRIMARY KEY(moment_id,user_id));
    CREATE TABLE IF NOT EXISTS moment_captures(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,expires INTEGER NOT NULL,post_id TEXT,consumed INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS moments_date ON moments(created_at DESC);`);
  const get=(s,...a)=>db.prepare(s).get(...a),run=(s,...a)=>db.prepare(s).run(...a);
  function publish(user,bytes,mime,recording=null){
    if(get('SELECT COUNT(*) n FROM moments WHERE user_id=?',user).n>=10)throw fail(409,'You can keep 10 public moments. Remove an older post first, or submit your quest privately.');
    if(get('SELECT COALESCE(SUM(bytes),0) n FROM moments').n+bytes.length>1024*1024*1024)throw fail(409,'Public media storage is full. Submit privately or try later.');
    const id=randomUUID();run('INSERT INTO moments VALUES(?,?,?,?,?,?,?)',id,user,mime,bytes,bytes.length,now(),recording);return id;
  }
  const visible=(id,user)=>get(`SELECT m.id,m.user_id,m.mime,m.bytes FROM moments m WHERE m.id=? AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.target=m.user_id) OR (b.target=? AND b.user_id=m.user_id))`,id,user,user);
  app.get('/api/moments',(req,res)=>{
    const offset=Number(req.query.offset||0);if(!Number.isSafeInteger(offset)||offset<0)throw fail(400,'Invalid feed offset.');
    const mine=req.query.mine==='true';
    const posts=db.prepare(`SELECT m.id,m.user_id AS creatorId,u.name,m.mime,m.created_at AS createdAt,EXISTS(SELECT 1 FROM moment_views v WHERE v.moment_id=m.id AND v.user_id=?) AS viewed FROM moments m JOIN users u ON u.id=m.user_id WHERE (?=0 OR m.user_id=?) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.target=m.user_id) OR (b.target=? AND b.user_id=m.user_id)) ORDER BY m.created_at DESC,m.id LIMIT 21 OFFSET ?`).all(req.user,Number(mine),req.user,req.user,req.user,offset);
    res.json({posts:posts.slice(0,20),hasMore:posts.length>20});
  });
  app.post('/api/moments/captures',(req,res)=>{
    if(!['photo','video'].includes(req.body.kind))throw fail(400,'Choose photo or video.');
    run('DELETE FROM moment_captures WHERE expires<=?',now());
    if(get('SELECT COUNT(*) n FROM moment_captures WHERE user_id=? AND consumed=0',req.user).n>=3)throw fail(409,'Close an unfinished capture or wait 15 minutes.');
    const id=randomUUID();run('INSERT INTO moment_captures(id,user_id,kind,expires) VALUES(?,?,?,?)',id,req.user,req.body.kind,now()+RECORDING_TICKET_MS);res.status(201).json({id});
  });
  app.delete('/api/moments/captures/:id',(req,res)=>{run('DELETE FROM moment_captures WHERE id=? AND user_id=? AND consumed=0',req.params.id,req.user);res.json({ok:true});});
  app.post('/api/moments/captures/:id/publish',(req,res,next)=>{
    const capture=get('SELECT * FROM moment_captures WHERE id=? AND user_id=?',req.params.id,req.user);
    if(!capture||capture.expires<=now())throw fail(404,'Capture expired. Take a new photo or video.');
    if(capture.consumed)return res.json({id:capture.post_id});
    if(req.query.public!=='true')throw fail(400,'Choose to make this capture public before publishing.');
    next();
  },express.raw({type:['image/jpeg','video/webm','video/mp4'],limit:MAX_RECORDING_BYTES}),(req,res)=>{
    const capture=get('SELECT * FROM moment_captures WHERE id=? AND user_id=?',req.params.id,req.user);
    if(!capture||capture.expires<=now())throw fail(409,'Capture was discarded or expired.');
    if(capture.consumed)return res.json({id:capture.post_id});
    const bytes=req.body,mime=req.get('content-type')?.split(';')[0].trim().toLowerCase();
    if(capture.kind==='video')validateRecording(bytes,mime);
    else if(mime!=='image/jpeg'||!Buffer.isBuffer(bytes)||bytes.length<1024||bytes.length>MAX_RECORDING_BYTES||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw fail(400,'Capture a valid JPEG photo with the camera.');
    db.exec('BEGIN IMMEDIATE');let id;
    try{id=publish(req.user,bytes,mime);run('UPDATE moment_captures SET consumed=1,post_id=? WHERE id=?',id,capture.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    res.status(201).json({id});
  });
  // One atomic claim and one byte response, never a reusable public media URL.
  // Consumed even if transmission fails; simultaneous tabs cannot claim twice.
  app.post('/api/moments/:id/view',(req,res)=>{
    const post=visible(req.params.id,req.user);if(!post)throw fail(404,'Moment is unavailable.');
    const claimed=run('INSERT OR IGNORE INTO moment_views VALUES(?,?,?)',post.id,req.user,now());
    if(!claimed.changes)throw fail(410,'You have already opened this moment.');
    const media=get('SELECT media FROM moments WHERE id=?',post.id).media;
    res.set({'Cache-Control':'private, no-store, max-age=0','Content-Type':post.mime,'Cross-Origin-Resource-Policy':'same-origin','Content-Disposition':'inline','X-Content-Type-Options':'nosniff'}).send(Buffer.from(media));
  });
  app.delete('/api/moments/:id',(req,res)=>{
    const post=get('SELECT user_id FROM moments WHERE id=?',req.params.id);if(!post)throw fail(404,'Moment not found.');if(post.user_id!==req.user)throw fail(403,'Only the creator can remove this moment.');
    run('DELETE FROM moments WHERE id=?',req.params.id);res.json({ok:true});
  });
  return publish;
}

import express from 'express';
import { installSocialRoutes } from './social.js';
import { LOCATION_TTL_MS } from '../src/proximity-policy.js';
import { isDatabaseBusy, databaseLockMessage } from './database.js';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { categories, tasks } from '../src/data.js';
import { installCulturalVideoRoutes } from './cultural-videos.js';
import { installGuildTaskRoutes } from './guild-tasks.js';
import { installRecordingRoutes, migrateCultural } from './recordings.js';
import { rankPeople, rankTasks, distanceKm } from './recommendations.js';
const derive=promisify(scrypt), hash=s=>createHash('sha256').update(s).digest('hex');
const aspectIds=categories.map(c=>c.id);
const fail=(status,message)=>Object.assign(new Error(message),{status});
function text(value,min,max,label){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw fail(400,`${label} must have ${min}–${max} characters.`);return value.trim();}
function passwordValue(value){if(typeof value!=='string'||value.length<10||value.length>128)throw fail(400,'Password must have 10–128 characters.');return value;}
function aspect(value){if(!aspectIds.includes(value))throw fail(400,'Choose a valid life aspect.');return value;}
export function createApp({filename=process.env.DATABASE_PATH||'data/zindagi.sqlite',now=Date.now,production=process.env.NODE_ENV==='production',origin=process.env.APP_ORIGIN,busyTimeoutMs=5000}={}) {
  if(filename!==':memory:')mkdirSync(dirname(resolve(filename)),{recursive:true});
  if(!Number.isInteger(busyTimeoutMs)||busyTimeoutMs<0||busyTimeoutMs>30000)throw new Error('Invalid SQLite busy timeout.');
  const db=new DatabaseSync(filename);
  try {
  // Set the wait before schema creation and migrations, including on Node 24.12.
  db.exec('PRAGMA busy_timeout='+busyTimeoutMs);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,name TEXT NOT NULL,goal TEXT DEFAULT '',interests TEXT DEFAULT 'academics',discoverable INTEGER DEFAULT 0,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS activity(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),task_id TEXT NOT NULL,started INTEGER NOT NULL,ends INTEGER NOT NULL,paused INTEGER,status TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active ON activity(user_id) WHERE status='active';
    CREATE TABLE IF NOT EXISTS awards(activity_id TEXT PRIMARY KEY REFERENCES activity(id),user_id TEXT REFERENCES users(id),category TEXT NOT NULL,points INTEGER NOT NULL,at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS guilds(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,description TEXT NOT NULL,aspect TEXT NOT NULL,creator TEXT REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS members(guild_id TEXT REFERENCES guilds(id),user_id TEXT REFERENCES users(id),PRIMARY KEY(guild_id,user_id));
    CREATE TABLE IF NOT EXISTS connections(user_id TEXT REFERENCES users(id),target TEXT REFERENCES users(id),PRIMARY KEY(user_id,target));
    CREATE TABLE IF NOT EXISTS blocks(user_id TEXT REFERENCES users(id),target TEXT REFERENCES users(id),PRIMARY KEY(user_id,target));
  `);
  migrateCultural(db);
  // Opt-in precise locations expire quickly and never go to disk or other users.
  const locations=new Map(),locationExpiry=new Map();const buckets=new Map();
  const app=express();app.disable('x-powered-by');
  app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Permissions-Policy':'geolocation=(self), camera=(self), microphone=(self)'});if(req.path.startsWith('/api'))res.set('Cache-Control','no-store');next();});
  app.use('/api',(req,res,next)=>{
    const time=now();for(const [k,b]of buckets)if(b.until<time)buckets.delete(k);
    const auth=req.path==='/auth/login'||req.path==='/auth/register';const key=`${req.ip}:${auth?'auth':'api'}`;const bucket=buckets.get(key)||{count:0,until:time+(auth?900000:60000)};bucket.count++;buckets.set(key,bucket);
    if(bucket.count>(auth?30:300))return res.status(429).json({error:'Too many requests. Please try again later.'});
    if(!['GET','HEAD'].includes(req.method)){
      if(req.get('X-Zindagi')!=='1')return res.status(403).json({error:'Missing request protection header.'});
      const requestOrigin=req.get('origin');
      if(req.get('sec-fetch-site')==='cross-site'||(requestOrigin&&(origin?requestOrigin!==origin:new URL(requestOrigin).host!==req.get('host'))))return res.status(403).json({error:'Cross-origin requests are not allowed.'});
    }
    next();
  });
  app.use(express.json({limit:'16kb'}));
  app.use('/api',(req,res,next)=>{req.body??={};if(typeof req.body!=='object'||Array.isArray(req.body))return res.status(400).json({error:'Expected a JSON object.'});next();});
  const run=(sql,...args)=>db.prepare(sql).run(...args),get=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args);
  function clearLocation(id){clearTimeout(locationExpiry.get(id));locationExpiry.delete(id);locations.delete(id);}
  function location(id){const item=locations.get(id);if(item&&item.expires>now())return item;clearLocation(id);return null;}
  function publicUser(id){const u=get('SELECT id,name,goal,interests,discoverable,updated_at FROM users WHERE id=?',id);if(!u)return null;const points=Object.fromEntries(aspectIds.map(k=>[k,0]));for(const r of all('SELECT category,SUM(points) points FROM awards WHERE user_id=? GROUP BY category',id))points[r.category]=r.points;return {id:u.id,name:u.name,goal:u.goal,interests:u.interests,discoverable:!!u.discoverable,updatedAt:u.updated_at,points};}
  function currentSession(id){const s=get("SELECT * FROM activity WHERE user_id=? AND status='active'",id);if(!s)return null;const t=tasks.find(t=>t.id===s.task_id);return {...t,id:s.id,taskId:t.id,startedAt:s.started,endsAt:s.ends,pausedAt:s.paused,duration:t.minutes*60000,demo:false};}
  function state(id){const user=publicUser(id);return {...user,session:currentSession(id),history:all('SELECT a.category,a.points,a.at,t.task_id,r.activity_id AS recordingId FROM awards a JOIN activity t ON t.id=a.activity_id LEFT JOIN recording_receipts r ON r.activity_id=a.activity_id WHERE a.user_id=? ORDER BY a.at DESC LIMIT 100',id).map(h=>({...h,mode:h.recordingId?'recording':'timed',title:h.task_id==='create'&&!h.recordingId?'Earlier Cultural activity':tasks.find(t=>t.id===h.task_id).title})),username:get('SELECT username FROM users WHERE id=?',id).username,friends:all("SELECT user_low,user_high FROM social_links WHERE kind='friend' AND status='accepted' AND (user_low=? OR user_high=?)",id,id).map(r=>r.user_low===id?r.user_high:r.user_low),connections:all("SELECT user_low,user_high FROM social_links WHERE kind='connect' AND status='accepted' AND (user_low=? OR user_high=?)",id,id).map(r=>r.user_low===id?r.user_high:r.user_low),guildIds:all('SELECT guild_id FROM members WHERE user_id=?',id).map(x=>x.guild_id),serverNow:now()};}
  function sessionCookie(res,id){const token=randomBytes(32).toString('hex');run('INSERT INTO auth VALUES(?,?,?)',hash(token),id,now()+7*86400000);res.cookie('zindagi_session',token,{httpOnly:true,sameSite:'strict',secure:production,maxAge:7*86400000,path:'/'});}
  app.get('/api/health',(_req,res)=>res.json({ok:true}));
  app.post('/api/auth/register',async(req,res)=>{const username=text(req.body.username,3,32,'Username').toLowerCase();if(!/^[a-z0-9_]+$/.test(username))throw fail(400,'Use letters, numbers, or underscores for your username.');const password=passwordValue(req.body.password),name=text(req.body.name,1,32,'Name');const salt=randomBytes(16).toString('hex'),digest=await derive(password,salt,64);const id=randomUUID();try{run('INSERT INTO users(id,username,password,name,updated_at) VALUES(?,?,?,?,?)',id,username,`${salt}:${digest.toString('hex')}`,name,now());}catch(error){if(error.message.includes('UNIQUE'))throw fail(409,'Username is unavailable.');throw error;}sessionCookie(res,id);res.status(201).json(state(id));});
  app.post('/api/auth/login',async(req,res)=>{const username=text(req.body.username,3,32,'Username').toLowerCase(),password=passwordValue(req.body.password);const user=get('SELECT * FROM users WHERE username=?',username);const [salt,expected]=(user?.password||`${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');const digest=await derive(password,salt,64);if(!user||!timingSafeEqual(digest,Buffer.from(expected,'hex')))throw fail(401,'Incorrect username or password.');sessionCookie(res,user.id);res.json(state(user.id));});
  app.use('/api',(req,res,next)=>{const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('zindagi_session='))?.slice(16);const auth=token&&get('SELECT user_id FROM auth WHERE token=? AND expires>?',hash(token),now());if(!auth)return res.status(401).json({error:'Please sign in to continue.'});req.user=auth.user_id;req.token=hash(token);next();});
  installSocialRoutes({app,db,now,location,blocked});
  app.get('/api/me',(req,res)=>res.json(state(req.user)));
  app.post('/api/auth/logout',(req,res)=>{run('DELETE FROM auth WHERE token=?',req.token);clearLocation(req.user);res.clearCookie('zindagi_session',{httpOnly:true,sameSite:'strict',secure:production,path:'/'});res.json({ok:true});});
  app.patch('/api/me',(req,res)=>{const name=text(req.body.name,1,32,'Name'),goal=text(req.body.goal,0,100,'Goal'),interest=aspect(req.body.interests);if(typeof req.body.discoverable!=='boolean')throw fail(400,'Choose whether to appear in discovery.');run('UPDATE users SET name=?,goal=?,interests=?,discoverable=?,updated_at=? WHERE id=?',name,goal,interest,Number(req.body.discoverable),now(),req.user);if(!req.body.discoverable)clearLocation(req.user);res.json(state(req.user));});
  app.get('/api/tasks',(req,res)=>res.json(rankTasks(publicUser(req.user))));
  app.post('/api/sessions',(req,res)=>{const task=tasks.find(t=>t.id===req.body.taskId);if(!task)throw fail(400,'Unknown task.');if(task.mode==='recording')throw fail(400,'Cultural quests require a fresh camera recording, not a timer.');run("UPDATE activity SET status='cancelled' WHERE user_id=? AND status='recording' AND ends<=?",req.user,now());if(get("SELECT 1 FROM activity WHERE user_id=? AND status IN ('active','recording')",req.user))throw fail(409,'Finish or discard your current quest first.');run('INSERT INTO activity VALUES(?,?,?,?,?,?,?)',randomUUID(),req.user,task.id,now(),now()+task.minutes*60000,null,'active');res.status(201).json(state(req.user));});
  app.post('/api/sessions/:id/:action',(req,res)=>{const s=get('SELECT * FROM activity WHERE id=? AND user_id=?',req.params.id,req.user);if(!s)throw fail(404,'Session not found.');if(tasks.find(t=>t.id===s.task_id)?.mode==='recording')throw fail(400,'Use the recording flow for Cultural quests.');const action=req.params.action;if(!['pause','resume','cancel','complete'].includes(action))throw fail(400,'Unknown session action.');if(s.status==='completed'&&action==='complete')return res.json(state(req.user));if(s.status!=='active')throw fail(409,'Session is no longer active.');
    if(action==='pause'&&s.paused===null)run('UPDATE activity SET paused=? WHERE id=?',now(),s.id);
    if(action==='resume'&&s.paused!==null){const elapsed=now()-s.paused;run('UPDATE activity SET started=started+?,ends=ends+?,paused=NULL WHERE id=?',elapsed,elapsed,s.id);}
    if(action==='cancel')run("UPDATE activity SET status='cancelled' WHERE id=?",s.id);
    if(action==='complete'){if(s.paused!==null||now()<s.ends)throw fail(409,'Complete the full session before collecting points.');const task=tasks.find(t=>t.id===s.task_id);db.exec('BEGIN IMMEDIATE');try{run('INSERT INTO awards VALUES(?,?,?,?,?)',s.id,req.user,task.category,task.points,now());run("UPDATE activity SET status='completed' WHERE id=?",s.id);run('UPDATE users SET updated_at=? WHERE id=?',now(),req.user);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}
    res.json(state(req.user));
  });
  installGuildTaskRoutes({app,db,now});
  const publishMoment=installCulturalVideoRoutes({app,db,now});
  installRecordingRoutes({app,db,now,state,publishMoment});
  app.put('/api/location',(req,res)=>{
    const {latitude,longitude,accuracy,capturedAt}=req.body;
    if(typeof latitude!=='number'||!Number.isFinite(latitude)||latitude < -90||latitude>90||typeof longitude!=='number'||!Number.isFinite(longitude)||longitude < -180||longitude>180)throw fail(400,'Invalid coordinates.');
    if(typeof accuracy!=='number'||!Number.isFinite(accuracy)||accuracy<=0||accuracy>100000)throw fail(400,'A valid GPS accuracy estimate is required.');
    if(typeof capturedAt!=='number'||!Number.isFinite(capturedAt)||capturedAt<=now()-LOCATION_TTL_MS||capturedAt>now()+5000)throw fail(400,'Location is stale or the device clock is incorrect. Request a fresh fix.');
    const previous=location(req.user);if(previous&&capturedAt<=previous.capturedAt)throw fail(409,'Waiting for a newer GPS reading.');
    for(const id of locations.keys())location(id);
    const expires=Math.min(now()+LOCATION_TTL_MS,capturedAt+LOCATION_TTL_MS);
    clearLocation(req.user);locations.set(req.user,{latitude,longitude,accuracy,capturedAt,expires});
    const userId=req.user,timer=setTimeout(()=>clearLocation(userId),Math.max(0,expires-now()));timer.unref();locationExpiry.set(userId,timer);res.json({ok:true,expiresAt:expires,accuracyMeters:accuracy});
  });
  app.delete('/api/location',(req,res)=>{clearLocation(req.user);res.json({ok:true});});
  function blocked(a,b){return !!get('SELECT 1 FROM blocks WHERE (user_id=? AND target=?) OR (user_id=? AND target=?)',a,b,b,a);}
  app.get('/api/recommendations',(req,res)=>{const nearby=req.query.nearby==='true',radius=Number(req.query.radius||10);if(!Number.isFinite(radius)||radius<1||radius>100)throw fail(400,'Radius must be 1–100 km.');const viewer={...publicUser(req.user),location:location(req.user)};if(nearby&&!viewer.location)throw fail(409,'Enable precise location first.');const candidates=all('SELECT id FROM users WHERE discoverable=1 AND id!=?',req.user).filter(u=>!blocked(req.user,u.id)).map(u=>({...publicUser(u.id),location:location(u.id)}));const ranked=rankPeople(viewer,candidates,{nearby,radius,now:now()});res.json({model:'hybrid-v1',people:ranked.map(({location,score,distance,...p})=>({...p,distanceLabel:distance===null?null:distance<2?'Within about 2 km':`About ${Math.ceil(distance/5)*5} km away`})),tasks:rankTasks(viewer)});});
  app.post('/api/blocks/:id',(req,res)=>{if(!publicUser(req.params.id)||req.params.id===req.user)throw fail(404,'Person is unavailable.');run('INSERT OR IGNORE INTO blocks VALUES(?,?)',req.user,req.params.id);run('DELETE FROM social_links WHERE (user_low=? AND user_high=?) OR (user_low=? AND user_high=?)',req.user,req.params.id,req.params.id,req.user);run('DELETE FROM connections WHERE (user_id=? AND target=?) OR (user_id=? AND target=?)',req.user,req.params.id,req.params.id,req.user);res.json({ok:true});});
  function guildView(g,id){const members=all('SELECT user_id FROM members WHERE guild_id=?',g.id);return {...g,memberCount:members.length,joined:members.some(m=>m.user_id===id),isLeader:g.creator===id&&members.some(m=>m.user_id===id),leaderName:get('SELECT name FROM users WHERE id=?',g.creator)?.name||'Guild leader'};}
  app.get('/api/guilds',(req,res)=>{let guilds=all('SELECT id,name,description,aspect,creator FROM guilds ORDER BY name').map(g=>guildView(g,req.user));if(req.query.nearby==='true'){const here=location(req.user),radius=Number(req.query.radius||10);if(!here)throw fail(409,'Enable precise location first.');if(!Number.isFinite(radius)||radius<1||radius>100)throw fail(400,'Invalid radius.');guilds=guilds.filter(g=>all('SELECT user_id FROM members WHERE guild_id=?',g.id).some(m=>m.user_id!==req.user&&publicUser(m.user_id).discoverable&&!blocked(req.user,m.user_id)&&location(m.user_id)&&distanceKm(here,location(m.user_id))<=radius));}res.json(guilds);});
  app.post('/api/guilds',(req,res)=>{const name=text(req.body.name,3,40,'Guild name'),description=text(req.body.description,0,140,'Description'),focus=aspect(req.body.aspect),id=randomUUID();if(get('SELECT COUNT(*) n FROM guilds WHERE creator=?',req.user).n>=20)throw fail(409,'You can create up to 20 guilds.');db.exec('BEGIN IMMEDIATE');try{run('INSERT INTO guilds VALUES(?,?,?,?,?)',id,name,description,focus,req.user);run('INSERT INTO members VALUES(?,?)',id,req.user);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');if(error.message.includes('UNIQUE'))throw fail(409,'A guild with this name already exists.');throw error;}res.status(201).json({id});});
  app.post('/api/guilds/:id/join',(req,res)=>{if(!get('SELECT id FROM guilds WHERE id=?',req.params.id))throw fail(404,'Guild not found.');run('INSERT OR IGNORE INTO members VALUES(?,?)',req.params.id,req.user);res.json(state(req.user));});
  app.delete('/api/guilds/:id/membership',(req,res)=>{run('DELETE FROM members WHERE guild_id=? AND user_id=?',req.params.id,req.user);res.json(state(req.user));});
  function board(ids,focus){if(focus!=='all')aspect(focus);return ids.map(id=>publicUser(id)).filter(Boolean).map(u=>({id:u.id,name:u.name,score:focus==='all'?Object.values(u.points).reduce((a,b)=>a+b,0):u.points[focus],you:u.id})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).map((u,i,rows)=>({...u,rank:rows.findIndex(x=>x.score===u.score)+1}));}
  app.get('/api/guilds/:id/leaderboard',(req,res)=>{if(!get('SELECT 1 FROM members WHERE guild_id=? AND user_id=?',req.params.id,req.user))throw fail(403,'Join the guild to see its members and leaderboard.');const focus=req.query.aspect||'all';const rows=board(all('SELECT user_id FROM members WHERE guild_id=?',req.params.id).map(r=>r.user_id),focus).map(u=>{const extra=get("SELECT COALESCE(SUM(s.awarded_points),0) points FROM guild_submissions s JOIN guild_tasks t ON t.id=s.task_id WHERE t.guild_id=? AND s.user_id=? AND s.status='approved' AND (?='all' OR t.category=?)",req.params.id,u.id,focus,focus).points;return {...u,baseScore:u.score,guildPoints:extra,score:u.score+extra};}).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));res.json(rows.map(u=>({...u,rank:rows.findIndex(x=>x.score===u.score)+1})));});
  app.get('/api/leaderboard',(req,res)=>res.json(board(all('SELECT id FROM users WHERE discoverable=1 OR id=?',req.user).map(u=>u.id).filter(id=>!blocked(req.user,id)),req.query.aspect||'all')));
  app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found.'}));
  app.get('/sw.js',(_req,res)=>{res.set({'Cache-Control':'no-cache','Service-Worker-Allowed':'/'});res.sendFile(resolve('dist/sw.js'));});
  app.use(express.static(resolve('dist')));
  app.get('/',(_req,res)=>res.sendFile(resolve('dist/index.html')));
  app.use((error,_req,res,_next)=>{if(isDatabaseBusy(error))return res.set('Retry-After','5').status(503).json({error:'The database is busy. Please try again shortly.'});const status=error.status||500;res.status(status).json({error:status===500?'Server error. Please try again.':error.message});});
  const cleanup=setInterval(()=>{for(const id of locations.keys())location(id);try{run('DELETE FROM auth WHERE expires<=?',now());}catch(error){if(!isDatabaseBusy(error))console.error('Session cleanup failed:',error.message);}},30000);cleanup.unref();
  return {app,db,close:()=>{clearInterval(cleanup);for(const id of locations.keys())clearLocation(id);db.close();}};
  } catch(error) {
    // Closing also rolls back an interrupted startup migration and releases locks.
    db.close();
    if(isDatabaseBusy(error))throw Object.assign(new Error(databaseLockMessage,{cause:error}),{code:'DATABASE_BUSY'});
    throw error;
  }
}

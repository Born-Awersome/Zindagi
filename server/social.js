import { distanceKm } from './recommendations.js';
import { CONNECT_MIN_METERS,CONNECT_MAX_METERS,CONNECT_MAX_ACCURACY_METERS } from '../src/proximity-policy.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function proximityCheck(a,b){
 if(!a||!b)return {ready:false,reason:'Both people must share a fresh precise location. Keep Community or Guilds open on both devices.'};
 if(a.accuracy>CONNECT_MAX_ACCURACY_METERS||b.accuracy>CONNECT_MAX_ACCURACY_METERS)return {ready:false,reason:'GPS is not accurate enough. Both devices need accuracy of 10 metres or better. Try outdoors with precise location enabled.'};
 const distance=distanceKm(a,b)*1000,error=a.accuracy+b.accuracy;
 if(distance<CONNECT_MIN_METERS||distance>CONNECT_MAX_METERS)return {ready:false,reason:'You need to be 5–40 metres apart to accept Connect.'};
 if(distance-error<CONNECT_MIN_METERS||distance+error>CONNECT_MAX_METERS)return {ready:false,reason:'GPS uncertainty overlaps the distance limit. Move nearer the middle of the 5–40 metre range or wait for a better fix.'};
 return {ready:true,reason:'Fresh location readings meet the 5–40 metre check.'};
}
export function installSocialRoutes({app,db,now,location,blocked}){
 db.exec("CREATE TABLE IF NOT EXISTS social_links(kind TEXT NOT NULL CHECK(kind IN ('friend','connect')),user_low TEXT NOT NULL REFERENCES users(id),user_high TEXT NOT NULL REFERENCES users(id),requested_by TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','accepted')),created_at INTEGER NOT NULL,accepted_at INTEGER,PRIMARY KEY(kind,user_low,user_high),CHECK(user_low<user_high));");
 const get=(s,...a)=>db.prepare(s).get(...a),run=(s,...a)=>db.prepare(s).run(...a);
 const pair=(a,b)=>[a,b].sort();
 function target(req){if(!['friend','connect'].includes(req.params.kind))throw fail(400,'Choose Friend or Connect.');const id=req.params.target;if(id===req.user||!get('SELECT id FROM users WHERE id=?',id)||blocked(req.user,id))throw fail(404,'Person is unavailable.');return pair(req.user,id);}
 function links(user){return db.prepare('SELECT * FROM social_links WHERE user_low=? OR user_high=?').all(user,user).filter(r=>!blocked(user,r.user_low===user?r.user_high:r.user_low)).map(r=>{const other=r.user_low===user?r.user_high:r.user_low;return {kind:r.kind,userId:other,name:get('SELECT name FROM users WHERE id=?',other).name,status:r.status,direction:r.requested_by===user?'outgoing':'incoming',createdAt:r.created_at,acceptedAt:r.accepted_at,...(r.kind==='connect'&&r.status==='pending'&&r.requested_by!==user?{proximity:proximityCheck(location(user),location(other))}:{})};});}
 app.get('/api/social',(req,res)=>{const own=location(req.user);res.json({links:links(req.user),presence:own?{sharing:true,accuracyMeters:own.accuracy,expiresAt:own.expires}:{sharing:false}});});
 app.get('/api/people',(req,res)=>{const username=String(req.query.username||'').trim().toLowerCase();if(!/^[a-z0-9_]{3,32}$/.test(username))throw fail(400,'Enter an exact username (3–32 letters, numbers, or underscores).');const person=get('SELECT id,name,interests FROM users WHERE username=?',username);if(!person||person.id===req.user||blocked(req.user,person.id))return res.json({person:null});res.json({person});});
 app.post('/api/social/:kind/:target/request',(req,res)=>{const [low,high]=target(req),old=get('SELECT * FROM social_links WHERE kind=? AND user_low=? AND user_high=?',req.params.kind,low,high);
  if(old){if(old.status==='pending'&&old.requested_by!==req.user)throw fail(409,'You already have a request from this person. Accept it from Incoming requests.');return res.json({ok:true});}
  run("INSERT INTO social_links VALUES(?,?,?,?,'pending',?,NULL)",req.params.kind,low,high,req.user,now());res.status(201).json({ok:true});
 });
 app.post('/api/social/:kind/:target/accept',(req,res)=>{const [low,high]=target(req),link=get('SELECT * FROM social_links WHERE kind=? AND user_low=? AND user_high=?',req.params.kind,low,high);
  if(!link)throw fail(404,'Request not found.');if(link.requested_by===req.user)throw fail(403,'Only the recipient can accept a request.');if(link.status==='accepted')return res.json({ok:true});
  if(req.params.kind==='connect'){const check=proximityCheck(location(req.user),location(req.params.target));if(!check.ready)throw fail(409,check.reason);}
  run("UPDATE social_links SET status='accepted',accepted_at=? WHERE kind=? AND user_low=? AND user_high=?",now(),req.params.kind,low,high);res.json({ok:true});
 });
 app.post('/api/social/:kind/:target/decline',(req,res)=>{const [low,high]=target(req),link=get('SELECT * FROM social_links WHERE kind=? AND user_low=? AND user_high=?',req.params.kind,low,high);if(!link)throw fail(404,'Request not found.');if(link.requested_by===req.user||link.status!=='pending')throw fail(403,'Only the recipient can decline a pending request.');run('DELETE FROM social_links WHERE kind=? AND user_low=? AND user_high=?',req.params.kind,low,high);res.json({ok:true});});
 app.delete('/api/social/:kind/:target',(req,res)=>{const [low,high]=target(req),link=get('SELECT * FROM social_links WHERE kind=? AND user_low=? AND user_high=?',req.params.kind,low,high);if(link?.status==='pending'&&link.requested_by!==req.user)throw fail(403,'Use Decline for incoming requests.');run('DELETE FROM social_links WHERE kind=? AND user_low=? AND user_high=?',req.params.kind,low,high);res.json({ok:true});});
 return {links};
}

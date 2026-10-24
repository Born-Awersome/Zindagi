import { installCommunityRoutes } from './community.js';
import { distanceKm } from './recommendations.js';
import { CONNECT_MIN_METERS,CONNECT_MAX_METERS,CONNECT_MAX_ACCURACY_METERS } from '../src/proximity-policy.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function proximityCheck(a,b){
 const checks={you:!a?'waiting':a.accuracy>CONNECT_MAX_ACCURACY_METERS?'improving':'ready',them:!b?'waiting':b.accuracy>CONNECT_MAX_ACCURACY_METERS?'improving':'ready'};
 const result=(code,reason)=>({ready:code==='ready',code,checks,reason});
 if(!a)return result('your_location','Enable precise location in My profile. Keep this page visible while GPS finds a fresh reading.');
 if(!b)return result('their_location','Waiting for the other person’s fresh location. Ask them to enable location in My profile and return to Community.');
 if(a.accuracy>CONNECT_MAX_ACCURACY_METERS)return result('your_accuracy','Your GPS needs better accuracy (10 metres or better). Try outdoors and keep GPS enabled.');
 if(b.accuracy>CONNECT_MAX_ACCURACY_METERS)return result('their_accuracy','The other person’s GPS needs better accuracy. Ask them to try outdoors; the check updates automatically.');
 const distance=distanceKm(a,b)*1000,error=a.accuracy+b.accuracy;
 if(distance<CONNECT_MIN_METERS)return result('too_close','You appear too close together. Move at least 5 metres apart; aim for around 20 metres.');
 if(distance>CONNECT_MAX_METERS)return result('too_far','You appear more than 40 metres apart. Move closer, then wait for the readings to update.');
 if(distance-error<CONNECT_MIN_METERS||distance+error>CONNECT_MAX_METERS)return result('uncertain','GPS uncertainty overlaps a distance limit. Aim for around 20 metres apart or wait for better accuracy.');
 return result('ready','Ready to connect. Fresh GPS readings meet the 5–40 metre check.');
}
export function installSocialRoutes({app,db,now,location,blocked}){
 db.exec("CREATE TABLE IF NOT EXISTS social_links(kind TEXT NOT NULL CHECK(kind IN ('friend','connect')),user_low TEXT NOT NULL REFERENCES users(id),user_high TEXT NOT NULL REFERENCES users(id),requested_by TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','accepted')),created_at INTEGER NOT NULL,accepted_at INTEGER,PRIMARY KEY(kind,user_low,user_high),CHECK(user_low<user_high));");
 const {notify}=installCommunityRoutes({app,db,now,blocked});
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{fn();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}};
 const get=(s,...a)=>db.prepare(s).get(...a),run=(s,...a)=>db.prepare(s).run(...a);
 const pair=(a,b)=>[a,b].sort();
 function target(req){if(!['friend','connect'].includes(req.params.kind))throw fail(400,'Choose Friend or Connect.');const id=req.params.target;if(id===req.user||!get('SELECT id FROM users WHERE id=?',id)||blocked(req.user,id))throw fail(404,'Person is unavailable.');return pair(req.user,id);}
 function links(user){return db.prepare('SELECT * FROM social_links WHERE user_low=? OR user_high=?').all(user,user).filter(r=>!blocked(user,r.user_low===user?r.user_high:r.user_low)).map(r=>{const other=r.user_low===user?r.user_high:r.user_low;return {kind:r.kind,userId:other,name:get('SELECT name FROM users WHERE id=?',other).name,status:r.status,direction:r.requested_by===user?'outgoing':'incoming',createdAt:r.created_at,acceptedAt:r.accepted_at,...(r.kind==='connect'&&r.status==='pending'?{proximity:proximityCheck(location(user),location(other))}:{})};});}
 app.get('/api/social',(req,res)=>{const own=location(req.user);res.json({links:links(req.user),presence:own?{sharing:true,accuracyMeters:own.accuracy,expiresAt:own.expires}:{sharing:false}});});
 app.get('/api/people',(req,res)=>{const username=String(req.query.username||'').trim().toLowerCase();if(!/^[a-z0-9_]{3,32}$/.test(username))throw fail(400,'Enter an exact username (3–32 letters, numbers, or underscores).');const person=get('SELECT id,name,interests FROM users WHERE username=?',username);if(!person||person.id===req.user||blocked(req.user,person.id))return res.json({person:null});res.json({person});});
 app.post('/api/social/:kind/:target/request',(req,res)=>{const [low,high]=target(req),old=get('SELECT * FROM social_links WHERE kind=? AND user_low=? AND user_high=?',req.params.kind,low,high);
  if(old){if(old.status==='pending'&&old.requested_by!==req.user)throw fail(409,'You already have a request from this person. Accept it from Incoming requests.');return res.json({ok:true});}
  transaction(()=>{run("INSERT INTO social_links VALUES(?,?,?,?,'pending',?,NULL)",req.params.kind,low,high,req.user,now());notify(req.params.target,req.user,req.params.kind,"request");});res.status(201).json({ok:true});
 });
 app.post('/api/social/:kind/:target/accept',(req,res)=>{const [low,high]=target(req),link=get('SELECT * FROM social_links WHERE kind=? AND user_low=? AND user_high=?',req.params.kind,low,high);
  if(!link)throw fail(404,'Request not found.');if(link.requested_by===req.user)throw fail(403,'Only the recipient can accept a request.');if(link.status==='accepted')return res.json({ok:true});
  if(req.params.kind==='connect'){const check=proximityCheck(location(req.user),location(req.params.target));if(!check.ready)throw fail(409,check.reason);}
  transaction(()=>{run("UPDATE social_links SET status='accepted',accepted_at=? WHERE kind=? AND user_low=? AND user_high=?",now(),req.params.kind,low,high);notify(req.params.target,req.user,req.params.kind,"accepted");run("UPDATE notifications SET read_at=? WHERE recipient=? AND actor=? AND kind=? AND event='request' AND read_at IS NULL",now(),req.user,req.params.target,req.params.kind);});res.json({ok:true});
 });
 app.post('/api/social/:kind/:target/decline',(req,res)=>{const [low,high]=target(req),link=get('SELECT * FROM social_links WHERE kind=? AND user_low=? AND user_high=?',req.params.kind,low,high);if(!link)throw fail(404,'Request not found.');if(link.requested_by===req.user||link.status!=='pending')throw fail(403,'Only the recipient can decline a pending request.');run('DELETE FROM social_links WHERE kind=? AND user_low=? AND user_high=?',req.params.kind,low,high);res.json({ok:true});});
 app.delete('/api/social/:kind/:target',(req,res)=>{const [low,high]=target(req),link=get('SELECT * FROM social_links WHERE kind=? AND user_low=? AND user_high=?',req.params.kind,low,high);if(link?.status==='pending'&&link.requested_by!==req.user)throw fail(403,'Use Decline for incoming requests.');run('DELETE FROM social_links WHERE kind=? AND user_low=? AND user_high=?',req.params.kind,low,high);res.json({ok:true});});
 return {links};
}

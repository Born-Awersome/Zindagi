const fail=(status,message)=>Object.assign(new Error(message),{status});
export function installCommunityRoutes({app,db,now,blocked}){
 db.exec(`
 CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,recipient TEXT NOT NULL REFERENCES users(id),actor TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('friend','connect')),event TEXT NOT NULL CHECK(event IN ('request','accepted')),created_at INTEGER NOT NULL,read_at INTEGER);
 CREATE INDEX IF NOT EXISTS notifications_inbox ON notifications(recipient,id DESC);
 CREATE TABLE IF NOT EXISTS direct_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,sender TEXT NOT NULL REFERENCES users(id),recipient TEXT NOT NULL REFERENCES users(id),user_low TEXT NOT NULL,user_high TEXT NOT NULL,body TEXT NOT NULL,client_id TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(sender,client_id));
 CREATE INDEX IF NOT EXISTS messages_pair ON direct_messages(user_low,user_high,id);
 CREATE INDEX IF NOT EXISTS messages_recipient ON direct_messages(recipient,sender,id);
 CREATE INDEX IF NOT EXISTS messages_sender_time ON direct_messages(sender,created_at);
 CREATE TABLE IF NOT EXISTS message_reads(user_id TEXT NOT NULL REFERENCES users(id),peer TEXT NOT NULL REFERENCES users(id),through_id INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,peer));
 `);
 db.exec("INSERT INTO notifications(recipient,actor,kind,event,created_at) SELECT CASE WHEN s.requested_by=s.user_low THEN s.user_high ELSE s.user_low END,s.requested_by,s.kind,'request',s.created_at FROM social_links s WHERE s.status='pending' AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.actor=s.requested_by AND n.kind=s.kind AND n.event='request' AND n.created_at=s.created_at AND n.recipient=CASE WHEN s.requested_by=s.user_low THEN s.user_high ELSE s.user_low END);");
 const get=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a);
 function target(req){const peer=req.params.peer;if(peer===req.user||blocked(req.user,peer)||!get("SELECT 1 FROM social_links WHERE status='accepted' AND ((user_low=? AND user_high=?) OR (user_low=? AND user_high=?))",req.user,peer,peer,req.user))throw fail(403,'Messaging is available only between current friends or connections.');return [req.user,peer].sort();}
 const cursor=(value,label)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw fail(400,`Invalid ${label}.`);return n;};
 const visibleNotifications=user=>all('SELECT n.*,u.name FROM notifications n JOIN users u ON u.id=n.actor WHERE n.recipient=? ORDER BY n.id DESC',user).filter(n=>!blocked(user,n.actor));
 app.get('/api/notifications',(req,res)=>{
  const rows=visibleNotifications(req.user);res.json({unread:rows.filter(n=>n.read_at===null).length,items:rows.slice(0,50).map(n=>({...n,actionable:n.event==='request'&&!!get("SELECT 1 FROM social_links WHERE kind=? AND status='pending' AND requested_by=? AND ((user_low=? AND user_high=?) OR (user_low=? AND user_high=?))",n.kind,n.actor,req.user,n.actor,n.actor,req.user)}))});
 });
 app.post('/api/notifications/read',(req,res)=>{const through=cursor(req.body.through,'notification cursor');run('UPDATE notifications SET read_at=? WHERE recipient=? AND id<=? AND read_at IS NULL',now(),req.user,through);res.json({ok:true});});
 app.get('/api/conversations',(req,res)=>{
  const peers=all("SELECT DISTINCT CASE WHEN user_low=? THEN user_high ELSE user_low END AS id FROM social_links WHERE status='accepted' AND (user_low=? OR user_high=?)",req.user,req.user,req.user).filter(p=>!blocked(req.user,p.id));
  res.json(peers.map(p=>{const pair=[req.user,p.id].sort(),last=get('SELECT id,sender,body,created_at FROM direct_messages WHERE user_low=? AND user_high=? ORDER BY id DESC LIMIT 1',...pair),read=get('SELECT through_id FROM message_reads WHERE user_id=? AND peer=?',req.user,p.id)?.through_id||0;return {id:p.id,name:get('SELECT name FROM users WHERE id=?',p.id).name,last:last||null,unread:get('SELECT COUNT(*) n FROM direct_messages WHERE sender=? AND recipient=? AND id>?',p.id,req.user,read).n};}).sort((a,b)=>(b.last?.id||0)-(a.last?.id||0)||a.name.localeCompare(b.name)));
 });
 app.get('/api/messages/:peer',(req,res)=>{
  const pair=target(req);if(req.query.before!==undefined&&req.query.after!==undefined)throw fail(400,'Choose one message cursor.');
  const before=req.query.before===undefined?null:cursor(req.query.before,'before cursor'),after=req.query.after===undefined?null:cursor(req.query.after,'after cursor');
  const rows=all(`SELECT id,sender,recipient,body,client_id,created_at FROM direct_messages WHERE user_low=? AND user_high=? ${before!==null?'AND id<?':after!==null?'AND id>?':''} ORDER BY id ${after!==null?'ASC':'DESC'} LIMIT 51`,...pair,...(before!==null?[before]:after!==null?[after]:[]));
  const hasMore=rows.length>50;rows.splice(50);if(after===null)rows.reverse();res.json({messages:rows,hasMore});
 });
 app.post('/api/messages/:peer',(req,res)=>{
  const pair=target(req),body=req.body.body,clientId=req.body.clientId;
  if(typeof body!=='string'||body.trim().length<1||body.trim().length>2000)throw fail(400,'Write a message between 1 and 2,000 characters.');
  if(typeof clientId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(clientId))throw fail(400,'A valid message identifier is required.');
  const old=get('SELECT * FROM direct_messages WHERE sender=? AND client_id=?',req.user,clientId);
  if(old){if(old.recipient!==req.params.peer||old.body!==body.trim())throw fail(409,'This message identifier was already used.');return res.json(old);}
  if(get('SELECT COUNT(*) n FROM direct_messages WHERE sender=? AND created_at>?',req.user,now()-60000).n>=30)throw fail(429,'Please wait a moment before sending more messages.');
  const result=run('INSERT INTO direct_messages(sender,recipient,user_low,user_high,body,client_id,created_at) VALUES(?,?,?,?,?,?,?)',req.user,req.params.peer,...pair,body.trim(),clientId,now());res.status(201).json(get('SELECT * FROM direct_messages WHERE id=?',result.lastInsertRowid));
 });
 app.post('/api/messages/:peer/read',(req,res)=>{target(req);const through=cursor(req.body.through,'message cursor');const actual=get('SELECT MAX(id) id FROM direct_messages WHERE sender=? AND recipient=? AND id<=?',req.params.peer,req.user,through)?.id||0;run('INSERT INTO message_reads VALUES(?,?,?) ON CONFLICT(user_id,peer) DO UPDATE SET through_id=MAX(through_id,excluded.through_id)',req.user,req.params.peer,actual);res.json({ok:true});});
 // Called in the same SQLite transaction as the relationship mutation.
 return {notify:(recipient,actor,kind,event)=>run('INSERT INTO notifications(recipient,actor,kind,event,created_at) VALUES(?,?,?,?,?)',recipient,actor,kind,event,now())};
}

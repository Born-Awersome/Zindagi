import { randomUUID } from 'node:crypto';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function installCulturalVideoRoutes({app,db,now}) {
  db.exec(`CREATE TABLE IF NOT EXISTS moments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),mime TEXT NOT NULL,media BLOB NOT NULL,bytes INTEGER NOT NULL,created_at INTEGER NOT NULL,recording_id TEXT UNIQUE REFERENCES activity(id));
    CREATE INDEX IF NOT EXISTS moments_date ON moments(created_at DESC);`);
  const get=(s,...a)=>db.prepare(s).get(...a),run=(s,...a)=>db.prepare(s).run(...a);
  function publish(user,bytes,mime,recording){
    if(!recording)throw fail(400,'Publish a photo or video through a Cultural challenge.');
    if(get('SELECT COUNT(*) n FROM moments WHERE user_id=? AND recording_id IS NOT NULL',user).n>=10)throw fail(409,'You can keep 10 public Cultural posts. Remove an older post first, or submit your quest privately.');
    if(get('SELECT COALESCE(SUM(bytes),0) n FROM moments').n+bytes.length>1024*1024*1024)throw fail(409,'Public media storage is full. Submit privately or try later.');
    const id=randomUUID();run('INSERT INTO moments VALUES(?,?,?,?,?,?,?)',id,user,mime,bytes,bytes.length,now(),recording);return id;
  }
  const visible=(id,user)=>get(`SELECT m.id,m.user_id,m.mime,m.bytes FROM moments m WHERE m.id=? AND m.recording_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.target=m.user_id) OR (b.target=? AND b.user_id=m.user_id))`,id,user,user);
  app.get('/api/cultural-videos',(req,res)=>{
    const offset=Number(req.query.offset||0);if(!Number.isSafeInteger(offset)||offset<0)throw fail(400,'Invalid feed offset.');
    const mine=req.query.mine==='true';
    const posts=db.prepare(`SELECT m.id,m.user_id AS creatorId,u.name,m.mime,m.created_at AS createdAt FROM moments m JOIN users u ON u.id=m.user_id WHERE m.recording_id IS NOT NULL AND (?=0 OR m.user_id=?) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.target=m.user_id) OR (b.target=? AND b.user_id=m.user_id)) ORDER BY m.created_at DESC,m.id LIMIT 21 OFFSET ?`).all(Number(mine),req.user,req.user,req.user,offset);
    res.json({posts:posts.slice(0,20),hasMore:posts.length>20});
  });
  app.get('/api/cultural-videos/:id/media',(req,res)=>{
    const post=visible(req.params.id,req.user);if(!post)throw fail(404,'Video is unavailable.');
    const media=Buffer.from(get('SELECT media FROM moments WHERE id=?',post.id).media);
    res.set({'Cache-Control':'private, no-store','Content-Type':post.mime,'Cross-Origin-Resource-Policy':'same-origin','Accept-Ranges':'bytes'});
    const range=req.get('range');
    if(range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(range);
      let start,end;
      if(match&&(match[1]||match[2])){
        start=match[1]?Number(match[1]):Math.max(0,media.length-Number(match[2]));
        end=match[1]?(match[2]?Math.min(Number(match[2]),media.length-1):media.length-1):media.length-1;
      }
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=media.length){res.set('Content-Range','bytes */'+media.length);return res.status(416).end();}
      res.set('Content-Range','bytes '+start+'-'+end+'/'+media.length);return res.status(206).send(media.subarray(start,end+1));
    }
    res.send(media);
  });
  app.delete('/api/cultural-videos/:id',(req,res)=>{
    const post=get('SELECT user_id FROM moments WHERE id=?',req.params.id);if(!post)throw fail(404,'Video not found.');if(post.user_id!==req.user)throw fail(403,'Only the creator can remove this post.');
    run('DELETE FROM moments WHERE id=?',req.params.id);res.json({ok:true});
  });
  return publish;
}

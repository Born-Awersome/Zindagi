import { randomUUID } from 'node:crypto';
import { categories } from '../src/data.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const text=(v,min,max)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)throw fail(400,`Text must have ${min}–${max} characters.`);return v.trim();};
export function installGuildTaskRoutes({app,db,now}) {
  db.exec(`CREATE TABLE IF NOT EXISTS guild_tasks(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL REFERENCES guilds(id),title TEXT NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL,points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 100),created_at INTEGER NOT NULL,closed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS guild_submissions(task_id TEXT NOT NULL REFERENCES guild_tasks(id),user_id TEXT NOT NULL REFERENCES users(id),note TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,awarded_points INTEGER NOT NULL DEFAULT 0,recording_id TEXT REFERENCES activity(id),submitted_at INTEGER NOT NULL,PRIMARY KEY(task_id,user_id));`);
  const get=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  function authorize(req,leader=false){const g=get('SELECT * FROM guilds WHERE id=?',req.params.id);if(!g)throw fail(404,'Guild not found.');if(!get('SELECT 1 FROM members WHERE guild_id=? AND user_id=?',g.id,req.user))throw fail(403,'Join this guild first.');if(leader&&g.creator!==req.user)throw fail(403,'Only the guild leader can manage tasks and points.');return g;}
  function task(req){const t=get('SELECT * FROM guild_tasks WHERE id=? AND guild_id=?',req.params.taskId,req.params.id);if(!t)throw fail(404,'Guild task not found.');return t;}
  app.get('/api/guilds/:id/tasks',(req,res)=>{
    const g=authorize(req);const tasks=all('SELECT * FROM guild_tasks WHERE guild_id=? ORDER BY created_at DESC,id',g.id).map(t=>({...t,submission:get('SELECT status,note,awarded_points,recording_id FROM guild_submissions WHERE task_id=? AND user_id=?',t.id,req.user)||null}));
    const pending=g.creator===req.user?all("SELECT s.task_id,s.user_id,s.note,s.recording_id,s.submitted_at,u.name,t.title,t.points FROM guild_submissions s JOIN guild_tasks t ON t.id=s.task_id JOIN users u ON u.id=s.user_id WHERE t.guild_id=? AND s.status='pending' ORDER BY s.submitted_at",g.id):[];
    res.json({tasks,pending,isLeader:g.creator===req.user});
  });
  app.post('/api/guilds/:id/tasks',(req,res)=>{
    authorize(req,true);const title=text(req.body.title,3,80),description=text(req.body.description,3,500),category=req.body.category,points=req.body.points;
    if(!categories.some(c=>c.id===category))throw fail(400,'Choose a valid life aspect.');if(!Number.isInteger(points)||points<1||points>100)throw fail(400,'Assign a whole number from 1 to 100 guild points.');
    if(get('SELECT COUNT(*) n FROM guild_tasks WHERE guild_id=?',req.params.id).n>=100)throw fail(409,'This guild has reached its 100-task limit.');
    const id=randomUUID();run('INSERT INTO guild_tasks(id,guild_id,title,description,category,points,created_at) VALUES(?,?,?,?,?,?,?)',id,req.params.id,title,description,category,points,now());res.status(201).json({id});
  });
  app.patch('/api/guilds/:id/tasks/:taskId',(req,res)=>{authorize(req,true);const t=task(req);if(typeof req.body.closed!=='boolean')throw fail(400,'Specify whether the task is closed.');run('UPDATE guild_tasks SET closed=? WHERE id=?',Number(req.body.closed),t.id);res.json({ok:true});});
  app.post('/api/guilds/:id/tasks/:taskId/submit',(req,res)=>{
    authorize(req);const t=task(req);if(t.closed)throw fail(409,'This task is closed.');if(t.category==='cultural')throw fail(400,'This Cultural task requires a fresh camera recording.');
    const note=text(req.body.note,3,500),old=get('SELECT status FROM guild_submissions WHERE task_id=? AND user_id=?',t.id,req.user);
    if(old&&old.status!=='rejected')throw fail(409,'This task is already submitted or awarded.');
    run("INSERT INTO guild_submissions(task_id,user_id,note,status,submitted_at) VALUES(?,?,?,'pending',?) ON CONFLICT(task_id,user_id) DO UPDATE SET note=excluded.note,status='pending',submitted_at=excluded.submitted_at",t.id,req.user,note,now());res.status(201).json({ok:true});
  });
  app.post('/api/guilds/:id/tasks/:taskId/review/:userId',(req,res)=>{
    authorize(req,true);const t=task(req),decision=req.body.decision;if(!['approved','rejected'].includes(decision))throw fail(400,'Choose approve or request another attempt.');
    const s=get('SELECT * FROM guild_submissions WHERE task_id=? AND user_id=?',t.id,req.params.userId);if(!s)throw fail(404,'Submission not found.');
    if(s.status===decision)return res.json({ok:true});if(s.status!=='pending')throw fail(409,'This submission has already been reviewed.');
    run('UPDATE guild_submissions SET status=?,awarded_points=? WHERE task_id=? AND user_id=?',decision,decision==='approved'?t.points:0,t.id,req.params.userId);res.json({ok:true});
  });
}

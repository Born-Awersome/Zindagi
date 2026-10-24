import express from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { MAX_PHOTO_BYTES, MAX_RECORDING_BYTES, MIN_RECORDING_BYTES, RECORDING_TICKET_MS, RECORDING_MIME_TYPES } from '../src/recording-policy.js';
const fail = (status, message) => Object.assign(new Error(message), {status});

export function migrateCultural(db) {
  // Idempotent migration; past awards keep their amounts and activity IDs.
  db.exec(`BEGIN IMMEDIATE;
    UPDATE users SET interests='cultural' WHERE interests='creativity';
    UPDATE guilds SET aspect='cultural' WHERE aspect='creativity';
    UPDATE awards SET category='cultural' WHERE category='creativity';
    UPDATE activity SET status='cancelled' WHERE task_id='create' AND status='active';
    CREATE TABLE IF NOT EXISTS recording_receipts (
      activity_id TEXT PRIMARY KEY REFERENCES activity(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      digest TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL,
      UNIQUE(user_id,digest)
    );
    COMMIT;
  `);
}

export function validateRecording(bytes, contentType) {
  const mime = contentType?.split(';')[0].trim().toLowerCase();
  if (!RECORDING_MIME_TYPES.includes(mime)) throw fail(415, 'Capture a JPEG photo or a WebM/MP4 video.');
  if (!Buffer.isBuffer(bytes) || bytes.length < MIN_RECORDING_BYTES) throw fail(400, 'The recording is empty or too short. Please record your performance again.');
  if (bytes.length > MAX_RECORDING_BYTES) throw fail(413, 'The recording is too large. Keep your performance under 60 seconds.');
  if(mime==='image/jpeg'){
    if(bytes.length>MAX_PHOTO_BYTES)throw fail(413,'Photo is too large. Retake at a lower resolution.');
    if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw fail(400,'Capture a valid JPEG photo.');
    let offset=2,dimensions=false;
    while(offset+4<bytes.length){if(bytes[offset]!==255)break;const marker=bytes[offset+1];offset+=2;if(marker===0xda||marker===0xd9)break;if(marker===0xff){offset--;continue;}const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)break;
      if([0xc0,0xc1,0xc2].includes(marker)&&length>=8){const h=bytes.readUInt16BE(offset+3),w=bytes.readUInt16BE(offset+5);dimensions=w>0&&h>0&&w<=4096&&h<=4096;break;}offset+=length;
    }
    if(!dimensions)throw fail(400,'Capture a photo with valid dimensions up to 4096 pixels.');
    return {mime,digest:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
  }
  const headerMatches = mime === 'video/webm'
    ? bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))
    : bytes.subarray(4,8).toString('ascii') === 'ftyp';
  if (!headerMatches) throw fail(400, 'This is not a supported recorded video. Please record again.');
  return {mime, digest:createHash('sha256').update(bytes).digest('hex'), bytes:bytes.length};
}

export function installRecordingRoutes({app, db, now, state, publishMoment}) {
  db.exec('CREATE TABLE IF NOT EXISTS recording_guild_tasks(activity_id TEXT PRIMARY KEY REFERENCES activity(id),task_id TEXT NOT NULL REFERENCES guild_tasks(id))');
  const get = (sql,...args) => db.prepare(sql).get(...args);
  const run = (sql,...args) => db.prepare(sql).run(...args);
  app.post('/api/recordings/start', (req,res) => {
    run("UPDATE activity SET status='cancelled' WHERE user_id=? AND status='recording' AND ends<=?",req.user,now());
    if (get("SELECT 1 FROM activity WHERE user_id=? AND status IN ('active','recording')",req.user)) throw fail(409,'Finish or discard your current quest before recording.');
    let guildTask=null;
    if(req.body.guildTaskId!==undefined){
      guildTask=get('SELECT * FROM guild_tasks WHERE id=?',req.body.guildTaskId);
      if(!guildTask||!get('SELECT 1 FROM members WHERE guild_id=? AND user_id=?',guildTask.guild_id,req.user))throw fail(403,'Join the guild to record for this task.');
      if(guildTask.category!=='cultural'||guildTask.closed)throw fail(400,'Choose an open Cultural guild task.');
      const previous=get('SELECT status FROM guild_submissions WHERE task_id=? AND user_id=?',guildTask.id,req.user);
      if(previous&&previous.status!=='rejected')throw fail(409,'This task is already submitted or awarded.');
    }
    const id=randomUUID(),expiresAt=now()+RECORDING_TICKET_MS;
    run('INSERT INTO activity VALUES(?,?,?,?,?,?,?)',id,req.user,'create',now(),expiresAt,null,'recording');
    if(guildTask)run('INSERT INTO recording_guild_tasks VALUES(?,?)',id,guildTask.id);
    res.status(201).json({id,expiresAt});
  });
  app.delete('/api/recordings/current', (req,res) => {
    run("UPDATE activity SET status='cancelled' WHERE user_id=? AND status='recording'",req.user);
    res.json({ok:true});
  });
  app.delete('/api/recordings/:id', (req,res) => {
    const recording=get("SELECT * FROM activity WHERE id=? AND user_id=? AND task_id='create'",req.params.id,req.user);
    if (!recording) throw fail(404,'Recording session not found.');
    if (recording.status==='recording') run("UPDATE activity SET status='cancelled' WHERE id=?",recording.id);
    res.json({ok:true});
  });
  app.post('/api/recordings/:id/submit', (req,res,next) => {
    const recording=get("SELECT * FROM activity WHERE id=? AND user_id=? AND task_id='create'",req.params.id,req.user);
    if (!recording) throw fail(404,'Recording session not found.');
    if (get('SELECT 1 FROM recording_receipts WHERE activity_id=?',recording.id)) return res.json(state(req.user));
    if (recording.status!=='recording' || recording.ends<=now()) throw fail(409,'This recording session expired or was discarded. Record a new performance.');
    req.recording=recording;
    next();
  }, express.raw({type:RECORDING_MIME_TYPES,limit:MAX_RECORDING_BYTES}), (req,res) => {
    const receipt=validateRecording(req.body,req.get('content-type'));
    // Re-check after reading the body in case cancellation happened during transfer.
    const current=get('SELECT status,ends FROM activity WHERE id=?',req.recording.id);
    if (get('SELECT 1 FROM recording_receipts WHERE activity_id=?',req.recording.id)) return res.json(state(req.user));
    if (current.status!=='recording'||current.ends<=now()) throw fail(409,'Recording session is no longer available.');
    if (get('SELECT 1 FROM recording_receipts WHERE user_id=? AND digest=?',req.user,receipt.digest)) throw fail(409,'This recording already earned a point. Record a new performance.');
    const linked=get('SELECT t.* FROM guild_tasks t JOIN recording_guild_tasks r ON r.task_id=t.id WHERE r.activity_id=?',req.recording.id);
    if(linked){
      if(linked.closed||!get('SELECT 1 FROM members WHERE guild_id=? AND user_id=?',linked.guild_id,req.user))throw fail(409,'This guild task is no longer available to you.');
      const old=get('SELECT status FROM guild_submissions WHERE task_id=? AND user_id=?',linked.id,req.user);if(old&&old.status!=='rejected')throw fail(409,'This guild task is already submitted.');
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      if(req.query.public==='true')publishMoment(req.user,req.body,receipt.mime,req.recording.id);
      run('INSERT INTO recording_receipts VALUES(?,?,?,?,?)',req.recording.id,req.user,receipt.digest,receipt.mime,receipt.bytes);
      if(linked)run("INSERT INTO guild_submissions(task_id,user_id,note,status,recording_id,submitted_at) VALUES(?,?,?,'pending',?,?) ON CONFLICT(task_id,user_id) DO UPDATE SET note=excluded.note,status='pending',recording_id=excluded.recording_id,submitted_at=excluded.submitted_at",linked.id,req.user,'Fresh Cultural recording submitted in the app.',req.recording.id,now());
      else run('INSERT INTO awards VALUES(?,?,?,?,?)',req.recording.id,req.user,'cultural',1,now());
      run("UPDATE activity SET status='completed' WHERE id=?",req.recording.id);
      run('UPDATE users SET updated_at=? WHERE id=?',now(),req.user);
      db.exec('COMMIT');
    } catch(error) {db.exec('ROLLBACK');throw error;}
    // Only explicitly public captures persist; private submission bytes are discarded.
    res.json(state(req.user));
  });
}

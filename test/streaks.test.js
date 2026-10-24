import {test} from 'node:test';import assert from 'node:assert/strict';import {calculateStreak,validTimeZone} from '../server/streaks.js';
test('streak counts unique completion days, retains yesterday until midnight and preserves best',()=>{
 const dates=['2026-10-20T10:00Z','2026-10-21T10:00Z','2026-10-22T10:00Z','2026-10-22T11:00Z'].map(Date.parse);
 let s=calculateStreak(dates,Date.parse('2026-10-23T12:00Z'),'UTC');assert.equal(s.current,3);assert.equal(s.best,3);assert.equal(s.completedToday,false);
 s=calculateStreak(dates,Date.parse('2026-10-24T00:00Z'),'UTC');assert.equal(s.current,0);assert.equal(s.best,3);
 s=calculateStreak([...dates,Date.parse('2026-10-24T10:00Z'),Date.parse('2026-10-25T10:00Z')],Date.parse('2026-10-24T12:00Z'),'UTC');assert.equal(s.current,1);assert.equal(s.best,3);assert.equal(s.week.filter(d=>d.completed).length,4);
});
test('streak calendar boundaries honor IST and daylight saving rather than elapsed 24-hour windows',()=>{
 const dates=['2026-10-23T18:20Z','2026-10-23T18:40Z'].map(Date.parse);assert.equal(calculateStreak(dates,Date.parse('2026-10-24T12:00Z'),'Asia/Kolkata').current,2);assert.equal(calculateStreak(dates,Date.parse('2026-10-24T12:00Z'),'UTC').current,1);
 const dst=['2026-03-07T17:00Z','2026-03-08T16:00Z','2026-03-09T16:00Z'].map(Date.parse);assert.equal(calculateStreak(dst,dst.at(-1),'America/New_York').current,3);assert.equal(validTimeZone('not/a-zone'),false);assert.equal(validTimeZone('Asia/Kolkata'),true);
});

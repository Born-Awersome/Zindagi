import {test} from 'node:test';
import assert from 'node:assert/strict';
import {journalEntries,groupJournal} from '../src/journal.js';
import {locationPresentation} from '../src/location-ui.js';
test('journal filters use calendar days, retain practice labels, sort newest first and do not mutate history',()=>{
 const now=new Date(2026,9,24,15).getTime(),day=(d,h=12)=>new Date(2026,9,d,h).getTime();
 const rows=[{at:day(18,0),category:'academics',points:1,demo:true},{at:day(17,23),category:'academics',points:1},{at:day(24),category:'cultural',points:1,mode:'recording'},{at:day(23),category:'academics',points:2}];
 const original=structuredClone(rows),filtered=journalEntries(rows,{aspect:'academics',days:'7',now});assert.deepEqual(filtered.map(h=>h.at),[day(23),day(18,0)]);assert.equal(filtered[1].demo,true);assert.deepEqual(rows,original);assert.equal(journalEntries(rows,{aspect:'fitness',now}).length,0);
 const groups=groupJournal(journalEntries(rows,{now}),now);assert.equal(groups[0].label,'Today');assert.equal(groups[1].label,'Yesterday');assert.equal(groups.reduce((sum,g)=>sum+g.entries.length,0),4);
});
test('location UI distinguishes fresh accurate GPS, imprecise GPS, expiry and paused sharing',()=>{
 const now=100000,state={enabled:true,sharing:true,phase:'active',expiresAt:now+20000,accuracy:2,sessionEndsAt:now+65000};
 let p=locationPresentation(state,now);assert.equal(p.readiness,'Your GPS is ready');assert.equal(p.updated,'10s ago');assert.equal(p.duration,'1:05 remaining');
 p=locationPresentation({...state,accuracy:50},now);assert.equal(p.readiness,'Needs better accuracy');assert.equal(p.accuracy,'±50 m');
 p=locationPresentation(state,now+21000);assert.equal(p.fresh,false);assert.equal(p.readiness,'Waiting for a fresh fix');
 p=locationPresentation({...state,phase:'paused',sharing:false},now);assert.equal(p.label,'Paused');assert.equal(p.accuracy,'Waiting for GPS');
});

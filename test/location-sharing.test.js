import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocationSharing} from '../src/location-sharing.js';
const flush=async()=>{for(let n=0;n<4;n++)await new Promise(r=>setImmediate(r));};
function setup(overrides={}){
 let time=1000000,isHidden=false,next=1;const watches=new Map(),timers=new Map(),ones=[],sent=[],events=[],removed=[];
 const geo={watchPosition(ok,fail,options){assert.equal(options.enableHighAccuracy,true);const id=next++;watches.set(id,{ok,fail});return id;},clearWatch:id=>watches.delete(id),getCurrentPosition(ok,fail,options){assert.equal(options.maximumAge,0);ones.push({ok,fail});}};
 const controller=createLocationSharing({geo,send:async body=>{sent.push(body);return {accuracyMeters:body.accuracy};},remove:async()=>{removed.push(time);},onChange:state=>events.push(state),now:()=>time,hidden:()=>isHidden,setEvery:fn=>{const id=next++;timers.set(id,fn);return id;},clearEvery:id=>timers.delete(id),...overrides});
 const fix=(timestamp=time)=>({timestamp,coords:{latitude:0,longitude:0,accuracy:2}});
 return {controller,watches,ones,sent,removed,events,fix,advance:ms=>{time+=ms;for(const f of timers.values())f();},hide:value=>{isHidden=value;controller.visibility();}};
}
test('GPS timeout and temporary unavailability keep sharing enabled and recover automatically',async()=>{
 const s=setup();s.controller.start();const watch=[...s.watches.values()][0];watch.ok(s.fix());await flush();assert.equal(s.controller.snapshot().sharing,true);
 s.ones.shift().fail({code:3});watch.fail({code:2});assert.equal(s.controller.snapshot().enabled,true);assert.equal(s.watches.size,1);assert.equal(s.removed.length,0);
 s.advance(10000);assert.equal(s.ones.length,1);s.ones.shift().ok(s.fix());await flush();assert.equal(s.controller.snapshot().phase,'active');assert.equal(s.sent.length,2);
});
test('heartbeat never overlaps one-shot GPS acquisition and expiry never disables tracking',async()=>{
 const s=setup();s.controller.start();const watch=[...s.watches.values()][0];watch.ok(s.fix());await flush();s.advance(10000);s.advance(10000);assert.equal(s.ones.length,1);
 s.advance(10001);assert.equal(s.controller.snapshot().sharing,false);assert.equal(s.controller.snapshot().enabled,true);
 s.ones.shift().fail({code:3});s.advance(5000);assert.equal(s.ones.length,1);s.ones.shift().ok(s.fix());await flush();assert.equal(s.controller.snapshot().sharing,true);
});
test('hiding pauses and removes precise presence; returning resumes opt-in, while Stop prevents resumption',async()=>{
 const s=setup();s.controller.start();const old=[...s.watches.values()][0];old.ok(s.fix());await flush();s.hide(true);await flush();assert.equal(s.watches.size,0);assert.equal(s.controller.snapshot().phase,'paused');assert.equal(s.controller.snapshot().enabled,true);assert.equal(s.controller.snapshot().sharing,false);assert.equal(s.removed.length,1);
 old.ok(s.fix());await flush();assert.equal(s.sent.length,1);s.hide(false);assert.equal(s.watches.size,1);s.advance(1000);[...s.watches.values()][0].ok(s.fix());await flush();assert.equal(s.sent.length,2);
 await s.controller.stop();s.hide(true);s.hide(false);assert.equal(s.watches.size,0);assert.equal(s.controller.snapshot().enabled,false);
});
test('Retry does not clear an existing fix or create additional watches; permission denial stops',async()=>{
 const s=setup();s.controller.start();s.ones.shift().ok(s.fix());await flush();s.controller.start();s.controller.retry();assert.equal(s.watches.size,1);assert.equal(s.ones.length,1);assert.equal(s.removed.length,0);assert.equal(s.controller.snapshot().sharing,true);
 s.ones.shift().fail({code:1});await flush();assert.equal(s.controller.snapshot().enabled,false);assert.equal(s.watches.size,0);assert.match(s.controller.snapshot().message,/permission denied/);
});
test('stale or duplicate GPS fixes are never recycled to extend proximity acceptance',async()=>{
 const s=setup();s.controller.start();const w=[...s.watches.values()][0],p=s.fix();w.ok(p);await flush();s.advance(11000);w.ok(p);w.ok(s.fix(p.timestamp-40000));await flush();assert.equal(s.sent.length,1);s.advance(20000);assert.equal(s.controller.snapshot().sharing,false);w.ok(s.fix());await flush();assert.equal(s.sent.length,2);
});
test('a failed network sync retries without deleting presence or disabling GPS',async()=>{
 let fail=true;const s=setup({send:async body=>{if(fail)throw new Error('offline');return {accuracyMeters:body.accuracy};}});s.controller.start();s.ones.shift().ok(s.fix());await flush();assert.equal(s.controller.snapshot().phase,'retrying');assert.equal(s.controller.snapshot().enabled,true);assert.equal(s.removed.length,0);
 fail=false;s.advance(10000);s.ones.shift().ok(s.fix());await flush();assert.equal(s.controller.snapshot().phase,'active');
});
test('Stop wins an in-flight upload race and old callbacks cannot reactivate GPS',async()=>{
 let finish;const operations=[];const s=setup({send:()=>new Promise(resolve=>{operations.push('put');finish=resolve;}),remove:async()=>operations.push('delete')});s.controller.start();const w=[...s.watches.values()][0];w.ok(s.fix());await flush();const stopped=s.controller.stop();finish({accuracyMeters:2});await stopped;w.ok(s.fix());await flush();assert.deepEqual(operations,['put','delete']);assert.equal(s.controller.snapshot().sharing,false);assert.equal(s.controller.snapshot().enabled,false);
});
test('temporary sharing expires while hidden and cannot restart or extend itself on return',async()=>{
 let expire,delay,cleared=false;const s=setup({setLater:(fn,ms)=>{expire=fn;delay=ms;return 42;},clearLater:id=>{if(id===42)cleared=true;}});
 s.controller.start({durationMs:15*60000});assert.equal(delay,900000);const end=s.controller.snapshot().sessionEndsAt;
 s.ones.shift().ok(s.fix());await flush();s.controller.retry();assert.equal(s.controller.snapshot().sessionEndsAt,end);
 s.hide(true);expire();await flush();assert.equal(s.controller.snapshot().enabled,false);assert.ok(cleared);s.hide(false);assert.equal(s.watches.size,0);assert.match(s.controller.snapshot().message,/session ended/);
});
test('fresh watch updates avoid redundant one-shot GPS requests',async()=>{
 const s=setup();s.controller.start();s.ones.shift().ok(s.fix());await flush();const watch=[...s.watches.values()][0];
 s.advance(6000);watch.ok(s.fix());await flush();s.advance(5000);assert.equal(s.ones.length,0);
 s.advance(5000);assert.equal(s.ones.length,1);
});

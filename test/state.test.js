import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, completeSession, pauseSession } from '../src/state.js';
const active = () => ({...initialState(),session:{category:'academics',points:1,title:'Study',startedAt:1000,endsAt:3601000,pausedAt:null}});
test('study earns exactly one academic point only after the full hour',()=>{const s=active();assert.equal(completeSession(s,3001000),false);assert.equal(s.points.academics,0);assert.equal(completeSession(s,3601000),true);assert.equal(s.points.academics,1);assert.equal(s.points.fitness,0);assert.equal(s.history.length,1);assert.equal(completeSession(s,3602000),false);assert.equal(s.points.academics,1);});
test('pause does not award points and resume extends both timestamps',()=>{const s=active();pauseSession(s.session,2000);assert.equal(completeSession(s,4000000),false);pauseSession(s.session,12000);assert.equal(s.session.endsAt,3611000);assert.equal(s.session.startedAt,11000);assert.equal(completeSession(s,3601000),false);assert.equal(completeSession(s,3611000),true);});
test('restored session can complete after reload without duplication',()=>{const s=JSON.parse(JSON.stringify(active()));assert.equal(completeSession(s,4000000),true);const restored=JSON.parse(JSON.stringify(s));assert.equal(completeSession(restored,5000000),false);assert.equal(restored.history.length,1);});

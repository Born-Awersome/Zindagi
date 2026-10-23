import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progress, achievements } from '../src/game.js';
const blank=()=>({academics:0,career:0,social:0,fitness:0,creativity:0});
test('level progress rolls over every five earned points',()=>{assert.deepEqual(progress(blank()),{total:0,level:1,earned:0,next:5});assert.deepEqual(progress({...blank(),academics:4}),{total:4,level:1,earned:4,next:1});assert.deepEqual(progress({...blank(),academics:4,career:1}),{total:5,level:2,earned:0,next:5});});
test('achievements unlock only when their actual requirements are met',()=>{assert.ok(achievements(blank()).every(b=>!b.unlocked));const first=achievements({...blank(),academics:1});assert.equal(first.find(b=>b.id==='first').unlocked,true);assert.equal(first.find(b=>b.id==='focus').unlocked,false);assert.equal(achievements({...blank(),fitness:10}).find(b=>b.id==='balance').unlocked,false);assert.equal(achievements({academics:5,career:1,social:1,fitness:1,creativity:2}).every(b=>b.unlocked),true);});

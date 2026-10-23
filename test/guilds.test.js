import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guildRanks, sampleGuilds, toggleMembership, distanceKm } from '../src/guild-model.js';
import { initialState, completeSession } from '../src/state.js';

test('memberships toggle without duplicates and survive serialization',()=>{
  const state=initialState();
  toggleMembership(state,'focus-club');
  assert.deepEqual(JSON.parse(JSON.stringify(state)).guildIds,['focus-club']);
  toggleMembership(state,'focus-club');
  assert.deepEqual(state.guildIds,[]);
});
test('guild rankings include only members, include new task points, and filter by aspect',()=>{
  const state=initialState(), guild=sampleGuilds[0];
  assert.equal(guildRanks(guild,state).some(p=>p.you),false);
  toggleMembership(state,guild.id);
  state.session={category:'academics',points:1,title:'Study',endsAt:1};
  completeSession(state,2);
  const ranks=guildRanks(guild,state);
  assert.equal(ranks.length,3);
  assert.equal(ranks.some(p=>p.initials==='KR'),false);
  assert.equal(ranks.find(p=>p.you).score,1);
  assert.equal(guildRanks(guild,state,'academics').find(p=>p.you).score,1);
  assert.equal(guildRanks(guild,state,'fitness').find(p=>p.you).score,0);
  state.points.academics=30;
  assert.equal(guildRanks(guild,state)[0].you,true);
  toggleMembership(state,guild.id);
  assert.equal(guildRanks(guild,state).some(p=>p.you),false);
});
test('sample category scores add up to sample overall scores',()=>{
  const state=initialState();
  for(const guild of sampleGuilds) for(const member of guildRanks(guild,state)) {
    const total=Object.keys(state.points).reduce((sum,aspect)=>sum+guildRanks(guild,state,aspect).find(p=>p.initials===member.initials).score,0);
    assert.equal(total,member.score);
  }
});
test('distance calculation handles identical points and the date line',()=>{
  assert.equal(distanceKm({latitude:0,longitude:0},{latitude:0,longitude:0}),0);
  assert.ok(Math.abs(distanceKm({latitude:0,longitude:0},{latitude:0,longitude:1})-111.195)<.01);
  assert.ok(distanceKm({latitude:0,longitude:179.9},{latitude:0,longitude:-179.9})<23);
});

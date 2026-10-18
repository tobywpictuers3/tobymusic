import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Compile only the pure music-rules module (no UI, browser, or test-runner dependency).
const source = readFileSync(new URL('../src/lib/musicPlay.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, reportDiagnostics: true });
assert.equal(output.diagnostics?.length || 0, 0);
const exports = {};
vm.runInNewContext(output.outputText, { exports });
const { normalizeMusicSettings, canAccessMusicLevel, generateMusicExercise, scoreMusicEvent, NATURAL_MIDI } = exports;

test('assigned tier opens only lower tiers', () => {
  const s = normalizeMusicSettings({ maxUnlockedLevel: 4 });
  for(const level of [1,2,3,4]) assert.equal(canAccessMusicLevel(s,level),true);
  for(const level of [0,5,6,7]) assert.equal(canAccessMusicLevel(s,level),false);
  assert.throws(() => generateMusicExercise(5,s), /LEVEL_LOCKED/);
});
test('natural notes, steps, and four complete bars', () => {
  const s = normalizeMusicSettings({ trebleFrom:60,trebleTo:67 });
  const events=generateMusicExercise(1,s,4,()=>0.31);
  assert.equal(events.length,16);
  assert.equal(events.reduce((sum,e)=>sum+e.durationBeats,0),16);
  let previous;
  for(const ev of events) {
    const n=ev.notes[0];
    assert.equal(ev.durationBeats,1);
    assert.equal(n.clef,'treble');
    assert.ok(n.midi>=60 && n.midi<=67 && NATURAL_MIDI.includes(n.midi));
    if(previous!==undefined) assert.equal(Math.abs(NATURAL_MIDI.indexOf(n.midi)-NATURAL_MIDI.indexOf(previous)),1);
    previous=n.midi;
  }
});
test('grand staff, chords, permitted ranges, and exact beat sums', () => {
  const s=normalizeMusicSettings({ maxUnlockedLevel:6, trebleFrom:60,trebleTo:72,bassFrom:43,bassTo:55, maxChordNotes:4, rhythmValues:[0.5,1,2,4] });
  assert.ok(s.rhythmValues.includes(1));
  for(const level of [4,5,6]) {
    const events=generateMusicExercise(level,s,3,()=>0.3);
    assert.equal(events.reduce((sum,e)=>sum+e.durationBeats,0),12);
    for(let i=1;i<events.length;i++) assert.equal(events[i].startBeat,events[i-1].startBeat+events[i-1].durationBeats);
    for(const ev of events) {
      const ts=ev.notes.filter(n=>n.clef==='treble').map(n=>n.midi);
      const bs=ev.notes.filter(n=>n.clef==='bass').map(n=>n.midi);
      assert.equal(new Set(ts).size,ts.length);
      assert.equal(new Set(bs).size,bs.length);
      assert.ok(ts.every(n=>n>=60&&n<=72&&NATURAL_MIDI.includes(n)));
      assert.ok(bs.every(n=>n>=43&&n<=55&&NATURAL_MIDI.includes(n)));
      if(level===4) assert.equal(ts.length,0);
      if(level===5) assert.equal(ts.length,1);
      if(level===6) assert.ok(ts.length>=2 && bs.length>=2);
    }
  }
});
test('onset is scored separately from pitch correctness', () => {
  const ev={id:'test',startBeat:2,durationBeats:1,notes:[{midi:60,clef:'treble'},{midi:64,clef:'treble'}]};
  const right=scoreMusicEvent(ev,[{midi:60,beat:2.1},{midi:64,beat:2.2}]);
  assert.equal(right.correct,true);assert.equal(right.timely,true);
  assert.equal(scoreMusicEvent(ev,[{midi:60,beat:2.1}]).correct,false);
  const late=scoreMusicEvent(ev,[{midi:60,beat:2.6},{midi:64,beat:2.6}]);
  assert.equal(late.correct,true);assert.equal(late.timely,false);
});

test('rhythm taps are judged at event onset independently of pitches', () => {
  const ev={id:'r',startBeat:3,durationBeats:0.5,notes:[{midi:60,clef:'treble'}]};
  assert.equal(exports.scoreRhythmEvent(ev,[3.1]).timely,true);
  assert.equal(exports.scoreRhythmEvent(ev,[3.38]).timely,false);
  assert.equal(exports.scoreRhythmEvent(ev,[3.1,3.2]).correct,false);
});

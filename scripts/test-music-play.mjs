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

test('ear memory respects locked levels, treble and bass ranges', () => {
  const earExports = {};
  const earSource = readFileSync(new URL('../src/lib/musicEarGame.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(earSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, reportDiagnostics: true });
  assert.equal(compiled.diagnostics?.length || 0, 0);
  vm.runInNewContext(compiled.outputText, { exports: earExports, require: () => exports });
  const { generateEarRound, scoreEarRound } = earExports;
  const s = normalizeMusicSettings({ maxUnlockedLevel: 6, trebleFrom: 60, trebleTo: 64, bassFrom: 45, bassTo: 48, motion: 'steps' });
  assert.throws(() => generateEarRound(7, s), /LEVEL_LOCKED/);
  for (const level of [1,2,3,4,5,6]) {
    for (const random of [() => 0, () => 0.999]) {
      const r = generateEarRound(level, s, random);
      assert.equal(new Set(r.choices).size, r.choices.length);
      assert.ok(r.choices.length >= 2 && r.choices.length <= 4);
      assert.ok(r.melody.every(m => r.choices.includes(m)));
      assert.ok(r.melody.every(m => r.clef === 'bass' ? m >= 45 && m <= 48 : m >= 60 && m <= 64));
      assert.equal(r.clef, level === 4 ? 'bass' : r.clef);
      const exact = scoreEarRound(r.melody, r.melody);
      assert.equal(exact.perfect, true);
      assert.equal(exact.correct, exact.total);
      assert.equal(scoreEarRound(r.melody, []).perfect, false);
    }
  }
  assert.throws(() => generateEarRound(1, normalizeMusicSettings({ trebleFrom: 60, trebleTo: 60 })), /INSUFFICIENT_NOTES/);
});

test('professional Hebrew octave names anchor A4 at 440 Hz', () => {
  assert.equal(exports.noteName(69), 'לה ראשון');
  assert.equal(exports.noteName(60), 'דו ראשון');
  assert.equal(exports.noteName(72), 'דו שני');
  assert.equal(exports.noteName(48), 'דו קטן');
  assert.equal(exports.noteName(36), 'דו גדול');
});

test('recall is exactly two beats per note, regardless of teacher rhythm settings', () => {
  const s = normalizeMusicSettings({ maxUnlockedLevel: 6, rhythmValues: [0.5,1], trebleFrom:60,trebleTo:67 });
  for (const level of [1,2,3,4,5,6]) {
    const events = generateMusicExercise(level, s, 4, () => 0.37, 'reading');
    assert.equal(events.length,8);
    assert.equal(events.reduce((sum, e) => sum + e.durationBeats,0),16);
    assert.ok(events.every(e=>e.durationBeats===2));
    const example=events[0];
    const arbitraryLate = example.notes.map(n=>({midi:n.midi,beat:example.startBeat+1.85}));
    assert.equal(exports.scoreRecallMusicEvent(example,arbitraryLate).correct,true);
    assert.equal(exports.scoreTimedMusicEvent(example,arbitraryLate,0.1).correct,false);
  }
});

test('strict playing rejects wrong pitch, extra notes and timing outside calibrated sigma', () => {
  const ev={id:'strict',startBeat:4,durationBeats:1,notes:[{midi:69,clef:'treble'}]};
  assert.equal(exports.scoreTimedMusicEvent(ev,[{midi:69,beat:4.16}],0.08,0.1).correct,true);
  assert.equal(exports.scoreTimedMusicEvent(ev,[{midi:69,beat:4.21}],0.08,0.1).correct,false);
  assert.equal(exports.scoreTimedMusicEvent(ev,[{midi:69,beat:4.1},{midi:69,beat:4.1}],0.08,0.1).correct,false);
  assert.equal(exports.scoreTimedMusicEvent(ev,[{midi:70,beat:4.1}],0.08,0.1).correct,false);
});

test('reaction calibration uses measured sample SD and rejects unstable calibration', () => {
  const c=exports.computeTimingCalibration([0.09,0.11,0.10,0.08,0.12,0.09,0.11,0.10],1);
  assert.ok(c);
  assert.equal(c.sampleCount,8);
  assert.ok(c.offsetBeats>0.09 && c.offsetBeats<0.11);
  assert.equal(c.toleranceBeats,0.05);
  assert.equal(exports.computeTimingCalibration([0.1,0.12],1),null);
  assert.equal(exports.computeTimingCalibration([0,0.4,0,0.4,0.4,0,0,0.4],1),null);
});

test('notation performance guard: progress uses SVG ref, not per-frame React state', () => {
  const component = readFileSync(new URL('../src/components/student/MusicPlay.tsx', import.meta.url), 'utf8');
  assert.match(component, /progressRect\\.current\\?\\.setAttribute\\('width'/);
  assert.doesNotMatch(component, /setPhase\\(/);
  assert.doesNotMatch(component, /setCursor\\(index\\);[\\s\\S]{0,160}setPhase/);
  assert.match(component, /if \\(visibleCursor\\.current !== index\\)/);
  assert.match(component, /beforeunload/);
});

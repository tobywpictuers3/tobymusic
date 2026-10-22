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
  assert.ok(component.includes("progressRect.current?.setAttribute('width'"));
  assert.ok(component.includes('if (visibleCursor.current !== index)'));
  assert.ok(!component.includes('setPhase('));
  assert.ok(component.includes('beforeunload'));
});

test('personal recall levels keep historical profiles and enforce teacher bounds', () => {
  const recallExports = {};
  const src=readFileSync(new URL('../src/lib/musicRecall.ts', import.meta.url),'utf8');
  const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
  assert.equal(out.diagnostics?.length||0,0);
  vm.runInNewContext(out.outputText,{exports:recallExports});
  const p=recallExports.normalizeRecallProfile({trebleNotes:[60,65,67],bassNotes:[43,47],clefs:'treble',placement:'treble',intervals:[1],voices:1,minEvents:3});
  assert.equal(recallExports.validateRecallProfile(p).length,0);
  const events=recallExports.generateRecallExercise(p,6,()=>0.1);
  assert.equal(events.length,6);
  assert.ok(events.every(e=>e.durationBeats===2&&e.notes.every(n=>[60,65,67].includes(n.midi))));
  assert.ok(events.every(e=>e.notes.length===1));
  assert.equal(recallExports.scoreRecallAnswers(events[0],events[0].notes.map(n=>n.midi)),true);
  assert.equal(recallExports.scoreRecallAnswers(events[0],[74]),false);
  const impossible=recallExports.normalizeRecallProfile({...p,trebleNotes:[60,67],intervals:[1]});
  assert.ok(recallExports.validateRecallProfile(impossible).length>0);
  assert.throws(()=>recallExports.generateRecallExercise(impossible,3),/RECALL_INVALID_PROFILE/);
  const grades=recallExports.getRecallLevels({recallLevels:[{...p,id:'level-one'},{...p,id:'level-two',voices:2,intervals:[]}]});
  assert.equal(grades.length,2);
  assert.equal(grades[0].id,'level-one');
  assert.equal(grades[1].id,'level-two');
});
test('recall placement and simultaneous notes obey chosen staves', () => {
  const recallExports={};
  const src=readFileSync(new URL('../src/lib/musicRecall.ts',import.meta.url),'utf8');
  const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
  vm.runInNewContext(out.outputText,{exports:recallExports});
  const p={trebleNotes:[60,62,64],bassNotes:[43,45,47],clefs:'both',placement:'split',voices:2,intervals:[],minEvents:4};
  const events=recallExports.generateRecallExercise(p,6,()=>0.7);
  assert.equal(events.length,6);
  for(const ev of events){
    assert.equal(ev.notes.length,2);
    assert.equal(ev.notes.filter(n=>n.clef==='treble').length,1);
    assert.equal(ev.notes.filter(n=>n.clef==='bass').length,1);
  }
  assert.equal(recallExports.validateRecallProfile({...p,voices:1}).length>0,true);
});
test('recall student choices cap added notes and BPM without granting pitch access',()=>{
  const exports={};
  const src=readFileSync(new URL('../src/lib/musicRecall.ts',import.meta.url),'utf8');
  const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
  vm.runInNewContext(out.outputText,{exports});
  const p=exports.normalizeRecallPreferences({extraEvents:100,bpm:999,clock:'elapsed',answer:'name'});
  assert.equal(p.extraEvents,48);assert.equal(p.bpm,180);assert.equal(p.clock,'elapsed');assert.equal(p.answer,'name');
  const profile=exports.normalizeRecallProfile({clefs:'bass',placement:'bass',bassNotes:[43,45],intervals:[1],voices:1,minEvents:2});
  assert.ok(exports.generateRecallExercise(profile,50,()=>0.2).every(ev=>ev.notes.every(n=>n.clef==='bass'&&[43,45].includes(n.midi))));
});

test('recall accepts slightly early onsets without stealing a note still needed by the previous event',()=>{
  const recallExports={};
  const src=readFileSync(new URL('../src/lib/musicRecall.ts',import.meta.url),'utf8');
  const result=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
  vm.runInNewContext(result.outputText,{exports:recallExports});
  const {assignRecallInput,RECALL_EARLY_WINDOW_BEATS}=recallExports;
  assert.equal(RECALL_EARLY_WINDOW_BEATS,0.25);
  const notes=[
    {id:'0',startBeat:0,durationBeats:2,notes:[{midi:60,clef:'treble'}]},
    {id:'1',startBeat:2,durationBeats:2,notes:[{midi:67,clef:'treble'}]},
  ];
  assert.equal(assignRecallInput(notes,0,-0.2,60,[]),0);
  assert.equal(assignRecallInput(notes,0,-0.3,60,[]),null);
  assert.equal(assignRecallInput(notes,0,1.82,67,[]),1);
  assert.equal(assignRecallInput(notes,0,1.82,60,[]),0);
  assert.equal(assignRecallInput(notes,0,1.82,67,[60]),1);
  assert.equal(assignRecallInput(notes,0,1.74,67,[]),0);
  assert.equal(assignRecallInput(notes,0,2.02,67,[]),1);
  assert.equal(assignRecallInput(notes,1,3.9,67,[]),1);
  assert.equal(assignRecallInput(notes,1,4.01,67,[]),null);
  assert.equal(assignRecallInput(notes,0,NaN,60,[]),null);
});
test('notation repaints staff lines above hollow noteheads for unobscured G on a line',()=>{
  const source=readFileSync(new URL('../src/components/student/MusicRecall.tsx',import.meta.url),'utf8');
  const front=source.indexOf("clef+'-foreground-'+k");
  assert.ok(front>source.indexOf('<ellipse cx={noteX}'), 'foreground stave is painted after noteheads');
  assert.ok(source.includes('strokeWidth={1.5} pointerEvents="none"'), 'foreground stave does not catch input');
});

test('recall keyboard shortcuts match real English and Hebrew physical keys and no shortcut for over 9 notes',()=> {
  const recallExports={};
  const src=readFileSync(new URL('../src/lib/musicRecall.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
  assert.equal(compiled.diagnostics?.length||0,0);
  vm.runInNewContext(compiled.outputText,{exports:recallExports});
  const {resolveRecallComputerPitch:resolve,RECALL_ENGLISH_KEYS:english,RECALL_HEBREW_KEYS:hebrew}=recallExports;
  assert.deepEqual([...english],['A','S','D','F','G','H','J','K','L']);
  assert.deepEqual([...hebrew],['ש','ד','ג','כ','ע','י','ח','ל','ך']);
  const pitches=[60,62,64,65,67,69,71,72,74];
  pitches.forEach((pitch,i)=>{
    assert.equal(resolve({code:'Key'+english[i],key:english[i].toLowerCase()},pitches,'play'),pitch);
    assert.equal(resolve({code:'Key'+english[i],key:hebrew[i]},pitches,'play'),pitch);
    assert.equal(resolve({key:hebrew[i]},pitches,'play'),pitch);
    assert.equal(resolve({code:'Digit'+(i+1),key:String(i+1)},pitches,'name'),pitch);
    assert.equal(resolve({code:'Numpad'+(i+1),key:String(i+1)},pitches,'name'),pitch);
  });
  assert.equal(resolve({code:'KeyA',key:'ש'},pitches,'name'),null);
  assert.equal(resolve({code:'Digit1',key:'1'},pitches,'play'),null);
  assert.equal(resolve({key:'A'},[60,62,64],'play'),60);
  assert.equal(resolve({key:'ש'},[60,62,64],'play'),60);
  assert.equal(resolve({code:'KeyA',key:'ש'},[60,62,64,65,67,69,71,72,74,76],'play'),null);
  assert.equal(resolve({code:'Digit1',key:'1'},[60,62,64,65,67,69,71,72,74,76],'name'),null);
  assert.equal(resolve({key:'ש'},[],'play'),null);
});

test('voice name mode and played-pitch mode have separate onscreen interfaces',()=>{
  const comp=readFileSync(new URL('../src/components/student/MusicRecall.tsx',import.meta.url),'utf8');
  assert.ok(comp.includes('שליפה בהקראה — לומר / לבחור שם תו'));
  assert.ok(comp.includes('שליפה בנגינה — לזהות גובה הצליל'));
  assert.ok(comp.includes("prefs.answer==='name'&&<aside"),'name-only compact stave-side touch controls');
  assert.ok(comp.includes('לחצני שמות הצלילים'));
  assert.ok(comp.includes('RecallScreenPiano allowed={options}'));
  assert.ok(comp.includes('RecallScreenFlute allowed={options}'));
  assert.ok(comp.includes('מקלדת MIDI'));
  assert.ok(comp.includes('זיהוי גובה צליל מהמיקרופון'));
  assert.ok(comp.includes('זיהוי שמות תווים במיקרופון'));
  assert.ok(comp.includes("!running&&canUseComputerKeyboard"),'physical keyboard hints hidden while active');
  assert.ok(comp.includes('resolveRecallComputerPitch(e,options,prefs.answer)'));
  assert.ok(comp.includes('pitch!==input.lastFiredPitch'), 'held pitch should not spam multiple notes');
  assert.ok(comp.includes('speechRetry.current=setTimeout'), 'speech restarts after browser recognition endpoint closes');
  assert.ok(!comp.includes('canShowPiano'), 'legacy static organ illustration not restored');
});

test('virtual concert flute recognizes natural pitches only from valid fingering and chosen register',()=>{
  const fluteExports={};
  const source=readFileSync(new URL('../src/lib/recallFlute.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
  assert.equal(compiled.diagnostics?.length||0,0);
  vm.runInNewContext(compiled.outputText,{exports:fluteExports});
  const {recognizeRecallFluteFingering:resolve,SUPPORTED_FLUTE_NOTES:notes}=fluteExports;
  assert.equal(notes.length,15,'natural pitches C4 through C6');
  const fingerings=[
    [60,4,['T','L1','L2','L3','R1','R2','R3','C']],
    [62,4,['T','L1','L2','L3','R1','R2','R3']],
    [64,4,['T','L1','L2','L3','R1','R2','Eb']],
    [65,4,['T','L1','L2','L3','R1','Eb']],
    [67,4,['T','L1','L2','L3','Eb']],
    [69,4,['T','L1','L2','Eb']],
    [71,4,['T','L1','Eb']],
    [72,5,['L1','Eb']],
    [74,5,['T','L2','L3','R1','R2','R3']],
    [76,5,['T','L1','L2','L3','R1','R2','Eb']],
    [77,5,['T','L1','L2','L3','R1','Eb']],
    [79,5,['T','L1','L2','L3','Eb']],
    [81,5,['T','L1','L2','Eb']],
    [83,5,['T','L1','Eb']],
    [84,6,['L1','Eb']],
  ];
  const allowed=fingerings.map(x=>x[0]);
  for(const [midi,register,fingers] of fingerings) {
    assert.equal(resolve(fingers,register,allowed),midi);
    assert.equal(resolve([...fingers,'unknown'],register,allowed),null);
    assert.equal(resolve(fingers,register,[]),null);
  }
  assert.equal(resolve(['L1','Eb'],4,allowed),null);
  assert.equal(resolve(['L1','Eb'],5,[84]),null,'cannot play C6 with fifth-octave selection');
  assert.equal(resolve(['L1','Eb'],6,allowed),84);
  assert.equal(resolve(['T'],4,allowed),null);
});

test('on-screen piano and flute controls deliver only permitted touch pitches',()=>{
  const comp=readFileSync(new URL('../src/components/student/MusicRecallInstruments.tsx',import.meta.url),'utf8');
  assert.ok(comp.includes('function RecallScreenPiano')||comp.includes('export function RecallScreenPiano'));
  assert.ok(comp.includes('export function RecallScreenFlute'));
  assert.ok(comp.includes('disabled={!active||!allowed.includes(midi)}'));
  assert.ok(comp.includes('recognizeRecallFluteFingering(pressed,register,supported)'));
  assert.ok(comp.includes('onAnswer(note)'));
  assert.ok(comp.includes('aria-pressed={pressed.includes(finger)}'),'flute finger keys respond to touch');
  assert.ok(comp.includes('אפשר לגלול לרוחב'));
  assert.ok(comp.includes('אין צלילים בתחום החליל הווירטואלי'));
});

test('Hebrew speech parser recognizes clear note words, octave names and prevents false or ambiguous answers',()=>{
  const module={exports:{}};
  const src=readFileSync(new URL('../src/lib/recallSpeech.ts',import.meta.url),'utf8');
  const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
  assert.equal(out.diagnostics?.length||0,0);
  vm.runInNewContext(out.outputText,{exports:module.exports});
  const {parseHebrewRecallNotes:parse,normalizedSpokenNoteTokens:tokens}=module.exports;
  assert.deepEqual([...tokens('  דּוֹ, רֵה!  ')],['דו','רה']);
  assert.deepEqual([...parse('דו', [60,62,64])],[60]);
  assert.deepEqual([...parse('דו ראשון רה ראשון מי ראשון',[60,62,64])],[60,62,64]);
  assert.deepEqual([...parse('אמרתי סול ואחר כך לה', [67,69])],[67,69]);
  assert.deepEqual([...parse('דו ראשון', [60,72])],[60]);
  assert.deepEqual([...parse('דו שני', [60,72])],[72]);
  assert.deepEqual([...parse('דו', [60,72], [72])],[72],'bare note name is sufficient, current exercise chooses octave');
  assert.deepEqual([...parse('דו שלישי',[60])],[], 'wrong explicitly stated octave must still be rejected');
  assert.deepEqual([...parse('שלום ילדים',[60,67])],[],'do not match note names inside Hebrew words');
  assert.deepEqual([...parse('לה רה',[60,62])],[62], 'ignore notes not assigned');
});

test('speech microphone can be armed before training and is maintained when exercise begins',()=>{
  const source=readFileSync(new URL('../src/components/student/MusicRecall.tsx',import.meta.url),'utf8');
  assert.ok(source.includes("if(prefs.answer!=='name')return;"), 'speech start must not require running');
  assert.ok(!source.includes("if(prefs.answer!=='name'||!running)return"), 'old running guard removed');
  assert.ok(source.includes("const spoken=Boolean(prefs.answer==='name'&&speech.current)"), 'preserve prearmed speech through exercise start');
  assert.ok(source.includes("const effectiveClock=spoken?'elapsed':prefs.clock"), 'spoken notes must not be penalized for transcript delay');
  assert.ok(source.includes('בדיקת מיקרופון להקראת שמות תווים'));
  assert.ok(source.includes('תמלול אחרון:'));
  assert.ok(source.includes('instance.interimResults=true'),'expose partial transcripts before final result');
  assert.ok(source.includes('instance.onspeechstart=()=>'),'distinguish audio arrival from a transcription');
  assert.ok(source.includes("code==='no-speech'"));
  assert.ok(source.includes("'network'"),'network block needs a visible explanation');
  assert.ok(source.includes('parseHebrewRecallNotes(heard,options)'));
  assert.ok(source.includes('if(current&&!current.finished&&current.pref.answer'), 'preflight never grades without active exercise');
  assert.ok(source.includes('speechRetry.current=setTimeout'),'transcript service restarts while prearmed');
});

test('compact spoken recall keeps pitch-height buttons immediately beside the notation',()=>{
  const source=readFileSync(new URL('../src/components/student/MusicRecall.tsx',import.meta.url),'utf8');
  assert.ok(source.includes("grid-cols-[minmax(0,1fr)_106px]"), 'stave and name buttons side by side on small screens');
  assert.ok(source.includes('sticky top-2'), 'keep name buttons alongside notation when scrolling');
  assert.ok(source.includes('max-h-[350px] overflow-y-auto'), 'long name ranges can scroll');
  assert.ok(source.includes('[...options].reverse().map(midi'), 'higher notes appear at the top');
  assert.ok(source.includes('options.indexOf(midi)+1'), 'keyboard shortcut digits preserve lowest-first convention');
  assert.ok(source.includes('תו גבוה ↑'));
  assert.ok(source.includes('תו נמוך ↓'));
  assert.ok(source.includes('max-h-[350px]'),'short note column instead of full-width stacked buttons');
  assert.ok(!source.includes('max-h-[460px]'), 'old oversize column removed');
  assert.ok(source.includes('⚙️ הגדרות אימון'), 'secondary controls can be collapsed to keep notation visible');
});

test('single spoken note works across octaves and common Hebrew ASR variants, without accidental repeats',()=>{
  const x={exports:{}};
  const text=readFileSync(new URL('../src/lib/recallSpeech.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
  vm.runInNewContext(compiled.outputText,{exports:x.exports});
  const {parseHebrewRecallNotes:parse,fastInterimRecallNote:fast}=x.exports;
  assert.deepEqual([...parse('דו',[60,72],[72])],[72]);
  assert.deepEqual([...parse('דו',[60,72],[60,72],[60])],[72],'second utterance can target next octave');
  assert.deepEqual([...parse('דו',[60,72],[])],[60], 'no octave required even without an exercise context');
  assert.deepEqual([...parse('ראה',[62],[62])],[62], 'one-word ASR alternative for רה');
  assert.deepEqual([...parse('לא',[69],[69])],[69], 'isolated ASR alternative for לה');
  assert.deepEqual([...parse('לא נכון',[69],[69])],[], 'negative statement must not be interpreted as a note');
  assert.equal(fast('דו'),true);
  assert.equal(fast('דו ראשון'),false);
  assert.equal(fast('דוד'),false);
  assert.equal(fast('אני אומרת דו'),false);
});

test('spoken note recognition records fast isolated interim once, advances on recognized answer and exposes feedback',()=>{
  const source=readFileSync(new URL('../src/components/student/MusicRecall.tsx',import.meta.url),'utf8');
  assert.ok(source.includes('speechProcessed.current.has(i)'), 'dedupe interim/final for one result index');
  assert.ok(source.includes('speechProcessed.current.add(i)'));
  assert.ok(source.includes('fastInterimRecallNote(heard)'), 'accept clearly decoded isolated note before ASR final');
  assert.ok(source.includes("notes.filter(n=>addAnswer(n,'microphone')).length"), 'route transcript through the scoring input');
  assert.ok(source.includes("const effectiveClock=spoken?'elapsed':prefs.clock"), 'avoid 2-beat ASR latency rejection');
  assert.ok(source.includes("engine.current.pref.clock='elapsed'"), 'enabling the mic mid-exercise must also disable time rejection');
  assert.ok(source.includes('✓ נקלטה תשובה:'), 'positive feedback only after actual answer acceptance');
});

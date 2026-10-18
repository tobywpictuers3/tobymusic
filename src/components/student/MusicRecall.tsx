import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Student } from '@/lib/types';
import { getStudents, updateStudent } from '@/lib/storage';
import { noteName, type MusicPlayAttempt } from '@/lib/musicPlay';
import { detectRecallPitch } from '@/lib/recallMicrophone';
import {
  getRecallLevels, getInitialRecallProfile, normalizeRecallPreferences, generateRecallExercise,
  scoreRecallAnswers, type RecallEvent, type RecallPreferences, type RecallProfile,
} from '@/lib/musicRecall';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, Play, RotateCcw, Volume2 } from 'lucide-react';

type PlayedInput = 'touch' | 'keyboard' | 'midi' | 'microphone';
type Running = {
  audio:AudioContext; events:RecallEvent[]; start:number; started:number; index:number;
  hits:Map<number,number[]>; correct:number; responded:number; finished:boolean;
  pref:RecallPreferences; input:PlayedInput; level:number; profileId:string;
};
const NATURAL_STEPS:Record<number,number>={0:0,2:1,4:2,5:3,7:4,9:5,11:6};
function staffPosition(midi:number,clef:'treble'|'bass') {
  const base=clef==='treble'?64:43;
  const bottom=clef==='treble'?122:244;
  const step=(n:number)=>Math.floor(n/12)*7+NATURAL_STEPS[n%12];
  return bottom-(step(midi)-step(base))*6;
}
function RecallNotation({events,index,profile}:{events:RecallEvent[];index:number;profile:RecallProfile}) {
  const from=Math.max(0,index-1);
  const visible=events.slice(from,from+6);
  const clefs=profile.clefs==='both'?['treble','bass'] as const: [profile.clefs] as Array<'treble'|'bass'>;
  const height=profile.clefs==='both'?300:profile.clefs==='bass'?300:190;
  const linesBottom=(clef:'treble'|'bass')=>clef==='treble'?122:244;
  return <div dir="ltr" className="rounded-xl border bg-white overflow-x-auto p-2">
    <svg role="img" aria-label="חמשה עם ראשי תווים חלולים ללא רגל, התו הנוכחי מסומן במשולש מתחתיו" viewBox={'0 0 800 '+height} className="w-full min-w-[550px] text-slate-900">
      <rect width={800} height={height} fill="#fffefa"/>
      {visible.map((ev,j)=>from+j===index?<rect key={'bg'+ev.id} x={118+j*104-39} y={24} width={80} height={height-37} fill="#fffbeb" rx={10}/>:null)}
      {clefs.map(clef=><g key={clef}>
        {Array.from({length:5},(_,k)=><line key={k} x1={52} x2={787} y1={linesBottom(clef)-k*12} y2={linesBottom(clef)-k*12} stroke="#334155" strokeWidth={1.5}/>)}
        <text x={6} y={linesBottom(clef)-8} fontSize={clef==='treble'?56:44} fill="#172554">{clef==='treble'?'𝄞':'𝄢'}</text>
      </g>)}
      {visible.map((ev,j)=>{
        const x=118+j*104,selected=from+j===index;
        return <g key={ev.id} opacity={from+j<index?0.35:1}>
          {ev.notes.map((note,k)=>{
            const bottom=linesBottom(note.clef),y=staffPosition(note.midi,note.clef);
            const same=ev.notes.filter(n=>n.clef===note.clef);
            const noteX=x+(same.findIndex(n=>n===note)%2)*13;
            return <g key={note.clef+'-'+k}>
              {y>bottom+10&&Array.from({length:Math.ceil((y-bottom)/12)},(_,i)=><line key={'down'+i} x1={noteX-15} x2={noteX+15} y1={bottom+(i+1)*12} y2={bottom+(i+1)*12} stroke="#0f172a" strokeWidth={1.5}/>)}
              {y<bottom-58&&Array.from({length:Math.ceil((bottom-48-y)/12)},(_,i)=><line key={'up'+i} x1={noteX-15} x2={noteX+15} y1={bottom-60-i*12} y2={bottom-60-i*12} stroke="#0f172a" strokeWidth={1.5}/>)}
              <ellipse cx={noteX} cy={y} rx={11} ry={6} fill="white" stroke={selected?'#92400e':'#0f172a'} strokeWidth={2.4} transform={'rotate(-17 '+noteX+' '+y+')'}/>
            </g>;
          })}
          {selected&&<path d={'M '+(x-8)+' '+(height-10)+' l 8 -10 l 8 10 Z'} fill="#b45309"/>}
        </g>;
      })}
    </svg>
  </div>;
}
const drawTone=(ctx:AudioContext,at:number,accent:boolean)=>{
  const osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.frequency.value=accent?1050:780;
  osc.type='triangle';osc.connect(gain).connect(ctx.destination);
  gain.gain.setValueAtTime(.06,at);
  gain.gain.exponentialRampToValueAtTime(.0001,at+.05);
  osc.start(at);osc.stop(at+.06);
};
const cleanSpeech=(value:string)=>value.replace(/[\u0591-\u05c7]/g,'').replace(/[^א-ת0-9]/g,'').replace(/ה(ראשון|שני|שלישי|גדול|קטן)/g,'$1');
function spokenNotes(text:string,options:number[]) {
  let source=cleanSpeech(text);
  const labels=options.map(midi=>({midi,full:cleanSpeech(noteName(midi)),simple:cleanSpeech(noteName(midi).split(' ')[0])}));
  const results:number[]=[];
  while(source.length){
    const first=labels.filter(x=>source.startsWith(x.full)).sort((a,b)=>b.full.length-a.full.length)[0];
    if(first){results.push(first.midi);source=source.slice(first.full.length);continue;}
    const short=labels.filter(x=>source.startsWith(x.simple));
    const distinct=[...new Set(short.map(n=>n.midi))];
    if(distinct.length===1){results.push(distinct[0]);source=source.slice(short[0].simple.length);continue;}
    // Move one codepoint when speech contains additional words.
    source=source.slice(1);
  }
  return results;
}
type BrowserSpeech = {
  lang:string;continuous:boolean;interimResults:boolean;
  onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>;resultIndex:number})=>void)|null;
  onerror:((event:{error:string})=>void)|null;
  onend:(()=>void)|null;start:()=>void;stop:()=>void;
};
const speechConstructor=()=> {
  const browser=window as unknown as {SpeechRecognition?:new()=>BrowserSpeech;webkitSpeechRecognition?:new()=>BrowserSpeech};
  return browser.SpeechRecognition||browser.webkitSpeechRecognition;
};
export default function MusicRecall({student,preview=false}:{student:Student;preview?:boolean}) {
  const settingsString=JSON.stringify(student.musicPlaySettings||{});
  const levels=useMemo(()=>getRecallLevels(student.musicPlaySettings),[settingsString]);
  const fallback=useMemo(()=>getInitialRecallProfile(student.musicPlaySettings),[settingsString]);
  const [levelIndex,setLevelIndex]=useState(0);
  const safeIndex=Math.max(0,Math.min(levelIndex,Math.max(0,levels.length-1)));
  const profile=levels[safeIndex]||(preview?fallback:null);
  const [prefs,setPrefs]=useState<RecallPreferences>(()=>normalizeRecallPreferences(student.musicPlaySettings?.recallPreferences,student.musicPlaySettings?.bpm));
  const [events,setEvents]=useState<RecallEvent[]>([]);
  const [cursor,setCursor]=useState(0);
  const [running,setRunning]=useState(false);
  const [countdown,setCountdown]=useState<number|null>(null);
  const [score,setScore]=useState<{correct:number;total:number;seconds:number}|null>(null);
  const [error,setError]=useState('');
  const [micMode,setMicMode]=useState<'off'|'pitch'|'speech'>('off');
  const [speechMessage,setSpeechMessage]=useState('');
  const engine=useRef<Running|null>(null);
  const frame=useRef(0);
  const media=useRef<{stream:MediaStream;ctx:AudioContext;analyser:AnalyserNode;buffer:Float32Array<ArrayBuffer>;lastPitch:number|null;since:number;lastInputAt:number}|null>(null);
  const speech=useRef<BrowserSpeech|null>(null);
  const keyInput=useRef<number[]>([]);
  const alive=useRef(true);
  const currentEvent=events[cursor];
  const options=useMemo(()=>profile?[...new Set([...(profile.clefs!=='bass'?profile.trebleNotes:[]),...(profile.clefs!=='treble'?profile.bassNotes:[])])].sort((a,b)=>a-b):[],[profile]);
  const canShowPiano=options.length>0&&options.length<=9&&options.at(-1)!-options[0]<=14&&profile?.clefs!=='both';
  const stopListening=useCallback(()=>{
    if(speech.current){try{speech.current.onend=null;speech.current.stop();}catch{}speech.current=null;}
    if(media.current){
      media.current.stream.getTracks().forEach(t=>t.stop());
      void media.current.ctx.close().catch(()=>undefined);
      media.current=null;
    }
    setMicMode('off');
  },[]);
  const stop=useCallback(()=>{
    cancelAnimationFrame(frame.current);
    const active=engine.current;
    if(active&&!active.finished){active.finished=true;void active.audio.close().catch(()=>undefined);}
    engine.current=null;
    setRunning(false);setCountdown(null);
    stopListening();
  },[stopListening]);
  useEffect(()=>{
    alive.current=true;
    return ()=>{alive.current=false;cancelAnimationFrame(frame.current);
      if(engine.current)void engine.current.audio.close().catch(()=>undefined);
      if(speech.current){try{speech.current.onend=null;speech.current.stop();}catch{}}
      if(media.current){media.current.stream.getTracks().forEach(t=>t.stop());void media.current.ctx.close().catch(()=>undefined);}
    };
  },[]);
  useEffect(()=>{
    if(!running)return;
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[running]);
  const savePref=(part:Partial<RecallPreferences>)=>{
    if(running)return;
    const next=normalizeRecallPreferences({...prefs,...part},student.musicPlaySettings?.bpm);
    setPrefs(next);
    if(!preview){
      const latest=getStudents().find(s=>s.id===student.id);
      if(latest)updateStudent(student.id,{musicPlaySettings:{...latest.musicPlaySettings,recallPreferences:next}});
    }
  };
  const finish=useCallback((active:Running)=>{
    if(active.finished)return;
    active.finished=true;
    cancelAnimationFrame(frame.current);
    const result={correct:active.correct,total:active.events.length,seconds:Math.round((performance.now()-active.started)/100)/10};
    setScore(result);setRunning(false);setCountdown(null);
    stopListening();
    if(!preview) {
      const latest=getStudents().find(s=>s.id===student.id);
      if(latest){
        const attempt:MusicPlayAttempt={
          id:typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now()),
          at:new Date().toISOString(),level:active.level,bpm:active.pref.bpm,
          accuracy:Math.round(100*result.correct/result.total),timing:0,
          correct:result.correct,total:result.total,input:active.input,
          mode:'reading',recallLevelId:active.profileId,responseMode:active.pref.answer,durationSeconds:result.seconds,
        };
        updateStudent(student.id,{musicPlayAttempts:[...(latest.musicPlayAttempts||[]),attempt].slice(-30)});
      }
    }
    void active.audio.close().catch(()=>undefined);
  },[preview,student.id,stopListening]);
  const judge=useCallback((active:Running,index:number)=>{
    if(index<=active.responded)return;
    const pass=scoreRecallAnswers(active.events[index],active.hits.get(index)||[]);
    if(pass)active.correct++;
    active.responded=index;
    if(index===active.events.length-1){finish(active);return;}
    active.index=index+1;setCursor(index+1);
  },[finish]);
  const addAnswer=useCallback((midi:number,input:PlayedInput)=>{
    const active=engine.current;
    if(!active||active.finished)return;
    const index=active.index;
    if(index<0||index>=active.events.length)return;
    const expected=active.events[index];
    if(active.pref.clock==='metronome'){
      const beats=(active.audio.currentTime-active.start)/ (60/active.pref.bpm);
      if(beats<expected.startBeat||beats>=expected.startBeat+2)return;
    }
    const recorded=active.hits.get(index)||[];
    if(recorded.length>=expected.notes.length)return;
    active.input=input;
    recorded.push(midi);active.hits.set(index,recorded);
    if(active.pref.clock==='elapsed'&&recorded.length===expected.notes.length)judge(active,index);
  },[judge]);
  const start=async()=>{
    stop();setError('');setScore(null);setCursor(0);setEvents([]);
    if(!profile)return;
    let generated:RecallEvent[];
    try{generated=generateRecallExercise(profile,profile.minEvents+prefs.extraEvents);}catch(e){
      setError(e instanceof Error?e.message:'לא ניתן לייצר תרגיל מההגדרות האלה');return;
    }
    try{
      const audio=new AudioContext();await audio.resume();
      const beatSeconds=60/prefs.bpm;
      const begin=audio.currentTime+(prefs.clock==='metronome'?4*beatSeconds+.12:.1);
      if(prefs.clock==='metronome'){
        for(let b=-4;b<generated.length*2;b++)drawTone(audio,begin+b*beatSeconds,b%4===0);
      }
      const active:Running={audio,events:generated,start:begin,started:performance.now(),index:0,hits:new Map(),
        correct:0,responded:-1,finished:false,pref:{...prefs},input:'touch',level:safeIndex+1,profileId:profile.id};
      engine.current=active;setEvents(generated);setRunning(true);
      let previousCountdown=-1;
      const tick=()=>{
        const rt=engine.current;
        if(rt!==active||rt.finished)return;
        if(rt.pref.clock==='metronome'){
          const nowBeat=(audio.currentTime-rt.start)/beatSeconds;
          if(nowBeat<0){
            const next=Math.ceil(-nowBeat);
            if(next!==previousCountdown){setCountdown(next);previousCountdown=next;}
          }else{
            if(previousCountdown!==0){setCountdown(null);previousCountdown=0;}
            while(!rt.finished&&rt.index<rt.events.length&&nowBeat>=(rt.index+1)*2)judge(rt,rt.index);
          }
        }
        if(media.current&&rt.pref.answer==='play'&&rt.events[rt.index]?.notes.length===1){
          const input=media.current;
          input.analyser.getFloatTimeDomainData(input.buffer);
          const pitch=detectRecallPitch(input.buffer,input.ctx.sampleRate),now=performance.now();
          if(pitch!==input.lastPitch){input.lastPitch=pitch;input.since=now;}
          else if(pitch!==null&&now-input.since>=180&&now-input.lastInputAt>=450){
            input.lastInputAt=now;addAnswer(pitch,'microphone');
          }
        }
        if(!rt.finished)frame.current=requestAnimationFrame(tick);
      };
      frame.current=requestAnimationFrame(tick);
    }catch{setError('אין אפשרות לפתוח מנוע שמע. בדקי הרשאות שמע בדפדפן.');}
  };
  const startPitchMic=async()=>{
    if(prefs.answer!=='play'||!running)return;
    if(events.some(ev=>ev.notes.length>1)){setError('זיהוי גובה ממיקרופון תומך כרגע בצליל יחיד בלבד. לאקורדים השתמשי ב־MIDI או במסך.');return;}
    stopListening();setError('');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      const ctx=new AudioContext();await ctx.resume();
      const analyser=ctx.createAnalyser();analyser.fftSize=4096;
      ctx.createMediaStreamSource(stream).connect(analyser);
      media.current={stream,ctx,analyser,buffer:new Float32Array(new ArrayBuffer(analyser.fftSize*4)),lastPitch:null,since:0,lastInputAt:0};
      setMicMode('pitch');
    }catch{setError('אין גישה למיקרופון או שהדפדפן אינו תומך. אפשר להמשיך דרך המסך או MIDI.');}
  };
  const startSpeech=()=>{
    if(prefs.answer!=='name'||!running)return;
    stopListening();setError('');setSpeechMessage('');
    const Constructor=speechConstructor();
    if(!Constructor){setError('זיהוי דיבור בעברית אינו זמין בדפדפן זה. השתמשי בכפתורי שמות התווים.');return;}
    try{
      const instance=new Constructor();
      instance.lang='he-IL';instance.continuous=true;instance.interimResults=false;
      instance.onresult=event=>{
        for(let i=event.resultIndex;i<event.results.length;i++){
          const spoken=event.results[i]?.[0]?.transcript||'';
          setSpeechMessage('זוהה: '+spoken);
          const active=engine.current;
          if(!active||active.finished)continue;
          spokenNotes(spoken,options).forEach(n=>addAnswer(n,'microphone'));
        }
      };
      instance.onerror=event=>{setError('זיהוי הדיבור הופסק: '+event.error+'. אפשר לענות במסך.');};
      instance.onend=()=>{if(alive.current)setMicMode('off');};
      speech.current=instance;instance.start();setMicMode('speech');
    }catch{setError('לא ניתן להפעיל את זיהוי הדיבור בדפדפן זה.');}
  };
  const connectMidi=async()=>{
    const nav=navigator as Navigator & {requestMIDIAccess?:()=>Promise<{inputs:Map<string,{onmidimessage:((ev:{data:Uint8Array})=>void)|null}>}>};
    if(!nav.requestMIDIAccess){setError('Web MIDI אינו נתמך בדפדפן הזה. השתמשי במסך או במיקרופון.');return;}
    try{
      const access=await nav.requestMIDIAccess();
      access.inputs.forEach(input=>{input.onmidimessage=ev=>{
        const [status,pitch,velocity]=ev.data;
        if((status&0xf0)===0x90&&velocity>0)addAnswer(pitch,'midi');
      };});
      setSpeechMessage('מקלדת MIDI מחוברת.');
    }catch{setError('החיבור למקלדת MIDI לא אושר.');}
  };
  useEffect(()=>{
    const keys='asdfghjkl';
    const onKey=(e:KeyboardEvent)=>{
      if(e.repeat||e.ctrlKey||e.altKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName||''))return;
      const key=keys.indexOf(e.key.toLowerCase());
      if(key>=0&&prefs.answer==='play'&&options[key]!==undefined){e.preventDefault();addAnswer(options[key],'keyboard');}
      if(e.key>='1'&&e.key<='9'&&prefs.answer==='name'){
        const n=Number(e.key)-1;
        if(options[n]!==undefined){e.preventDefault();addAnswer(options[n],'keyboard');}
      }
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[prefs.answer,options,addAnswer]);
  if(!profile)return <div className="rounded-xl border p-5 text-sm" dir="rtl">
    <strong>המורה עדיין לא הגדירה לך רמת שליפה אישית.</strong>
    <p>יש להגדיר ולאשר את הרמה הראשונה דרך ״רמות אימון״ בכרטיס התלמידה.</p>
  </div>;
  const whitePitchClasses=[0,2,4,5,7,9,11];
  const startPiano=Math.floor(options[0]/12)*12;
  const endPiano=Math.ceil((options.at(-1)!+1)/12)*12;
  const whitePitches=Array.from({length:endPiano-startPiano},(_,i)=>startPiano+i).filter(n=>whitePitchClasses.includes(n%12));
  return <Card className="border-indigo-300" dir="rtl">
    <CardHeader><CardTitle>🎼 שליפת תווים — אימון אישי</CardTitle>
      <p className="text-sm text-muted-foreground">אין רמות קבועות: כל רמה נקבעת על ידי המורה עבור התלמידה הזאת בלבד.</p></CardHeader>
    <CardContent className="space-y-4">
      {preview&&<p className="rounded border border-amber-300 bg-amber-50 text-amber-900 p-2 text-xs">התנסות מורה: אם לא הוגדרו רמות אישיות, נעשה שימוש בדוגמה בלבד. אין כתיבה לנתוני תלמידות.</p>}
      <div className="flex flex-wrap gap-2">
        {(levels.length?levels:[profile]).map((level,i)=><Button type="button" size="sm" key={level.id+'-'+i}
          variant={safeIndex===i?'default':'outline'} disabled={running} onClick={()=>{stop();setLevelIndex(i);setEvents([]);setScore(null);}}>רמה {i+1}: {level.title||'שליפה'}</Button>)}
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 rounded-xl border p-3">
        <label className="text-sm space-y-1">כמה עמודות תווים להוסיף מעבר למינימום ({profile.minEvents})
          <input type="number" min={0} max={48} value={prefs.extraEvents} disabled={running} onChange={e=>savePref({extraEvents:Number(e.target.value)})} className="block w-full border rounded p-2 bg-background"/>
        </label>
        <label className="text-sm space-y-1">מהירות (BPM)
          <input type="number" min={40} max={180} value={prefs.bpm} disabled={running} onChange={e=>savePref({bpm:Number(e.target.value)})} className="block w-full border rounded p-2 bg-background"/>
        </label>
        <label className="text-sm space-y-1">קצב / מדידת ביצוע
          <select value={prefs.clock} disabled={running} onChange={e=>savePref({clock:e.target.value as RecallPreferences['clock']})} className="block w-full border rounded p-2 bg-background">
            <option value="metronome">מטרונום — 2 פעימות לכל עמודה</option><option value="elapsed">מדידת זמן — קידום עם כל תשובה</option>
          </select>
        </label>
        <label className="text-sm space-y-1">איך לענות?
          <select value={prefs.answer} disabled={running} onChange={e=>savePref({answer:e.target.value as RecallPreferences['answer']})} className="block w-full border rounded p-2 bg-background">
            <option value="play">נגינה — גובה הצליל</option><option value="name">הקראה — שם הצליל</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{prefs.clock==='elapsed'?'בלי מטרונום: השעון מודד את זמן התרגיל, וכל תגובה מקדמת לעמודה הבאה.':'עם מטרונום: אפשר לענות בכל רגע בתוך שתי הפעימות של העמודה.'} התווים מצוירים כראשי תווים בלבד, ללא רגל.</p>
      {!!events.length&&<RecallNotation events={events} index={cursor} profile={profile}/>}
      {!events.length&&<div className="rounded-xl border border-dashed p-7 text-center text-muted-foreground">בחרי הגדרות והתחילי את האימון.</div>}
      {countdown!==null&&<div role="status" className="text-3xl text-center font-bold text-amber-700">הכנה: {countdown}</div>}
      <div className="flex gap-2 flex-wrap justify-center">
        {!running?<Button onClick={()=>void start()}><Play className="w-4 h-4 ml-1"/> התחלת אימון</Button>:
          <Button variant="outline" onClick={stop}>עצירה</Button>}
        {running&&prefs.answer==='play'&&<Button variant="outline" onClick={()=>void connectMidi()}>חיבור MIDI</Button>}
        {running&&prefs.answer==='play'&&<Button variant="outline" onClick={()=>micMode==='pitch'?stopListening():void startPitchMic()}>
          {micMode==='pitch'?<MicOff className="w-4 h-4 ml-1"/>:<Mic className="w-4 h-4 ml-1"/>}{micMode==='pitch'?'כיבוי מיקרופון':'נגינה במיקרופון'}
        </Button>}
        {running&&prefs.answer==='name'&&<Button variant="outline" onClick={()=>micMode==='speech'?stopListening():startSpeech()}>
          <Mic className="w-4 h-4 ml-1"/>{micMode==='speech'?'כיבוי זיהוי דיבור':'הקראת תווים במיקרופון'}
        </Button>}
      </div>
      {running&&prefs.answer==='name'&&<p className="text-xs text-muted-foreground">זיהוי דיבור עברי תלוי בדפדפן, ועשוי להעביר שמע לשירות הזיהוי שלו. לחיצה על כפתורי התווים אינה דורשת מיקרופון.</p>}
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      {speechMessage&&<p role="status" className="text-xs text-muted-foreground">{speechMessage}</p>}
      {prefs.answer==='play'?<div className="space-y-2">
        <p className="text-sm font-medium"><Volume2 className="inline w-4 h-4"/> נגינה: בחרי צלילים במסך, השתמשי ב־MIDI או במיקרופון (צליל בודד בלבד).</p>
        {canShowPiano&&<div dir="ltr" className="rounded border bg-white p-2 overflow-x-auto" aria-label="מקשי הפסנתר המותרים מוארים">
          <svg viewBox={'0 0 '+(whitePitches.length*42+4)+' 118'} width="100%" style={{maxWidth:Math.max(170,whitePitches.length*42+4)}}>
            {whitePitches.map((midi,i)=><rect key={midi} x={i*42+2} y={2} width={40} height={112} stroke="#111827" fill={options.includes(midi)?'#bfdbfe':'#fff'}/>)}
            {Array.from({length:endPiano-startPiano},(_,i)=>startPiano+i).filter(n=>[1,3,6,8,10].includes(n%12)).map(midi=>{
              const count=whitePitches.filter(n=>n<midi).length;
              return <rect key={midi} x={count*42-12} y={2} width={25} height={70} fill={options.includes(midi)?'#6366f1':'#111827'}/>;
            })}
          </svg>
          <p className="text-center text-xs text-indigo-800">רק המקשים המשתתפים בתרגיל מודגשים בכחול.</p>
        </div>}
        {!canShowPiano&&<p className="text-xs text-muted-foreground">המנעד רחב או כולל שתי חמשות; לא מוצגת מקלדת מאירה לא מדויקת.</p>}
      </div>:<p className="text-sm">הקראה: בחרי את שם הצליל, או הפעילי זיהוי דיבור עברי.</p>}
      <p className="text-xs text-muted-foreground">לפני שימוש במקשי מחשב: העבירי את השפה לאנגלית (EN). נגינה: A S D F G H J K L; הקראה: הספרות 1–9.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {options.map((midi,i)=><button key={midi} type="button" disabled={!running||countdown!==null}
          onClick={()=>addAnswer(midi,'touch')} className="rounded-xl border-2 border-indigo-200 bg-white p-3 text-slate-900 min-h-14 hover:bg-indigo-100 active:bg-amber-100 disabled:opacity-50 touch-manipulation text-sm">
          <span className="block text-xs text-muted-foreground">{prefs.answer==='name'?i+1:i<9?'ASDFGHJKL'[i]:''}</span>
          {noteName(midi)}
        </button>)}
      </div>
      {score&&<div role="status" className="rounded-xl border-2 border-emerald-300 bg-emerald-50 text-slate-900 p-4 text-center">
        <div className="text-lg font-bold">האימון הסתיים!</div>
        <p>נכונות: {score.correct} מתוך {score.total} ({Math.round(score.correct/score.total*100)}%)</p>
        <p>משך ביצוע: {score.seconds} שניות</p>
        <p className="text-xs">{preview?'מצב מורה: התוצאות לא נשמרו.':'התוצאה עודכנה מקומית; יש לוודא סנכרון ענן.'}</p>
        <Button variant="outline" onClick={()=>void start()}><RotateCcw className="w-4 h-4 ml-1"/> שוב</Button>
      </div>}
    </CardContent>
  </Card>;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Student } from '@/lib/types';
import { getStudents, updateStudent } from '@/lib/storage';
import { noteName, type MusicPlayAttempt } from '@/lib/musicPlay';
import { detectRecallPitch } from '@/lib/recallMicrophone';
import {
  getRecallLevels, getInitialRecallProfile, normalizeRecallPreferences, generateRecallExercise,
  scoreRecallAnswers, assignRecallInput, resolveRecallComputerPitch,
  RECALL_ENGLISH_KEYS, RECALL_HEBREW_KEYS,
  type RecallEvent, type RecallPreferences, type RecallProfile,
} from '@/lib/musicRecall';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, Play, RotateCcw, Volume2 } from 'lucide-react';
import { RecallScreenPiano, RecallScreenFlute } from './MusicRecallInstruments';
import { parseHebrewRecallNotes } from '@/lib/recallSpeech';

type PlayedInput = 'touch' | 'keyboard' | 'midi' | 'microphone';
type Running = {
  audio:AudioContext; events:RecallEvent[]; start:number; started:number; index:number;
  hits:Map<number,number[]>; correct:number; responded:number; finished:boolean;
  pref:RecallPreferences; input:PlayedInput; level:number; profileId:string;
};
const NATURAL_STEPS:Record<number,number>={0:0,2:1,4:2,5:3,7:4,9:5,11:6};
function diatonicHeight(midi:number):number {
  return Math.floor(midi/12)*7+NATURAL_STEPS[midi%12];
}
function staffPosition(midi:number,clef:'treble'|'bass') {
  const base=clef==='treble'?64:43;
  const bottom=clef==='treble'?122:244;
  return bottom-(diatonicHeight(midi)-diatonicHeight(base))*6;
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
      {/* Repaint stave lines above the hollow noteheads so the line crossing a note (e.g. G) stays visible. */}
      {clefs.map(clef=>Array.from({length:5},(_,k)=>
        <line key={clef+'-foreground-'+k} x1={52} x2={787}
          y1={linesBottom(clef)-k*12} y2={linesBottom(clef)-k*12}
          stroke="#334155" strokeWidth={1.5} pointerEvents="none" />
      ))}
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
type SpeechResult = ArrayLike<{transcript:string}> & {isFinal?:boolean};
type BrowserSpeech = {
  lang:string;continuous:boolean;interimResults:boolean;
  onstart:(()=>void)|null;onaudiostart:(()=>void)|null;onspeechstart:(()=>void)|null;
  onnomatch:(()=>void)|null;
  onresult:((event:{results:ArrayLike<SpeechResult>;resultIndex:number})=>void)|null;
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
  const [speechStatus,setSpeechStatus]=useState('מיקרופון ההקראה כבוי. אפשר לבדוק אותו לפני תחילת התרגיל.');
  const [speechPreview,setSpeechPreview]=useState('');
  const [playSurface,setPlaySurface]=useState<'piano'|'flute'>('piano');
  const engine=useRef<Running|null>(null);
  const frame=useRef(0);
  const media=useRef<{stream:MediaStream;ctx:AudioContext;analyser:AnalyserNode;buffer:Float32Array<ArrayBuffer>;lastPitch:number|null;since:number;lastInputAt:number;lastFiredPitch:number|null}|null>(null);
  const speech=useRef<BrowserSpeech|null>(null);
  const speechRetry=useRef<ReturnType<typeof setTimeout>|null>(null);
  const alive=useRef(true);
  const options=useMemo(()=>profile?[...new Set([...(profile.clefs!=='bass'?profile.trebleNotes:[]),...(profile.clefs!=='treble'?profile.bassNotes:[])])].sort((a,b)=>a-b):[],[profile]);
  const canUseComputerKeyboard=options.length>0&&options.length<=RECALL_ENGLISH_KEYS.length;
  const lowPitchHeight=options.length?diatonicHeight(options[0]):0;
  const pitchSpan=options.length?diatonicHeight(options[options.length-1])-lowPitchHeight:0;
  const pixelPerStep=Math.min(12,188/Math.max(1,pitchSpan));
  const stopListening=useCallback(()=>{
    if(speechRetry.current!==null){clearTimeout(speechRetry.current);speechRetry.current=null;}
    if(speech.current){try{speech.current.onend=null;speech.current.stop();}catch{}speech.current=null;}
    if(media.current){
      media.current.stream.getTracks().forEach(t=>t.stop());
      void media.current.ctx.close().catch(()=>undefined);
      media.current=null;
    }
    setMicMode('off');
    setSpeechStatus('מיקרופון ההקראה כבוי.');
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
      if(speechRetry.current!==null)clearTimeout(speechRetry.current);
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
    if(part.answer&&part.answer!==prefs.answer){stopListening();setEvents([]);setScore(null);setPlaySurface('piano');}
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
    const current=active.index;
    if(current<0||current>=active.events.length)return;
    let index=current;
    if(active.pref.clock==='metronome'){
      const beat=(active.audio.currentTime-active.start)/(60/active.pref.bpm);
      const chosen=assignRecallInput(active.events,current,beat,midi,active.hits.get(current)||[]);
      if(chosen===null)return;
      index=chosen;
    }
    const expected=active.events[index];
    const recorded=active.hits.get(index)||[];
    if(recorded.length>=expected.notes.length)return;
    active.input=input;
    recorded.push(midi);active.hits.set(index,recorded);
    if(active.pref.clock==='elapsed'&&recorded.length===expected.notes.length)judge(active,index);
  },[judge]);
  const start=async()=>{
    // A speech session activated in preflight remains armed during the exercise.
    // stop() would otherwise turn off a previously permitted microphone.
    if(!(prefs.answer==='name'&&speech.current))stop();
    setError('');setScore(null);setCursor(0);setEvents([]);
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
          if(pitch!==input.lastPitch){
            input.lastPitch=pitch;input.since=now;
            if(pitch!==input.lastFiredPitch)input.lastFiredPitch=null;
          }else if(pitch!==null&&pitch!==input.lastFiredPitch&&now-input.since>=180&&now-input.lastInputAt>=300){
            input.lastInputAt=now;input.lastFiredPitch=pitch;addAnswer(pitch,'microphone');
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
      media.current={stream,ctx,analyser,buffer:new Float32Array(new ArrayBuffer(analyser.fftSize*4)),lastPitch:null,since:0,lastInputAt:0,lastFiredPitch:null};
      setMicMode('pitch');
    }catch{setError('אין גישה למיקרופון או שהדפדפן אינו תומך. אפשר להמשיך דרך המסך או MIDI.');}
  };
  const startSpeech=()=>{
    // Allow a genuine recognition check before the exercise begins.
    if(prefs.answer!=='name')return;
    stopListening();setError('');setSpeechMessage('');setSpeechPreview('');
    const Constructor=speechConstructor();
    if(!Constructor){
      setSpeechStatus('זיהוי דיבור בעברית אינו נתמך בדפדפן הזה.');
      setError('המיקרופון של המכשיר אינו מספיק: הדפדפן צריך לתמוך גם בזיהוי דיבור בעברית. אפשר להשתמש בלחצני שמות התווים.');
      return;
    }
    try{
      const instance=new Constructor();
      instance.lang='he-IL';instance.continuous=true;instance.interimResults=true;
      instance.onstart=()=>{
        if(speech.current!==instance)return;
        setMicMode('speech');
        setSpeechStatus('מוכן להקראה — אמרי בקול ברור דו, רה או מי.');
      };
      instance.onaudiostart=()=>{
        if(speech.current===instance)setSpeechStatus('המיקרופון מחובר; ממתין לדיבור בעברית...');
      };
      instance.onspeechstart=()=>{
        if(speech.current===instance)setSpeechStatus('נקלט דיבור, ממתין לתמלול של הדפדפן...');
      };
      instance.onnomatch=()=>{
        if(speech.current===instance)setSpeechStatus('נקלט קול, אבל שירות זיהוי הדיבור לא הצליח לתמלל אותו. נסי לומר תו בודד.');
      };
      instance.onresult=event=>{
        if(speech.current!==instance)return;
        for(let i=event.resultIndex;i<event.results.length;i++){
          const item=event.results[i];
          const heard=item?.[0]?.transcript?.trim()||'';
          if(!heard)continue;
          setSpeechPreview(heard);
          if(item.isFinal===false){
            setSpeechStatus('נשמע דיבור: '+heard+' — ממתין לאישור התמלול.');
            continue;
          }
          const notes=parseHebrewRecallNotes(heard,options);
          setSpeechMessage('הדפדפן שמע: "'+heard+'"');
          if(!notes.length){
            setSpeechStatus('הדיבור תומלל, אך לא זוהה שם תו מהרמה הנוכחית. אמרי למשל "דו" או "דו ראשון".');
            continue;
          }
          setSpeechStatus('זוהו שמות התווים: '+notes.map(noteName).join(', ')+(engine.current&&!engine.current.finished?' — התשובה נקלטה.':' — בדיקת המיקרופון הצליחה; אפשר להתחיל.'));
          const current=engine.current;
          // Preflight confirms recognition but never grades a student attempt.
          if(current&&!current.finished&&current.pref.answer==='name'){
            notes.forEach(n=>addAnswer(n,'microphone'));
          }
        }
      };
      instance.onerror=event=>{
        if(speech.current!==instance)return;
        const code=event.error;
        if(code==='no-speech'){
          setSpeechStatus('המיקרופון מחובר, אבל לא זוהה דיבור ברור. נסי שוב בתו בודד.');
          return;
        }
        const fatal=['not-allowed','service-not-allowed','audio-capture','network','language-not-supported'];
        const descriptions:Record<string,string>={
          'not-allowed':'הרשאת המיקרופון נדחתה.',
          'service-not-allowed':'הדפדפן חסם את שירות זיהוי הדיבור.',
          'audio-capture':'אין גישה למקור שמע במכשיר.',
          network:'שירות זיהוי הדיבור לא הצליח להתחבר לרשת; ייתכן שהסינון חוסם אותו.',
          'language-not-supported':'הדפדפן אינו תומך בזיהוי עברית.',
        };
        if(fatal.includes(code)){
          if(speechRetry.current!==null){clearTimeout(speechRetry.current);speechRetry.current=null;}
          instance.onend=null;
          try{instance.stop();}catch{}
          speech.current=null;
          setMicMode('off');
          setSpeechStatus(descriptions[code]||'שירות זיהוי הדיבור אינו זמין.');
          setError('זיהוי הדיבור לא פועל: '+(descriptions[code]||code)+' אפשר לענות בינתיים בלחצני התווים.');
        }else{
          setSpeechStatus('זיהוי הדיבור נכשל ('+code+'). ניסיון חדש יתבצע אם הדפדפן יאפשר.');
        }
      };
      instance.onend=()=>{
        if(!alive.current||speech.current!==instance)return;
        setSpeechStatus('שירות זיהוי הדיבור נעצר. מנסה לחדש האזנה...');
        if(speechRetry.current!==null)clearTimeout(speechRetry.current);
        speechRetry.current=setTimeout(()=>{
          speechRetry.current=null;
          if(speech.current===instance&&alive.current){
            try{instance.start();}catch{
              setMicMode('off');speech.current=null;
              setSpeechStatus('לא ניתן לחדש את זיהוי הדיבור.');
              setError('הדפדפן הפסיק את ההקראה. לחצי שוב על הפעלת המיקרופון או השתמשי בכפתורי שמות התווים.');
            }
          }
        },500);
      };
      speech.current=instance;
      setSpeechStatus('מפעיל את זיהוי הדיבור בעברית...');
      instance.start();
      setMicMode('speech');
    }catch{
      speech.current=null;setMicMode('off');
      setSpeechStatus('לא ניתן להפעיל את שירות זיהוי הדיבור.');
      setError('בדקי הרשאת מיקרופון ותמיכת הדפדפן בזיהוי דיבור בעברית.');
    }
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
    const onKey=(e:KeyboardEvent)=>{
      if(e.repeat||e.isComposing||e.ctrlKey||e.altKey||e.metaKey)return;
      const target=e.target as HTMLElement|null;
      if(target&&(target.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(target.tagName)))return;
      if(!engine.current||engine.current.finished)return;
      const pitch=resolveRecallComputerPitch(e,options,prefs.answer);
      if(pitch!==null){e.preventDefault();addAnswer(pitch,'keyboard');}
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[prefs.answer,options,addAnswer]);
  if(!profile)return <div className="rounded-xl border p-5 text-sm" dir="rtl">
    <strong>המורה עדיין לא הגדירה לך רמת שליפה אישית.</strong>
    <p>יש להגדיר ולאשר את הרמה הראשונה דרך ״רמות אימון״ בכרטיס התלמידה.</p>
  </div>;
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
        <div role="group" aria-label="שני מצבי שליפת תווים" className="col-span-full flex flex-wrap gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-2">
          <Button type="button" variant={prefs.answer==='name'?'default':'outline'} disabled={running} aria-pressed={prefs.answer==='name'} onClick={()=>savePref({answer:'name'})}>🗣️ שליפה בהקראה — לומר / לבחור שם תו</Button>
          <Button type="button" variant={prefs.answer==='play'?'default':'outline'} disabled={running} aria-pressed={prefs.answer==='play'} onClick={()=>savePref({answer:'play'})}>🎶 שליפה בנגינה — לזהות גובה הצליל</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{prefs.clock==='elapsed'?'בלי מטרונום: השעון מודד את זמן התרגיל, וכל תגובה מקדמת לעמודה הבאה.':'עם מטרונום: אפשר לענות בכל רגע בתוך שתי הפעימות של העמודה. הקשה קרובה מעט לפני תחילת התו הבא (עד רבע פעימה) יכולה להיחשב עבורו.'} התווים מצוירים כראשי תווים בלבד, ללא רגל.</p>
      {!!events.length&&<RecallNotation events={events} index={cursor} profile={profile}/>}
      {!events.length&&<div className="rounded-xl border border-dashed p-7 text-center text-muted-foreground">בחרי הגדרות והתחילי את האימון.</div>}
      {countdown!==null&&<div role="status" className="text-3xl text-center font-bold text-amber-700">הכנה: {countdown}</div>}
      <div className="flex gap-2 flex-wrap justify-center">
        {!running?<Button onClick={()=>void start()}><Play className="w-4 h-4 ml-1"/> התחלת אימון</Button>:
          <Button variant="outline" onClick={stop}>עצירה</Button>}
        {running&&prefs.answer==='play'&&<Button variant="outline" onClick={()=>void connectMidi()}>🎹 חיבור מקלדת MIDI</Button>}
        {running&&prefs.answer==='play'&&<Button variant="outline" onClick={()=>micMode==='pitch'?stopListening():void startPitchMic()}>
          {micMode==='pitch'?<MicOff className="w-4 h-4 ml-1"/>:<Mic className="w-4 h-4 ml-1"/>}{micMode==='pitch'?'כיבוי מיקרופון':'זיהוי גובה צליל מהמיקרופון'}
        </Button>}

      </div>
      {prefs.answer==='name'&&<p className="text-xs text-muted-foreground">תמלול דיבור בעברית תלוי בשירות זיהוי הדיבור של הדפדפן, ולעיתים השמע מועבר לספק השירות. הסכמת מיקרופון בלבד אינה מבטיחה שהשירות זמין.</p>}
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      {speechMessage&&<p role="status" className="text-xs text-muted-foreground">{speechMessage}</p>}
      {prefs.answer==='name'?<section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3" aria-label="שליפה בהקראה">
        <p className="font-semibold">🗣️ שליפה בהקראה</p>
        <p className="text-sm text-muted-foreground">אפשר לבדוק את המיקרופון כבר עכשיו, לפני התחלת התרגיל. אמרי שם תו בודד (למשל "דו ראשון") וראי מה הדפדפן שמע; במהלך האימון התשובה תיקלט אוטומטית.</p>
        <div className="rounded-xl border border-sky-200 bg-white p-3 space-y-2" aria-label="בדיקת מיקרופון להקראת שמות תווים">
          <Button type="button" variant={micMode==='speech'?'default':'outline'} onClick={()=>micMode==='speech'?stopListening():startSpeech()}>
            {micMode==='speech'?<MicOff className="w-4 h-4 ml-1"/>:<Mic className="w-4 h-4 ml-1"/>}
            {micMode==='speech'?'כיבוי זיהוי דיבור':'זיהוי שמות תווים במיקרופון — בדיקה והפעלה'}
          </Button>
          <p role="status" aria-live="polite" className="text-sm text-slate-700">{speechStatus}</p>
          {speechPreview&&<p className="text-xs text-slate-600">תמלול אחרון: <strong>{speechPreview}</strong></p>}
          {!running&&micMode==='speech'&&<p className="text-xs text-emerald-800">המיקרופון יישאר מופעל גם לאחר לחיצה על ״התחלת אימון״.</p>}
        </div>
        <p className="text-sm text-muted-foreground">אפשר גם ללחוץ על שם התו. עד תשעה תווים זמינים בנוסף מקשי הספרות 1–9 במחשב.</p>
        <div aria-label="לחצני שמות הצלילים" role="group" className="flex flex-col items-center gap-2 max-h-[460px] overflow-y-auto rounded-xl bg-white/60 p-3">
          {[...options].reverse().map(midi=><button type="button" key={midi} disabled={!running||(countdown!==null&&countdown>1)}
            onClick={()=>addAnswer(midi,'touch')} aria-label={'הקראה: '+noteName(midi)}
            className="w-full max-w-[280px] min-h-14 rounded-xl border-2 border-sky-200 bg-white px-3 py-3 text-slate-900 font-semibold enabled:hover:bg-sky-100 disabled:opacity-55 touch-manipulation">
            <span className="block">{noteName(midi)}</span>
            {canUseComputerKeyboard&&<span className="block text-xs text-muted-foreground mt-1">מקש {options.indexOf(midi)+1}</span>}
          </button>)}
        </div>
        <p className="text-xs text-slate-600">הצליל הגבוה ביותר למעלה והנמוך ביותר למטה. {canUseComputerKeyboard?'מקשי הספרות במחשב ממוספרים מדו הנמוך לגבוה (1 לנמוך ביותר).':''}</p>
        {options.length>RECALL_ENGLISH_KEYS.length&&<p className="text-xs text-amber-800">מעל תשעה צלילים אין קלט ממקלדת מחשב. ניתן לענות בלחיצה על שמות התווים או במיקרופון.</p>}
      </section>:<section className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/30 p-3" aria-label="שליפה בנגינה">
        <p className="font-semibold">🎶 שליפה בנגינה</p>
        <p className="text-sm text-muted-foreground">אפשר לנגן צליל במיקרופון, להשתמש במקלדת MIDI או ללחוץ על כלי נגינה וירטואלי. מיקרופון גובה צליל תומך כעת בצליל בודד; MIDI וכלי המסך תומכים גם בכמה צלילים ברצף.</p>
        <div role="group" aria-label="בחירת כלי נגינה על המסך" className="flex flex-wrap gap-2">
          <Button type="button"  variant={playSurface==='piano'?'default':'outline'} onClick={()=>setPlaySurface('piano')} aria-pressed={playSurface==='piano'}>🎹 פסנתר על המסך</Button>
          <Button type="button" variant={playSurface==='flute'?'default':'outline'} onClick={()=>setPlaySurface('flute')} aria-pressed={playSurface==='flute'}>🪈 חליל צד על המסך</Button>
        </div>
        {playSurface==='piano'
          ?<RecallScreenPiano allowed={options} active={running&&!(countdown!==null&&countdown>1)} onAnswer={midi=>addAnswer(midi,'touch')}/>
          :<RecallScreenFlute allowed={options} active={running&&!(countdown!==null&&countdown>1)} onAnswer={midi=>addAnswer(midi,'touch')}/>}
        {!running&&canUseComputerKeyboard&&<div role="group" aria-label="מקלדת מחשב מוארת ושמות הצלילים" className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-slate-900">
          <p className="text-sm font-semibold">⌨️ מקלדת מחשב מוארת — עזר מקדים לפני האימון</p>
          <div dir="ltr" className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-1.5 mt-2">
            {options.map((midi,i)=><div key={midi} className="flex flex-col items-center gap-1 rounded-lg border border-sky-300 bg-white p-2 text-center text-sm">
              <kbd dir="ltr" className="font-bold">{RECALL_ENGLISH_KEYS[i]} / {RECALL_HEBREW_KEYS[i]}</kbd>
              <span dir="rtl" className="text-xs">{noteName(midi)}</span>
            </div>)}
          </div>
        </div>}
        {!running&&options.length>RECALL_ENGLISH_KEYS.length&&<p className="text-xs text-amber-800">מעל תשעה צלילים לא ניתן לנגן ממקלדת מחשב; השתמשי בכלי המסך, MIDI או במיקרופון.</p>}
      </section>}
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

/** Interpret browser speech as *names*, not octave-specific pitches.
 * Matching is confined to teacher-approved note names; when the same name
 * exists across octaves, a spoken name alone is sufficient, with the current
 * musical event resolving the register. This is NOT a speech-recognition engine.
 */
const PITCH_NAMES=['דו','דו♯','רה','רה♯','מי','פה','פה♯','סול','סול♯','לה','לה♯','סי'];
const OCTAVES:Record<number,string>={1:'תתגדול',2:'גדול',3:'קטן',4:'ראשון',5:'שני',6:'שלישי',7:'רביעי'};
const ORDINAL_ALIASES:Record<string,string>={ראשונה:'ראשון',שניה:'שני',שנייה:'שני',שלישית:'שלישי',רביעית:'רביעי'};
const NAME_ALIASES:Record<string,string>={
  דו:'דו',דוו:'דו',דואו:'דו',רה:'רה',ראה:'רה',ריי:'רה',רי:'רה',
  מי:'מי',פה:'פה',פא:'פה',סול:'סול',סוול:'סול',
  לה:'לה',לא:'לה',סי:'סי',סיי:'סי',
};
export function normalizedSpokenNoteTokens(text:string):string[]{
  return (text||'').normalize('NFKC')
    .replace(/[\u0591-\u05c7]/g,'')
    .replace(/[\u05f3\u05f4"׳״]/g,'')
    .replace(/[^א-ת0-9\s]/g,' ')
    .split(/\s+/).map(w=>w.trim()).filter(Boolean);
}
export function parseHebrewRecallNotes(
  transcript:string,allowed:readonly number[],
  expected:readonly number[]=[],alreadyAnswered:readonly number[]=[],
):number[]{
  const tokens=normalizedSpokenNoteTokens(transcript);
  const candidates=allowed.map(midi=>({
    midi,name:PITCH_NAMES[((midi%12)+12)%12],
    octave:OCTAVES[Math.floor(midi/12)-1]||'',
  }));
  const result:number[]=[];
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];
    const name=NAME_ALIASES[token];
    if(!name||((token==='לא'||token==='ראה')&&tokens.length>1))continue;
    const possible=candidates.filter(c=>c.name===name);
    if(!possible.length)continue;
    const next=ORDINAL_ALIASES[tokens[i+1]]||tokens[i+1];
    const explicit=Object.values(OCTAVES).includes(next);
    if(explicit){
      const specified=possible.find(c=>c.octave===next);
      if(specified)result.push(specified.midi);
      i++;
      continue;
    }
    const pending=expected.filter(midi=>!alreadyAnswered.includes(midi)&&!result.includes(midi));
    // Responding "דו" is sufficient even if both C4 and C5 are taught.
    const contextual=possible.find(c=>pending.includes(c.midi));
    result.push((contextual||possible[0]).midi);
  }
  return result;
}
/** Only commit an interim transcription when it is already an isolated,
 * unambiguous common musical syllable; later final reports must be deduped.
 */
export function fastInterimRecallNote(text:string):boolean{
  return /^(דו|רה|מי|פה|סול|לה|סי)$/.test(normalizedSpokenNoteTokens(text).join(' '));
}

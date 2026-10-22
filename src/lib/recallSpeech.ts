/** Parse Hebrew browser transcripts into only teacher-approved note names.
 * Keep whole-word boundaries (not substrings in unrelated Hebrew words), and
 * require an octave when the same note name occurs in more than one register.
 * No audio is stored or sent by this parser.
 */
const PITCH_NAMES=['דו','דו♯','רה','רה♯','מי','פה','פה♯','סול','סול♯','לה','לה♯','סי'];
const OCTAVES:Record<number,string>={1:'תתגדול',2:'גדול',3:'קטן',4:'ראשון',5:'שני',6:'שלישי',7:'רביעי'};
const ORDINAL_ALIASES:Record<string,string>={ראשונה:'ראשון',שניה:'שני',שנייה:'שני',שלישית:'שלישי',רביעית:'רביעי'};
export function normalizedSpokenNoteTokens(text:string):string[]{
  return (text||'').normalize('NFKC')
    .replace(/[\u0591-\u05c7]/g,'')
    .replace(/[\u05f3\u05f4"׳״']/g,'')
    .replace(/[^א-ת0-9\s]/g,' ')
    .split(/\s+/).map(w=>w.trim()).filter(Boolean);
}
export function parseHebrewRecallNotes(transcript:string, allowed:readonly number[]):number[]{
  const tokens=normalizedSpokenNoteTokens(transcript);
  const candidates=allowed.map(midi=>({
    midi,name:PITCH_NAMES[((midi%12)+12)%12],
    octave:OCTAVES[Math.floor(midi/12)-1]||'',
  }));
  const result:number[]=[];
  for(let i=0;i<tokens.length;i++){
    const name=tokens[i];
    const possible=candidates.filter(c=>c.name===name);
    if(!possible.length)continue;
    const next=ORDINAL_ALIASES[tokens[i+1]]||tokens[i+1];
    const specified=possible.find(c=>c.octave&&c.octave===next);
    if(specified){result.push(specified.midi);i++;continue;}
    if(possible.length===1&&!Object.values(OCTAVES).includes(next)&&!Object.keys(ORDINAL_ALIASES).includes(tokens[i+1])){
      result.push(possible[0].midi);
    }
  }
  return result;
}

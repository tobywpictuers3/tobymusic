import type { ReactNode } from 'react';
import type { RhythmEvent } from '@/lib/sightReadingPatterns';

export type ScoreNote = RhythmEvent & { step?: string; octave?: number; alter?: number };
const ORDER = ['C','D','E','F','G','A','B'];
const FONT = 'Georgia, "Times New Roman", serif';
const degree = (step?: string, octave?: number) =>
  (octave ?? 4) * 7 + Math.max(0, ORDER.indexOf(step ?? 'G'));
const accidental = (n: number) => n > 0 ? '♯' : n < 0 ? '♭' : '';
function Rest({ x, y, units }: { x:number;y:number;units:number }) {
  if (units === 8) return <g><rect x={x-8} y={y-1} width="16" height="4" fill="#171923"/><path d={`M ${x} ${y+2} v 13`} stroke="#171923" strokeWidth="2"/></g>;
  if (units === 4 || units === 6) return <g><path d={`M ${x+3} ${y-17} l-7 10 9 6 -8 9 8 5 -7 7`} stroke="#171923" strokeWidth="3" fill="none" strokeLinejoin="round"/>{units === 6 && <circle cx={x+12} cy={y-9} r="2" fill="#171923"/>}</g>;
  return <g><path d={`M ${x-2} ${y-15} q 10 -6 9 2 l-11 26`} fill="none" stroke="#171923" strokeWidth="2.8"/><ellipse cx={x+3} cy={y-12} rx="5" ry="3.8" transform={`rotate(-30 ${x+3} ${y-12})`} fill="#171923"/>{units === 1 && <ellipse cx={x+3} cy={y+1} rx="5" ry="3.8" transform={`rotate(-30 ${x+3} ${y+1})`} fill="#171923"/ >}{units===3 && <circle cx={x+13} cy={y-9} r="2" fill="#171923"/>}</g>;
}
function Notes({events,start,width,staffTop,clef,pattern}:{
  events:ScoreNote[];start:number;width:number;staffTop:number;clef:'G'|'F';pattern:boolean;
}) {
  const total=events.reduce((sum,e)=>sum+e.units,0);
  const onset:number[]=[]; let t=0;
  for(const e of events){onset.push(t);t+=e.units;}
  const xpos=(i:number)=>start+12 + (onset[i]+events[i].units/2)*((width-24)/total);
  const ypos=(n:ScoreNote)=>pattern ? staffTop+35 : staffTop+40-(degree(n.step,n.octave)-(clef==='G'?4*7+2:3*7+4))*5;
  const groups: number[][]=[]; let group:number[]=[];
  const flush=()=>{if(group.length){groups.push(group);group=[];}};
  events.forEach((n,i)=>{
    const boundary=i>0&&Math.floor(onset[i]/4)!==Math.floor(onset[i-1]/4);
    if(n.rest||n.units>2||boundary||(i>0&&n.sourceId!==events[i-1].sourceId)){flush();return;}
    group.push(i);
  }); flush();
  const grouped=new Set(groups.filter(g=>g.length>=2).flat());
  const shapes:ReactNode[]=[];
  events.forEach((n,i)=>{
    const x=xpos(i),y=ypos(n), stemX=x+6;
    if(n.rest){shapes.push(<Rest key={'r'+i} x={x} y={pattern?staffTop+30:staffTop+20} units={n.units}/>);return;}
    if(!pattern) for(let ledger=staffTop+50;ledger<=y+1;ledger+=10) {
      if(ledger>staffTop+40) shapes.push(<line key={`lo-${i}-${ledger}`} x1={x-11} x2={x+11} y1={ledger} y2={ledger} stroke="#151923" strokeWidth="1"/>);
    }
    if(!pattern) for(let ledger=staffTop-10;ledger>=y-1;ledger-=10) shapes.push(<line key={`hi-${i}-${ledger}`} x1={x-11} x2={x+11} y1={ledger} y2={ledger} stroke="#151923" strokeWidth="1"/>);
    if(n.alter) shapes.push(<text key={'acc'+i} x={x-15} y={y+5} fontFamily={FONT} fontSize="20" textAnchor="middle">{accidental(n.alter)}</text>);
    shapes.push(<ellipse key={'head'+i} cx={x} cy={y} rx="7.1" ry="4.8" transform={`rotate(-22 ${x} ${y})`} fill={n.units===8?'white':'#151923'} stroke="#151923" strokeWidth="1.5"/>);
    if(n.units!==8) shapes.push(<line key={'stem'+i} x1={stemX} x2={stemX} y1={y-1} y2={y-32} stroke="#151923" strokeWidth="1.7"/>);
    if(n.units===3||n.units===6) shapes.push(<circle key={'dot'+i} cx={x+13} cy={y-1} r="2" fill="#151923"/>);
    if(n.units<=2 && !grouped.has(i)) {
      shapes.push(<path key={'flag'+i} d={`M ${stemX} ${y-32} Q ${stemX+23} ${y-29} ${stemX+9} ${y-8}`} fill="none" stroke="#151923" strokeWidth="3"/>);
      if(n.units===1) shapes.push(<path key={'flag2'+i} d={`M ${stemX} ${y-25} Q ${stemX+23} ${y-22} ${stemX+9} ${y-1}`} fill="none" stroke="#151923" strokeWidth="2.6"/>);
    }
  });
  groups.filter(g=>g.length>=2).forEach((group,index)=>{
    const first=group[0],last=group[group.length-1];
    const x1=xpos(first)+6,x2=xpos(last)+6;
    const y1=ypos(events[first])-32,y2=ypos(events[last])-32;
    shapes.push(<line key={'beam'+index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#151923" strokeWidth="4.7"/>);
    // Secondary beams for contiguous pairs of sixteenth notes.
    for(let j=0;j<group.length-1;j++){
      const a=group[j],b=group[j+1];
      if(events[a].units!==1||events[b].units!==1)continue;
      const ratio=(xpos(b)-xpos(first))/(xpos(last)-xpos(first)||1);
      const yb=y1+(y2-y1)*ratio;
      const ratioA=(xpos(a)-xpos(first))/(xpos(last)-xpos(first)||1);
      const ya=y1+(y2-y1)*ratioA;
      shapes.push(<line key={'beam2-'+index+'-'+j} x1={xpos(a)+6} y1={ya+7} x2={xpos(b)+6} y2={yb+7} stroke="#151923" strokeWidth="3.3"/>);
    }
  });
  return <g>{shapes}</g>;
}
export function RhythmPreview({events}: {events:RhythmEvent[]}) {
  const notes:ScoreNote[]=events.map(e=>({...e,step:'G',octave:4}));
  return <svg viewBox="0 0 232 80" width="100%" height="80" role="img" aria-label="תבנית מקצב גרפית" style={{background:'#fff'}}><Notes events={notes} start={10} width={210} staffTop={0} clef="G" pattern /></svg>;
}
export function ScorePreview({lines,clef,beats,fifths,title,doubleBar}:{
  lines:ScoreNote[][][];clef:'G'|'F';beats:number;fifths:number;title:string;doubleBar:boolean;
}) {
  const count=lines[0]?.length||4;
  const barWidth=240;
  const start=135+Math.abs(fifths)*13;
  const width=start+count*barWidth+25;
  const height=16*118+80;
  const ybase=90;
  const signs=fifths>0?'♯':'♭';
  const keyY=(index:number)=>{
    const sharpG=[0,15,-5,10,25,5,20],flatG=[20,5,25,10,30,15,35];
    const sharpF=[10,25,5,20,35,15,30],flatF=[30,15,35,20,40,25,45];
    const arr=fifths>0?(clef==='G'?sharpG:sharpF):(clef==='G'?flatG:flatF);
    return arr[index]??20;
  };
  return <div dir="ltr" style={{overflowX:'auto',background:'#fff',color:'#171923',borderRadius:8,border:'1px solid #dde2ea',padding:8}}>
    <svg viewBox={`0 0 ${width} ${height}`} style={{minWidth:Math.min(width,750),width:'100%',height:'auto'}} role="img" aria-label="16 שורות תווים על חמשה">
      <text x={width/2} y="38" fontSize="25" fontFamily={FONT} textAnchor="middle" direction="rtl">{title}</text>
      {lines.map((row,ri)=>{
        const y=ybase+ri*118;
        return <g key={ri}>
          {[0,1,2,3,4].map(i=><line key={i} x1="16" x2={width-22} y1={y+i*10} y2={y+i*10} stroke="#151923" strokeWidth="1"/> )}
          <text x="21" y={clef==='G'?y+44:y+32} fontSize={clef==='G'?65:52} fontFamily={FONT}>{clef==='G'?'𝄞':'𝄢'}</text>
          {Array.from({length:Math.abs(fifths)},(_,i)=><text key={i} x={69+i*13} y={y+keyY(i)+6} fontFamily={FONT} fontSize="22">{signs}</text>)}
          <text x={start-24} y={y+19} fontSize="22" fontWeight="bold" textAnchor="middle" fontFamily={FONT}>{beats}</text>
          <text x={start-24} y={y+39} fontSize="22" fontWeight="bold" textAnchor="middle" fontFamily={FONT}>4</text>
          {row.map((bar,bi)=><g key={bi}>
            <Notes events={bar} start={start+bi*barWidth} width={barWidth} staffTop={y} clef={clef} pattern={false}/>
            <line x1={start+(bi+1)*barWidth} x2={start+(bi+1)*barWidth} y1={y} y2={y+40} stroke="#151923" strokeWidth={bi===count-1&&doubleBar?2.3:1}/>
            {bi===count-1&&doubleBar&&<line x1={start+(bi+1)*barWidth-6} x2={start+(bi+1)*barWidth-6} y1={y} y2={y+40} stroke="#151923" strokeWidth="1"/>}
          </g>)}
        </g>;
      })}
    </svg>
  </div>;
}

/** Lightweight monophonic pitch estimator: no recording or network upload.
 * Intended only for an interactive beta on microphone-supported browsers.
 */
export function detectRecallPitch(samples:Float32Array,sampleRate:number):number|null {
  if(!(sampleRate>0)||samples.length<1024)return null;
  let energy=0;
  for(let i=0;i<samples.length;i++)energy+=samples[i]*samples[i];
  if(Math.sqrt(energy/samples.length)<0.025)return null;
  const minimum=Math.max(1,Math.floor(sampleRate/1000));
  const maximum=Math.min(Math.floor(sampleRate/78),Math.floor(samples.length/2));
  let bestLag=-1,best=-Infinity;
  const length=samples.length;
  for(let lag=minimum;lag<=maximum;lag++){
    let cross=0,a=0,b=0;
    for(let i=0;i<length-lag;i+=2){
      const x=samples[i],y=samples[i+lag];
      cross+=x*y;a+=x*x;b+=y*y;
    }
    const correlation=cross/(Math.sqrt(a*b)+1e-12);
    if(correlation>best){best=correlation;bestLag=lag;}
  }
  if(bestLag<0||best<0.86)return null;
  const hz=sampleRate/bestLag;
  const midi=Math.round(69+12*Math.log2(hz/440));
  return midi>=36&&midi<=84?midi:null;
}

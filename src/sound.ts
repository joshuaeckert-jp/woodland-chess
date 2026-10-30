import type { PieceSymbol } from 'chess.js'

/** Small, optional synthesized foley. No downloads, microphone, or autoplay. */
export class GameSound {
  private context?: AudioContext
  private enabled=false
  private active=new Set<AudioScheduledSourceNode>()
  setEnabled(value:boolean){
    this.enabled=value
    if(!value){this.stop();return}
    try{this.context??=new AudioContext();void this.context.resume().catch(()=>{})}catch{this.enabled=false}
  }
  stop(){for(const source of this.active){try{source.stop()}catch{}}this.active.clear()}
  attack(type:PieceSymbol){
    if(!this.enabled||!this.context)return
    const t=this.context.currentTime
    if(type==='k'){this.noise(t,.36,220,.10);this.tone(t,.32,100,55,.035)}
    if(type==='q'){this.noise(t,.12,2700,.06);this.noise(t+.10,.13,2200,.05)}
    if(type==='p'){this.noise(t,.15,3800,.035);this.tone(t,.13,600,180,.025)}
    if(type==='r'){this.noise(t,.28,650,.045);this.tone(t+.18,.12,150,70,.055)}
    if(type==='b'){this.noise(t,.13,1000,.05);this.noise(t+.14,.13,800,.05);this.tone(t+.28,.09,180,80,.035)}
    if(type==='n'){this.tone(t,.12,260,110,.045);this.noise(t+.08,.09,1400,.035)}
  }
  win(){if(!this.enabled||!this.context)return;const t=this.context.currentTime;[392,494,587,784].forEach((hz,i)=>this.tone(t+i*.11,.3,hz,hz,.035))}
  private track(source:AudioScheduledSourceNode){this.active.add(source);source.onended=()=>{this.active.delete(source);source.disconnect()}}
  private envelope(t:number,duration:number,volume:number){const c=this.context!,g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+duration);g.connect(c.destination);return g}
  private tone(t:number,d:number,from:number,to:number,v:number){const c=this.context!,o=c.createOscillator(),g=this.envelope(t,d,v);o.type='triangle';o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+d);o.connect(g);this.track(o);o.start(t);o.stop(t+d+.02);o.addEventListener('ended',()=>g.disconnect())}
  private noise(t:number,d:number,hz:number,v:number){const c=this.context!,b=c.createBuffer(1,Math.ceil(c.sampleRate*d),c.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;const s=c.createBufferSource(),filter=c.createBiquadFilter(),gain=this.envelope(t,d,v);filter.type='lowpass';filter.frequency.value=hz;s.buffer=b;s.connect(filter);filter.connect(gain);this.track(s);s.start(t);s.stop(t+d+.02);s.addEventListener('ended',()=>{filter.disconnect();gain.disconnect()})}
}

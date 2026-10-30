import {SPELL_TRAVEL_MS,SPELL_SURROUND_MS} from './spell-timing'
export type CardMistOrigin = {
 x:number
 y:number
 width:number
 height:number
 castPoint?:{x:number;y:number}
}

type Point={x:number;y:number}
type MistStage='drag'|'travel'|'surround'|'return'
type Transition={
 stage:Exclude<MistStage,'drag'>
 startedAt:number
 duration:number
 target:CardMistOrigin
 from:Point
 resolve:()=>void
}

/**
 * Purely visual drag feedback for an altar card. It deliberately owns neither
 * pointer listeners nor game state; callers update it from their drag lifecycle.
 */
export class CardMist {
 private canvas:HTMLCanvasElement|null=null
 private ctx:CanvasRenderingContext2D|null=null
 private origin:CardMistOrigin|null=null
 private point:Point|null=null
 private color='#7ca7ca'
 private valid=false
 private raf=0
 private startAt=0
 private lastDrawAt=0
 private stage:MistStage='drag'
 private transition:Transition|null=null

 start(origin:CardMistOrigin,color:string):void {
  this.cancel()
  this.origin={x:origin.x,y:origin.y,width:origin.width,height:origin.height,castPoint:origin.castPoint&&{...origin.castPoint}}
  this.point=origin.castPoint??this.center(origin)
  this.color=color||'#7ca7ca'
  this.valid=false
  this.startAt=performance.now()
  this.lastDrawAt=0
  const canvas=document.createElement('canvas')
  canvas.className='cm-card-mist'
  canvas.setAttribute('aria-hidden','true')
  Object.assign(canvas.style,{position:'fixed',inset:'0',zIndex:'20',width:'100vw',height:'100vh',pointerEvents:'none',imageRendering:'pixelated'})
  document.body.append(canvas)
  this.canvas=canvas
  this.ctx=canvas.getContext('2d')
  this.setStage('drag')
  this.resize()
  this.draw(this.startAt)
  document.addEventListener('visibilitychange',this.onVisibilityChange)
  window.addEventListener('resize',this.onResize)
  if(!this.staticPresentation())this.raf=requestAnimationFrame(this.tick)
 }

 move(x:number,y:number,valid:boolean):void {
  if(!this.origin||this.transition)return
  this.point={x,y}
  this.valid=valid
  const now=performance.now()
  if(this.staticPresentation()||now-this.lastDrawAt>=1000/30)this.draw(now)
  if(!this.staticPresentation())this.ensureTick()
 }

 release(target:CardMistOrigin):Promise<void> {
  if(!this.origin||!this.point||this.transition)return Promise.resolve()
  if(this.staticPresentation()){
   this.cancel()
   return Promise.resolve()
  }
  const from={...this.point}
  const destination={x:target.x,y:target.y,width:target.width,height:target.height}
  return new Promise(resolve=>{
   this.transition={stage:'travel',startedAt:performance.now(),duration:SPELL_TRAVEL_MS,target:destination,from,resolve}
   this.setStage('travel')
   this.ensureTick()
  })
 }

 retract():Promise<void> {
  if(!this.origin||!this.point||this.transition)return Promise.resolve()
  if(this.staticPresentation()){
   this.cancel()
   return Promise.resolve()
  }
  const from={...this.point}
  const destination={...this.origin}
  return new Promise(resolve=>{
   this.transition={stage:'return',startedAt:performance.now(),duration:250,target:destination,from,resolve}
   this.setStage('return')
   this.ensureTick()
  })
 }

 cancel():void {
  if(this.raf)cancelAnimationFrame(this.raf)
  this.raf=0
  const pending=this.transition
  this.transition=null
  pending?.resolve()
  document.removeEventListener('visibilitychange',this.onVisibilityChange)
  window.removeEventListener('resize',this.onResize)
  this.canvas?.remove()
  this.canvas=null
  this.ctx=null
  this.origin=null
  this.point=null
 }

 private readonly onVisibilityChange=()=>{
  if(document.hidden)this.cancel()
 }

 private readonly onResize=()=>{
  this.resize()
  this.draw(performance.now())
 }

 private readonly tick=(time:number)=>{
  this.raf=0
  if(!this.canvas||!this.origin||!this.point)return
  if(this.staticPresentation()){
   if(this.transition)this.cancel()
   else this.draw(time)
   return
  }
  if(time-this.lastDrawAt>=1000/30||this.transition)this.draw(time)
  if(this.canvas)this.raf=requestAnimationFrame(this.tick)
 }

 private ensureTick():void {
  if(!this.raf&&!this.staticPresentation())this.raf=requestAnimationFrame(this.tick)
 }

 private staticPresentation():boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.dataset.ambient==='off'
 }

 private setStage(stage:MistStage):void {
  if(this.stage===stage){
   if(this.canvas)this.canvas.dataset.stage=stage
   return
  }
  this.stage=stage
  if(this.canvas)this.canvas.dataset.stage=stage
 }

 private resize():void {
  const canvas=this.canvas,ctx=this.ctx
  if(!canvas||!ctx)return
  const dpr=Math.min(2,window.devicePixelRatio||1)
  canvas.width=Math.max(1,Math.round(innerWidth*dpr))
  canvas.height=Math.max(1,Math.round(innerHeight*dpr))
  ctx.setTransform(dpr,0,0,dpr,0,0)
 }

 private draw(time:number):void {
  const ctx=this.ctx,canvas=this.canvas,origin=this.origin,point=this.point
  if(!ctx||!canvas||!origin||!point)return
  const dpr=Math.min(2,window.devicePixelRatio||1)
  if(canvas.width!==Math.round(innerWidth*dpr)||canvas.height!==Math.round(innerHeight*dpr))this.resize()
  this.lastDrawAt=time
  ctx.clearRect(0,0,innerWidth,innerHeight)
  const from=this.center(origin)
  const transition=this.transition
  const elapsed=transition?Math.min(1,(time-transition.startedAt)/transition.duration):0
  const eased=this.ease(elapsed)
  let to=point
  let streamFrom=from
  let streamProgress=0
  let alpha=1
  if(transition?.stage==='travel'){
   const destination=this.center(transition.target)
   to=destination
   streamFrom=this.mix(from,destination,eased*.82)
   streamProgress=elapsed
  }
  if(transition?.stage==='return'){
   to=this.mix(transition.from,this.center(origin),eased)
   alpha=1-eased*.88
  }
  const dragColor=this.valid?this.color:'#78838c'
  const palette=this.valid?this.palette(dragColor):['#617da7','#82749f','#91a9be']
  const pulse=this.staticPresentation()?0:Math.sin((time-this.startAt)/190)

  if(transition?.stage==='surround'){
   this.drawSurround(ctx,transition.target,palette,time,elapsed)
  }else{
   const sourceAlpha=transition?.stage==='travel' ? 1-eased : transition?.stage==='return' ? .2+eased*.8 : 1
   this.drawSourceCloud(ctx,from,palette,time,sourceAlpha)
   this.drawStream(ctx,streamFrom,to,palette,time,alpha,streamProgress)
   this.drawCursorBloom(ctx,to,palette,alpha,pulse)
  }

  if(!transition||elapsed<1)return
  if(transition.stage==='travel'){
   this.transition={...transition,stage:'surround',startedAt:time,duration:SPELL_SURROUND_MS,from:this.center(transition.target)}
   this.setStage('surround')
   return
  }
  const resolve=transition.resolve
  this.transition=null
  this.cancel()
  resolve()
 }

 private drawSourceCloud(ctx:CanvasRenderingContext2D,at:Point,palette:string[],time:number,alpha:number):void {
  const size=Math.max(28,Math.min(55,Math.max(this.origin?.width??28,this.origin?.height??28)*.78))
  for(let i=0;i<18;i++){
   const angle=this.hash(i,11)*Math.PI*2+(time-this.startAt)/1700*(i%2?1:-1)
   const radius=size*(.18+this.hash(i,23)*.55)
   const x=at.x+Math.cos(angle)*radius
   const y=at.y+Math.sin(angle)*radius*.62
   const broad=6+(i%4)*2
   this.drawPuff(ctx,x,y,broad,palette[i%palette.length],alpha*(i%3===0?.3:.2))
   if(i%2===0){
    const spark=i%5===0?4:2
    ctx.globalAlpha=alpha*.68
    ctx.fillStyle=palette[(i+1)%palette.length]
    ctx.fillRect(Math.round(x-spark/2),Math.round(y-spark/2),spark,spark)
   }
  }
 }

 private drawStream(ctx:CanvasRenderingContext2D,from:Point,to:Point,palette:string[],time:number,alpha:number,travelProgress:number):void {
  const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)
  if(length<5)return
  const nx=-dy/length,ny=dx/length
  const bend=Math.min(66,Math.max(18,length*.18))
  for(let ribbon=0;ribbon<4;ribbon++){
   const side=ribbon%2?1:-1
   const drift=(this.hash(ribbon,43)-.5)*16+Math.sin((time-this.startAt)/650+ribbon)*12
   const control={x:from.x+dx*.47+nx*(bend*side+drift),y:from.y+dy*.42+ny*(bend*side+drift)}
   ctx.globalAlpha=alpha*(.035+ribbon*.018)
   ctx.strokeStyle=palette[ribbon%palette.length]
   ctx.lineWidth=32-ribbon*5
   ctx.lineCap='square'
   ctx.beginPath()
   ctx.moveTo(from.x,from.y)
   ctx.quadraticCurveTo(control.x,control.y,to.x,to.y)
   ctx.stroke()
   const count=Math.min(24,Math.max(8,Math.ceil(length/24)))
   for(let i=0;i<count;i++){
    const base=(i+.25)/count
    const flow=((time-this.startAt)/1050*(.7+ribbon*.08))%1
    const t=travelProgress>0
     ?Math.min(1,base+travelProgress*.78+flow*.28)
     :(base+flow)%1
    if(t>=1)continue
    const wobble=Math.sin((time-this.startAt)/180+i*1.7+ribbon)*((ribbon+1)*1.7)
    const position=this.quadratic(from,control,to,t)
    const x=position.x+nx*wobble
    const y=position.y+ny*wobble
    const broad=8+this.hash(i+ribbon*24,61)*7
    this.drawPuff(ctx,x,y,broad,palette[ribbon%palette.length],alpha*(.15+this.hash(i,63)*.12))
    if((i+ribbon)%3===0){
     ctx.globalAlpha=alpha*(.5+t*.35)
     ctx.fillStyle=palette[(ribbon+1)%palette.length]
     ctx.fillRect(Math.round(x-1.5),Math.round(y-1.5),3,3)
    }
   }
  }
 }

 private drawCursorBloom(ctx:CanvasRenderingContext2D,at:Point,palette:string[],alpha:number,pulse:number):void {
  const radius=16+(pulse+1)*3
  for(let i=0;i<10;i++){
   const angle=i*Math.PI*2/10
   const distance=radius+(i%3)*4
   const x=at.x+Math.cos(angle)*distance
   const y=at.y+Math.sin(angle)*distance
   const size=i%3===0?5:3
   ctx.globalAlpha=alpha*(i%2?.34:.7)
   ctx.fillStyle=palette[i%palette.length]
   ctx.fillRect(Math.round(x-size/2),Math.round(y-size/2),size,size)
  }
  ctx.globalAlpha=alpha*.64
  ctx.strokeStyle=palette[0]
  ctx.lineWidth=2
  ctx.strokeRect(Math.round(at.x-radius*.62),Math.round(at.y-radius*.62),Math.round(radius*1.24),Math.round(radius*1.24))
  ctx.globalAlpha=alpha*.9
  ctx.fillStyle=palette[1]
  ctx.fillRect(Math.round(at.x-2),Math.round(at.y-2),4,4)
 }

 private drawSurround(ctx:CanvasRenderingContext2D,target:CardMistOrigin,palette:string[],time:number,elapsed:number):void {
  const center=this.center(target);center.y-=target.height*.16
  const radius=Math.max(20,Math.min(78,Math.max(target.width,target.height)*.48))
  const fade=1-elapsed
  for(let i=0;i<34;i++){
   const angle=i*Math.PI*2/34+(time-this.startAt)/360*(i%2?1:-1)
   const orbit=radius*(.7+this.hash(i,71)*.35)
   const x=center.x+Math.cos(angle)*orbit
   const y=center.y+Math.sin(angle)*orbit*.85
   const broad=5+i%5
   this.drawPuff(ctx,x,y,broad,palette[i%palette.length],fade*(i%3===0?.32:.2))
   if(i%3===0){
    ctx.globalAlpha=fade*.62
    ctx.fillStyle=palette[(i+1)%palette.length]
    ctx.fillRect(Math.round(x-1.5),Math.round(y-1.5),3,3)
   }
  }
  for(let i=0;i<12;i++){
   const angle=i*Math.PI*2/12+(time-this.startAt)/520
   const ring=radius*(.9+Math.sin((time-this.startAt)/190+i)*.08)
   const x=center.x+Math.cos(angle)*ring
   const y=center.y+Math.sin(angle)*ring*.85
   ctx.globalAlpha=fade*.34
   ctx.fillStyle=palette[0]
   ctx.fillRect(Math.round(x-4),Math.round(y-1),8,2)
  }
 }

 private drawPuff(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,color:string,alpha:number):void{
  ctx.fillStyle=color
  ctx.globalAlpha=alpha*.3;ctx.fillRect(Math.round(x-size),Math.round(y-size*.3),Math.round(size*2),Math.max(2,Math.round(size*.6)))
  ctx.globalAlpha=alpha*.55;ctx.fillRect(Math.round(x-size*.65),Math.round(y-size*.5),Math.round(size*1.3),Math.max(2,Math.round(size)))
  ctx.globalAlpha=alpha;ctx.fillRect(Math.round(x-size*.35),Math.round(y-size*.28),Math.max(2,Math.round(size*.7)),Math.max(2,Math.round(size*.56)))
 }
 private center(origin:CardMistOrigin):Point{return{x:origin.x+origin.width/2,y:origin.y+origin.height/2}}
 private mix(a:Point,b:Point,t:number):Point{return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}}
 private quadratic(a:Point,b:Point,c:Point,t:number):Point{
  const inverse=1-t
  return{x:inverse*inverse*a.x+2*inverse*t*b.x+t*t*c.x,y:inverse*inverse*a.y+2*inverse*t*b.y+t*t*c.y}
 }
 private ease(t:number):number{return 1-(1-t)*(1-t)*(1-t)}
 private hash(index:number,salt:number):number{
  let value=(index+1)*374761393+salt*668265263
  value=(value^(value>>>13))*1274126177
  return ((value^(value>>>16))>>>0)/4294967295
 }
 private palette(base:string):string[]{return['#78caff','#ad83ff','#a1e8ff',base]}
}

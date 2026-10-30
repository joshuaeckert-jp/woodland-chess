/** Screen-space card surface; the board owns the habitat and animal beneath it. */
export interface DeploymentOrigin { x:number; y:number; width:number; height:number; /** Release cursor in client coordinates, for effect-card presentation only. */ castPoint?:{x:number;y:number} }
export class DeploymentCardFlight {
 private element:HTMLElement|null=null
 private animation:Animation|null=null
 start(html:string,from:DeploymentOrigin,to:{x:number;y:number;width:number},duration:number):void {
  this.cancel()
  const element=document.createElement('div')
  element.className='cm-deployment-card'
  element.setAttribute('aria-hidden','true')
  element.innerHTML=html
  Object.assign(element.style,{left:`${from.x}px`,top:`${from.y}px`,width:`${from.width}px`,height:`${from.height}px`})
  element.style.setProperty('--flight-card-scale',String(from.width/128))
  document.body.append(element);this.element=element
  const dx=to.x-(from.x+from.width/2),dy=to.y-(from.y+from.height/2),scale=to.width/from.width
  const pose=(x:number,y:number,s:number,angle:number)=>`translate(${x}px,${y}px) perspective(600px) rotateX(${angle}deg) scale(${s})`
  this.animation=element.animate([
   {transform:pose(0,0,1,0),opacity:1,offset:0},
   {transform:pose(dx,dy-10,scale*1.07,24),opacity:1,offset:.44},
   {transform:pose(dx,dy,scale,62),opacity:.85,offset:.72},
   {transform:pose(dx,dy,scale,68),opacity:0,offset:1},
  ],{duration:duration*.60,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'})
  const current=this.animation
  void current.finished.catch(()=>undefined).then(()=>{if(this.animation===current)this.cancel()})
 }
 cancel():void { const animation=this.animation;this.animation=null;animation?.cancel();this.element?.remove();this.element=null }
}

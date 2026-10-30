import type { DeploymentOrigin } from './deployment-card'
import { CardMist } from './card-mist'
import {SPELL_DISSOLVE_MS} from './spell-timing'

export type EffectCardCue = {
  kind:'install'|'burn'|'order'
  html:string
  from:DeploymentOrigin
  to?:DeploymentOrigin
  cardId:string
  effect?:string
  targetSquare?:string
  sourceSquare?:string
}

/** A screen-space companion to the canvas effects. It never owns game state. */
export class EffectCardMotion {
  private element:HTMLElement|null=null
  private animation:Animation|null=null
  private landed:HTMLElement|null=null
  private mist=new CardMist()

  start(cue:EffectCardCue):Promise<void> {
    this.cancel()
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve()
    const element=document.createElement('div')
    element.className=`cm-effect-card-flight cm-effect-card-flight--${cue.kind}`
    element.setAttribute('aria-hidden','true')
    element.innerHTML=cue.html
    Object.assign(element.style,{position:'fixed',zIndex:'20',pointerEvents:'none',left:`${cue.from.x}px`,top:`${cue.from.y}px`,width:`${cue.from.width}px`,height:`${cue.from.height}px`,transformOrigin:'center center',filter:'drop-shadow(0 5px 0 #111a)'})
    element.style.setProperty('--flight-card-scale',String(cue.from.width/128))
    document.body.append(element)
    this.element=element
    const target=cue.to
    if ((cue.kind==='install'||cue.kind==='order')&&(target||cue.kind==='order')) {
      this.landed=document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cue.cardId)}"]`)
      this.landed?.classList.add('cm-card-arriving')
    }
    if (cue.kind==='install'&&target) {
      const dx=target.x+target.width/2-(cue.from.x+cue.from.width/2),dy=target.y+target.height/2-(cue.from.y+cue.from.height/2),scale=Math.min(1,target.width/cue.from.width)
      this.animation=element.animate([
        {transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1},
        {transform:`translate(${dx*.72}px,${dy*.72-10}px) rotate(-3deg) scale(${scale*1.08})`,opacity:1,offset:.7},
        {transform:`translate(${dx}px,${dy}px) rotate(0deg) scale(${scale})`,opacity:0,offset:1},
      ],{duration:620,easing:'cubic-bezier(.18,.8,.32,1)',fill:'forwards'})
    } else if (cue.kind==='burn') {
      const target=cue.targetSquare?document.querySelector<HTMLElement>(`[data-square="${CSS.escape(cue.targetSquare)}"]`)?.getBoundingClientRect():null
      const destination=target?{x:target.x,y:target.y,width:target.width,height:target.height}:{x:cue.from.x,y:cue.from.y-40,width:cue.from.width,height:cue.from.height}
      this.mist.start(cue.from,'#8d9eff')
      const release=cue.from.castPoint??{x:cue.from.x+cue.from.width/2,y:cue.from.y+cue.from.height/2}
      this.mist.move(release.x,release.y,true)
      const mistScene=this.mist.release(destination)
      if(cue.from.castPoint)element.style.visibility='hidden' // The dragged relic has already evaporated.
      this.animation=element.animate([
        {opacity:1,filter:'brightness(1.1)',clipPath:'polygon(0 0,100% 0,100% 100%,0 100%)'},
        {opacity:.5,filter:'brightness(1.5) blur(1px)',clipPath:'polygon(0 0,100% 0,100% 60%,80% 60%,80% 82%,50% 82%,50% 100%,0 100%)',offset:.5},
        {opacity:0,filter:'brightness(1.6) blur(3px)',clipPath:'polygon(14% 0,86% 0,86% 22%,60% 22%,60% 40%,28% 40%,28% 22%,14% 22%)'},
      ],{duration:SPELL_DISSOLVE_MS,easing:'ease-out',fill:'forwards'})
      const active=this.animation
      return Promise.all([active.finished.catch(()=>undefined),mistScene]).then(()=>{if(this.animation===active)this.cancel()})
    } else {
      if(this.landed){element.innerHTML=this.landed.outerHTML;element.firstElementChild?.classList.remove('cm-card-arriving')}
      this.animation=element.animate([
        {transform:'translateY(0) scale(1)',opacity:1},
        {transform:'translateY(2px) scale(.98)',opacity:.5},
      ],{duration:260,easing:'ease-out',fill:'forwards'})
    }
    const active=this.animation
    return active.finished.catch(()=>undefined).then(()=>{if(this.animation===active)this.cancel()})
  }

  cancel():void {
    const animation=this.animation
    this.animation=null
    animation?.cancel()
    this.mist.cancel()
    this.element?.remove()
    this.element=null
    this.landed?.classList.remove('cm-card-arriving')
    this.landed=null
  }
}

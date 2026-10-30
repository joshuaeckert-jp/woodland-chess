import { renderEffectCard } from './cards'
import { CardMist } from './card-mist'
import type {DeploymentOrigin} from './deployment-card'
import type { CardRef } from './types'

export interface CardDragOptions {
 enabled:()=>boolean
 revision:()=>number
 card:(id:string)=>CardRef|undefined
 target:(x:number,y:number,id?:string)=>HTMLElement|null
 play:(id:string,target?:HTMLElement,origin?:DeploymentOrigin)=>void
 reject:()=>void
 render?:(id:string)=>string
 caption?:(id:string,target?:HTMLElement|null)=>string
 canDrag?:(id:string,zone:string)=>boolean
 start?:(id:string,zone?:string)=>void
 end?:()=>void
}
/** Pointer-only visual state. The rules engine is mutated only by a valid release. */
export class CardDrag {
 private active:{id:string;zone:string;pointer:number;x:number;y:number;lastX:number;lastY:number;revision:number;element:HTMLElement;dragging:boolean}|null=null
 private ghost:HTMLElement|null=null
 private mist=new CardMist()
 private mistCaption:HTMLElement|null=null
 private focusUntil=0
 get isPressed(){return this.active!==null||performance.now()<this.focusUntil}
 private target:HTMLElement|null=null
 private clickUntil=0
 private suppressedId=''
 private suppressedZone=''
 private releaseUntil=0
 private releaseTarget:HTMLElement|null=null
 constructor(private options:CardDragOptions){
  document.addEventListener('pointerdown',this.down)
  document.addEventListener('dragstart',event=>{if((event.target as HTMLElement).closest('[data-card-id]'))event.preventDefault()})
  document.addEventListener('pointermove',this.move,{passive:false})
  document.addEventListener('pointerup',this.up)
  document.addEventListener('pointercancel',this.cancelEvent)
  document.addEventListener('keydown',this.key)
  window.addEventListener('resize',this.cancelEvent)
  document.addEventListener('visibilitychange',this.visibility)
 }
 suppressClick(event:MouseEvent){
  if(event.detail===0)return false
  const now=performance.now(), target=event.target as HTMLElement, card=target.closest<HTMLElement>('[data-card-id]')
  if(now<this.clickUntil&&card?.dataset.cardId===this.suppressedId&&(card.dataset.zone??'support')===this.suppressedZone){this.clickUntil=0;return true}
  if(now<this.releaseUntil&&this.releaseTarget&&(target===this.releaseTarget||this.releaseTarget.contains(target))){this.releaseUntil=0;this.releaseTarget=null;return true}
  return false
 }
 cancel=()=>{this.clearDrag();this.mist.cancel()}
 private retract=()=>{const source=this.active?.zone==='support'?this.active.element:null;this.clearDrag();source?.classList.add('cm-mist-returning');void this.mist.retract().finally(()=>source?.classList.remove('cm-mist-returning'))}
 private clearDrag=()=>{
  const active=this.active;this.active=null
  if(active)this.focusUntil=performance.now()+120
  if(active?.dragging){this.clickUntil=performance.now()+350;this.suppressedId=active.id;this.suppressedZone=active.zone;this.options.end?.()}
  if(active?.element.hasPointerCapture(active.pointer))active.element.releasePointerCapture(active.pointer)
  active?.element.classList.remove('cm-drag-source','cm-mist-source')
  this.mistCaption?.remove();this.mistCaption=null
  this.ghost?.remove();this.ghost=null;this.target?.classList.remove('cm-drop-active');this.target=null
  document.body.classList.remove('cm-dragging')
 }
 private cancelEvent=()=>this.cancel()
 private visibility=()=>{if(document.hidden)this.cancel()}
 private key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&this.active){event.preventDefault();this.retract()}}
 private down=(event:PointerEvent)=>{
  if(event.button!==0||this.active||!this.options.enabled()||document.querySelector('dialog[open]'))return
  const hit=event.target as HTMLElement
  const element=hit.closest<HTMLElement>('#cm-hand [data-card-id], .cm-support-slot [data-card-id], #cm-card-view [data-card-id]')??hit.closest('.cm-support-slot')?.querySelector<HTMLElement>('[data-card-id]')
  if(!element)return
  const id=element.dataset.cardId!,zone=element.dataset.zone??'support'
  if(this.options.canDrag?.(id,zone)===false)return
  if(event.pointerType==='mouse')event.preventDefault()
  this.active={id,zone,pointer:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,revision:this.options.revision(),element,dragging:false}
 }
 private move=(event:PointerEvent)=>{
  const active=this.active;if(!active||active.pointer!==event.pointerId)return
  if(active.revision!==this.options.revision()||!this.options.enabled()){this.cancel();return}
  active.lastX=event.clientX;active.lastY=event.clientY
  const dx=event.clientX-active.x,dy=event.clientY-active.y
  if(!active.dragging){
   const threshold=active.zone==='support'||event.pointerType==='mouse'?Math.hypot(dx,dy)>8:dy < -10 || Math.abs(dy)>12&&Math.abs(dx)<Math.abs(dy)
   if(!threshold)return
   const card=this.options.card(active.id);if(!card){this.cancel();return}
   active.dragging=true;active.element.setPointerCapture(active.pointer)
   document.body.classList.add('cm-dragging');this.options.start?.(active.id,active.zone)
   if(active.element.isConnected&&!active.element.hasPointerCapture(active.pointer))active.element.setPointerCapture(active.pointer)
   if(active.zone==='support'){
    active.element.classList.add('cm-mist-source')
    this.mist.start((active.element.querySelector<HTMLElement>('.tcg-card__art')??active.element).getBoundingClientRect(),getComputedStyle(active.element).getPropertyValue('--tcg-accent').trim()||'#89b8cf')
    this.mistCaption=document.createElement('span');this.mistCaption.className='cm-mist-caption';document.body.append(this.mistCaption)
   }else{
    active.element.classList.add('cm-drag-source')
    this.ghost=document.createElement('div');this.ghost.className='cm-card-ghost';this.ghost.setAttribute('aria-hidden','true');this.ghost.innerHTML=this.options.render?.(active.id)??renderEffectCard(card,{zone:'hand',state:'ready'});const caption=document.createElement('span');caption.className='cm-drop-caption';caption.textContent=this.options.caption?.(active.id)??'Install in support · one action';this.ghost.append(caption);document.body.append(this.ghost)
   }
  }
  event.preventDefault()
  if(this.ghost){this.ghost.style.left=`${event.clientX}px`;this.ghost.style.top=`${event.clientY}px`}
  this.target?.classList.remove('cm-drop-active');this.target=this.options.target(event.clientX,event.clientY,active.id);this.target?.classList.add('cm-drop-active')
  this.ghost?.classList.toggle('cm-ghost-valid',Boolean(this.target))
  if(active.zone==='support'){this.mist.move(event.clientX,event.clientY,Boolean(this.target));if(this.mistCaption){this.mistCaption.textContent=this.options.caption?.(active.id,this.target)??'Release on a valid target';this.mistCaption.style.left=`${Math.max(8,Math.min(innerWidth-248,event.clientX+18))}px`;this.mistCaption.style.top=`${Math.max(8,Math.min(innerHeight-60,event.clientY+20))}px`;this.mistCaption.dataset.valid=String(Boolean(this.target))}}
 }
 private up=(event:PointerEvent)=>{
  const active=this.active;if(!active||active.pointer!==event.pointerId)return
  if(!active.dragging){this.focusUntil=performance.now()+120;this.active=null;return}
  const releasePoint=event.clientX===0&&event.clientY===0?{x:active.lastX,y:active.lastY}:{x:event.clientX,y:event.clientY}
  const target=active.revision===this.options.revision()&&this.options.enabled()?this.options.target(releasePoint.x,releasePoint.y,active.id):null
  const rect=active.zone==='support'?(active.element.querySelector<HTMLElement>('.tcg-card__art')??active.element).getBoundingClientRect():this.ghost?.querySelector('.tcg-card')?.getBoundingClientRect()
  const origin:DeploymentOrigin|undefined=rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height,...(active.zone==='support'?{castPoint:releasePoint}:{})}:undefined
  const id=active.id
  this.releaseTarget=(document.elementFromPoint(releasePoint.x,releasePoint.y) as HTMLElement|null)??target
  this.releaseUntil=performance.now()+350
  if(target){this.cancel();this.options.play(id,target,origin)}else{this.retract();this.options.reject()}
 }
}

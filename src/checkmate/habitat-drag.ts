import type { Action } from './types'

export type ClientPoint = { x:number; y:number }
type RectLike = { left:number; top:number; width:number; height:number }

export interface HabitatDragOptions {
 enabled:()=>boolean
 revision:()=>number
 /** Resolve the friendly habitat being picked up for the prepared order. */
 source:(event:PointerEvent)=>HTMLElement|null
 /** Resolve a legal order at the unmodified client pointer coordinate. */
 target:(x:number,y:number)=>Action|null
 label:(action:Action|null)=>string
 update:(point:ClientPoint,action:Action|null)=>void
 clear:()=>void
 commit:(action:Action)=>void
}

/** Keeps the habitat centered under the pointer at the same grab offset as the source. */
export function habitatDragPoint(rect:RectLike, grab:ClientPoint, pointer:ClientPoint):ClientPoint {
 return { x:pointer.x-grab.x+rect.width/2, y:pointer.y-grab.y+rect.height/2 }
}

/**
 * Pointer-only direct manipulation for an already ordered unit. It never applies
 * game state itself: a valid pointer release calls `commit` exactly once. The
 * commit owner must choose whether to call the renderer's preview handoff or
 * clear it; only cancellation calls `clear` from this class.
 */
export class HabitatDrag {
 private active:{ pointer:number; revision:number; source:HTMLElement; rect:DOMRect; grab:ClientPoint; start:ClientPoint; dragging:boolean; point:ClientPoint; action:Action|null }|null=null
 private raf=0
 private pending:{ point:ClientPoint; action:Action|null }|null=null
 private clickUntil=0
 private releaseSource:HTMLElement|null=null
 private releaseTarget:HTMLElement|null=null
 private releaseUntil=0
 private readonly hint:HTMLElement

 constructor(private readonly options:HabitatDragOptions) {
  this.hint=document.createElement('output')
  this.hint.className='cm-habitat-drag-hint'
  this.hint.hidden=true
  this.hint.setAttribute('aria-live','off')
  Object.assign(this.hint.style,{position:'fixed',zIndex:'28',pointerEvents:'none',transform:'translate(14px, 14px)',padding:'6px 8px',maxWidth:'min(220px, calc(100vw - 28px))',background:'#182e2d',color:'#f3dfab',font:'700 11px/1.25 ui-monospace, monospace',boxShadow:'3px 3px 0 #071212'})
  document.body.append(this.hint)
  document.addEventListener('pointerdown',this.down)
  document.addEventListener('pointermove',this.move,{passive:false})
  document.addEventListener('pointerup',this.up)
  document.addEventListener('pointercancel',this.cancelEvent)
  document.addEventListener('keydown',this.key)
  document.addEventListener('visibilitychange',this.visibility)
  window.addEventListener('resize',this.cancelEvent)
 }

 /** Call from a capture-phase click handler before normal square/card handlers. */
 suppressClick(event:MouseEvent):boolean {
  if(event.detail===0) return false
  const target=event.target as HTMLElement
  if(performance.now()<this.clickUntil&&((this.releaseTarget&&(target===this.releaseTarget||this.releaseTarget.contains(target)))||(this.releaseSource&&(target===this.releaseSource||this.releaseSource.contains(target))))){
   this.clickUntil=0
   this.releaseUntil=0
   return true
  }
  if(performance.now()<this.releaseUntil&&((this.releaseTarget&&(target===this.releaseTarget||this.releaseTarget.contains(target)))||(this.releaseSource&&(target===this.releaseSource||this.releaseSource.contains(target))))){
   this.releaseUntil=0
   return true
  }
  return false
 }

 cancel=():void=>{
  const active=this.active
  this.active=null
  this.pending=null
  if(this.raf) cancelAnimationFrame(this.raf)
  this.raf=0
  if(active?.dragging){ this.clickUntil=performance.now()+350; this.releaseSource=active.source; this.releaseTarget=active.source; this.releaseUntil=this.clickUntil }
  if(active?.source.hasPointerCapture(active.pointer)) active.source.releasePointerCapture(active.pointer)
  active?.source.classList.remove('cm-habitat-drag-source')
  this.hint.hidden=true
  this.options.clear()
 }

 destroy():void {
  this.cancel()
  document.removeEventListener('pointerdown',this.down)
  document.removeEventListener('pointermove',this.move)
  document.removeEventListener('pointerup',this.up)
  document.removeEventListener('pointercancel',this.cancelEvent)
  document.removeEventListener('keydown',this.key)
  document.removeEventListener('visibilitychange',this.visibility)
  window.removeEventListener('resize',this.cancelEvent)
  this.hint.remove()
 }

 private readonly cancelEvent=()=>this.cancel()
 private readonly visibility=()=>{ if(document.hidden) this.cancel() }
 private readonly key=(event:KeyboardEvent)=>{ if(event.key==='Escape'&&this.active){event.preventDefault();this.cancel()} }
 private readonly down=(event:PointerEvent)=>{
  if(event.button!==0||event.isPrimary===false||this.active||!this.options.enabled()) return
  const source=this.options.source(event)
  if(!source||!(event.target instanceof Node)||!source.contains(event.target)) return
  const rect=source.getBoundingClientRect()
  this.active={pointer:event.pointerId,revision:this.options.revision(),source,rect,grab:{x:event.clientX-rect.left,y:event.clientY-rect.top},start:{x:event.clientX,y:event.clientY},dragging:false,point:{x:event.clientX,y:event.clientY},action:null}
 }
 private readonly move=(event:PointerEvent)=>{
  const active=this.active
  if(!active||active.pointer!==event.pointerId) return
  if(active.revision!==this.options.revision()||!this.options.enabled()){this.cancel();return}
  if(!active.dragging){
   if(Math.hypot(event.clientX-active.start.x,event.clientY-active.start.y)<8) return
   active.dragging=true
   active.source.setPointerCapture(active.pointer)
   active.source.classList.add('cm-habitat-drag-source')
  }
  event.preventDefault()
  const point=habitatDragPoint(active.rect,active.grab,{x:event.clientX,y:event.clientY})
  const action=this.options.target(event.clientX,event.clientY)
  active.point=point
  active.action=action
  this.pending={point,action}
  this.hint.textContent=this.options.label(action)
  this.hint.dataset.valid=action?'true':'false'
  this.hint.hidden=false
  this.hint.style.left=`${event.clientX}px`
  this.hint.style.top=`${event.clientY}px`
  if(!this.raf) this.raf=requestAnimationFrame(this.flush)
 }
 private readonly flush=()=>{
  this.raf=0
  const pending=this.pending
  this.pending=null
  if(pending) this.options.update(pending.point,pending.action)
 }
 private readonly up=(event:PointerEvent)=>{
  const active=this.active
  if(!active||active.pointer!==event.pointerId) return
  if(!active.dragging){this.active=null;return}
  const action=active.revision===this.options.revision()&&this.options.enabled()?this.options.target(event.clientX,event.clientY):null
  const target=document.elementFromPoint(event.clientX,event.clientY) as HTMLElement|null
  const point=habitatDragPoint(active.rect,active.grab,{x:event.clientX,y:event.clientY})
  this.pending=null
  if(this.raf) cancelAnimationFrame(this.raf)
  this.raf=0
  this.options.update(point,action)
  this.active=null
  if(active.source.hasPointerCapture(active.pointer)) active.source.releasePointerCapture(active.pointer)
  active.source.classList.remove('cm-habitat-drag-source')
  this.hint.hidden=true
  this.releaseTarget=target??active.source
  this.releaseSource=active.source
  this.clickUntil=performance.now()+350
  this.releaseUntil=this.clickUntil
  if(action) this.options.commit(action)
  else this.options.clear()
 }
}

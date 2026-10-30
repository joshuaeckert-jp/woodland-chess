/** Moves the original card node into the reading stage, preserving its home. */
export class CardLift {
 private animation:Animation|null=null
 private current:{node:HTMLElement;home:HTMLElement;rect:DOMRect;hadPreview:boolean;definition:string|null}|null=null
 constructor(private readonly slot:HTMLElement){}
 get node():HTMLElement|null{return this.current?.node??null}
 get home():HTMLElement|null{return this.current?.home??null}
 get homeRect():DOMRect|null{return this.current?.home.isConnected?this.current.home.getBoundingClientRect():null}
 lift(node:HTMLElement,definition:string):DOMRect {
  if(this.current?.node===node)return this.current.rect
  this.restore()
  const rect=node.getBoundingClientRect(),home=document.createElement('span')
  home.className='cm-card-home';home.dataset.homeCardId=node.dataset.cardId
  home.setAttribute('aria-hidden','true')
  Object.assign(home.style,{width:`${node.offsetWidth}px`,height:`${node.offsetHeight}px`,flexBasis:`${node.offsetWidth}px`})
  if(node.dataset.zone==='support'){home.classList.add('cm-card-home--support');Object.assign(home.style,{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)'})}
  this.current={node,home,rect,hadPreview:node.classList.contains('tcg-card--preview'),definition:node.getAttribute('data-card-definition')}
  node.replaceWith(home)
  node.classList.add('cm-card-lifted','tcg-card--preview')
  node.dataset.cardDefinition=definition
  this.slot.replaceChildren(node)
  return rect
 }
 animateFromHome():void {
  const entry=this.current;if(!entry||matchMedia('(prefers-reduced-motion:reduce)').matches)return
  this.animation?.cancel()
  const end=entry.node.getBoundingClientRect();if(!end.width||!end.height)return
  this.animation=entry.node.animate([{transform:`translate(${entry.rect.left-end.left}px,${entry.rect.top-end.top}px) scale(${entry.rect.width/end.width},${entry.rect.height/end.height})`,transformOrigin:'top left'},{transform:'none',transformOrigin:'top left'}],{duration:140,easing:'cubic-bezier(.22,.61,.36,1)'})
 }
 restore():HTMLElement|null {
  this.animation?.cancel();this.animation=null
  const entry=this.current;if(!entry)return null
  this.current=null
  entry.node.classList.remove('cm-card-lifted')
  if(!entry.hadPreview)entry.node.classList.remove('tcg-card--preview')
  if(entry.definition===null)entry.node.removeAttribute('data-card-definition');else entry.node.setAttribute('data-card-definition',entry.definition)
  entry.node.setAttribute('aria-expanded','false')
  if(entry.home.isConnected)entry.home.replaceWith(entry.node);else entry.node.remove()
  return entry.node
 }
}

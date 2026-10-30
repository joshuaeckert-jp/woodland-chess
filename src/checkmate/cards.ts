import './cards.css'
import './card-materials.css'
import './altar-relics.css'
import { getCardDefinitions,ROLE_NAMES,UNIT_DEFINITIONS } from './content'
import type { CardRef,EffectiveStats,Unit,CombatRules } from './types'

export type EffectCardState = 'ready'|'locked'|'exhausted'

export interface EffectCardOptions {
 combatRules?:CombatRules
 zone:'hand'|'support'|'preview'
 ready?:boolean
 remaining?:number
 fresh?:boolean
 disabled?:boolean
 opponent?:boolean
 index?:number
 count?:number
 state?:EffectCardState
}

export interface UnitCardOptions {
 ownerLabel?:string
 combatRules?:CombatRules
 zone?:'hand'|'preview'
 index?:number
 count?:number
 disabled?:boolean
}

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,character=>({
 '&':'&amp;',
 '<':'&lt;',
 '>':'&gt;',
 '"':'&quot;',
 "'":'&#39;',
}[character]!))

// Transparent lower padding in the twelve 192px illustration cells; relic feet meet the ledge.
const relicFootPadding=[5.2,5.2,5.2,13,5.7,8.3,10.4,5.2,9.4,15.1,5.7,8.3]
const artPosition=(artIndex:number)=>{
 const column=artIndex%4
 const row=Math.floor(artIndex/4)
 return {x:column===0?'0':`${(column/3*100).toFixed(3)}%`,y:row===0?'0':`${(row/2*100).toFixed(3)}%`}
}

const resolveState=(options:EffectCardOptions):EffectCardState=>{
 if(options.state)return options.state
 if(options.ready)return 'ready'
 if((options.remaining??0)>0)return 'exhausted'
 return 'locked'
}

const stateCopy=(state:EffectCardState,options:EffectCardOptions)=>{
 const remaining=options.remaining??0
 if(state==='ready')return 'Ready'
 if(state==='exhausted')return remaining>0?`Exhausted · ${remaining} own turn${remaining===1?'':'s'}`:'Exhausted'
 return options.fresh?'Locked · installed this turn':'Locked'
}

const categoryRune=(category:string)=>({
 Buff:'↑',Defense:'▣',Terrain:'▤',Healing:'+',Damage:'✦',Control:'⌘',Trap:'⌁',Recovery:'✚',Debuff:'↓',Equipment:'⚒',Order:'◆',
}[category]??'◆')

/** Material names are visual-only: card rules continue to be determined by category/effect. */
const materialForCategory=(category:string)=>({
 Terrain:'terrain',
 Defense:'defense',
 Buff:'buff',
 Equipment:'buff',
 Order:'buff',
 Control:'control',
 Trap:'control',
 Damage:'control',
 Debuff:'control',
 Healing:'recovery',
 Recovery:'recovery',
}[category]??'buff')

const PIXEL_DIGITS=['11111100011000110001100011000111111','00100011000010000100001000010001110','11111000010000111111100001000011111','11111000010000101111000010000111111','10001100011000111111000010000100001','11111100001000011111000010000111111','11111100001000011111100011000111111','11111000010001000100010000100001000','11111100011000111111100011000111111','11111100011000111111000010000111111']
/** Crisp 5×7 glyphs stay pixelated at every card size, without a web font. */
export function pixelCountdown(remaining:number,className='tcg-card__cooldown-number'){
 const value=String(Math.max(0,Math.min(99,Math.floor(remaining)))),width=value.length*6-1
 const pixels=[...value].map((digit,index)=>[...PIXEL_DIGITS[Number(digit)]!].map((on,cell)=>on==='1'?`<rect x="${index*6+cell%5}" y="${Math.floor(cell/5)}" width="1" height="1"/>`:'').join('')).join('')
 return `<svg class="${className}" viewBox="0 0 ${width} 7" shape-rendering="crispEdges" focusable="false" aria-hidden="true">${pixels}</svg>`
}
function cooldownBack(remaining:number){
 return `<span class="tcg-card__back" aria-hidden="true">${pixelCountdown(remaining)}<span class="tcg-card__cooldown-label">COOLDOWN</span></span>`
}

export function renderEffectCard(card:CardRef,options:EffectCardOptions):string{
 const definition=getCardDefinitions(options.combatRules)[card.definitionId]
 if(!definition)throw new Error(`Unknown effect card definition: ${card.definitionId}`)
 const state=resolveState(options)
 const material=materialForCategory(definition.category)
 const position=artPosition(definition.artIndex)
 const classes=['cm-card','tcg-card',`tcg-card--${options.zone}`,`tcg-state-${state}`]
 if(options.opponent)classes.push('tcg-card--opponent')
 if(options.disabled)classes.push('tcg-card--disabled')
 if(state==='ready')classes.push('ready')
 if(options.fresh)classes.push('tcg-card--new')
 if(options.zone==='support'&&state==='exhausted')classes.push('tcg-exhausted')
 const index=Math.max(0,options.index??0)
 const count=Math.max(1,options.count??1)
 const fanAngle=count>1?((index/(count-1))-.5)*8:0
 const fanY=Math.abs(fanAngle)*.24
 const identifier=escapeHtml(card.id)
 const stateLabel=options.zone==='hand'?'In hand · install first':stateCopy(state,options)
 const burnCopy=definition.burnable?'discard':'retained'
 const aria=`${definition.name}, ${definition.category}, cooldown ${definition.cooldown}, ${stateLabel}`
 const style=`--relic-foot:${relicFootPadding[definition.artIndex]??5.2}%;--card-x:${position.x};--card-y:${position.y};--fan-angle:${fanAngle.toFixed(2)}deg;--fan-y:${fanY.toFixed(2)}px;`
 const back=options.zone==='support'?cooldownBack(options.remaining??0):''
 const inner=`<span class="tcg-card__frame">
  <span class="tcg-card__topline"><span class="tcg-card__badge tcg-card__badge--rune" title="${escapeHtml(definition.category)}" aria-label="${escapeHtml(definition.category)}">${categoryRune(definition.category)}</span><span class="tcg-card__seal" aria-label="Cooldown ${definition.cooldown}" title="Cooldown: skips ${definition.cooldown} of your own turns after an order.">${definition.cooldown}</span></span>
  <strong class="tcg-card__title">${escapeHtml(definition.name)}</strong>
  <span class="tcg-card__art" role="img" aria-label="${escapeHtml(definition.name)} woodland illustration"><span class="tcg-card__illustration"></span></span>
  <span class="tcg-card__category">${escapeHtml(definition.category)} order · ${escapeHtml(stateLabel)}</span>
  <span class="tcg-card__effect">${escapeHtml(options.combatRules==='capture'&&definition.effect==='smoke'?'Animals can enter this square. Smoke blocks captures into or through it by rooks, bishops and queens.':definition.description)}</span>
  <span class="tcg-card__inspection">
   <span class="tcg-card__inspection-row"><b>Target</b><span>${escapeHtml(definition.targetHint.replaceAll('cells','squares').replaceAll('friendly source','one of your animals'))}</span></span>
   <span class="tcg-card__inspection-row"><b>Order</b><span>${options.opponent?'Owner turns it to order an animal.':'Ready on the altar: click to order an animal.'}</span></span>
   <span class="tcg-card__inspection-row"><b>Cast</b><span>${definition.burnable?(options.opponent?'Owner only · discard after casting.':'Drag from altar to target · discard.'):'Orders only · never discarded.'}</span></span>
   <span class="tcg-card__inspection-row"><b>Cooldown</b><span>${definition.cooldown} own turn${definition.cooldown===1?'':'s'} after ordering.</span></span>
   ${definition.effect==='smoke'||definition.effect==='log'?'<span class="tcg-card__inspection-row"><b>Lasts</b><span>Until the owner’s next turn starts.</span></span>':''}
  </span>
  <span class="tcg-card__footer">Order: exhaust · Effect: ${burnCopy}</span>
 </span>${back}`
 if(options.zone==='preview')return `<article class="${classes.join(' ')}" style="${style}" data-card-definition="${escapeHtml(definition.id)}" data-card-category="${escapeHtml(definition.category)}" data-card-material="${material}" data-card-effect="${escapeHtml(definition.effect)}" aria-label="${escapeHtml(aria)}">${inner}</article>`
 return `<button type="button" class="${classes.join(' ')}" style="${style}" data-card-id="${identifier}" data-card-category="${escapeHtml(definition.category)}" data-card-material="${material}" data-card-effect="${escapeHtml(definition.effect)}" data-zone="${options.zone}" data-cooldown-remaining="${options.remaining??0}" aria-label="${escapeHtml(aria)}"${options.disabled?' disabled aria-disabled="true"':''}>${inner}</button>`
}

export function captureUnitName(unit:Unit):string{return ({k:'Lion King',q:'Fox Queen',r:'Turtle Rook',b:'Raven Bishop',n:'Hare Knight',p:'Trail Rat'})[unit.role]}
export function captureUnitDescription(unit:Unit):string{
 return ({k:'Moves and captures one square in any direction. Capture the opposing king to win.',q:'Moves and captures along clear ranks, files and diagonals.',r:'Moves and captures along clear ranks and files.',b:'Moves and captures along clear diagonals.',n:'Jumps in an L over other animals.',p:'Moves forward and captures diagonally. Reaching the far rank promotes this rat into a Fox Queen.'})[unit.role]
}
export function renderUnitCard(unit:Unit,stats:EffectiveStats,options:UnitCardOptions={}):string{
 const definition=UNIT_DEFINITIONS[unit.definitionId]
 if(!definition)throw new Error(`Unknown unit definition: ${unit.definitionId}`)
 const capture=options.combatRules==='capture'
 const name=capture?captureUnitName(unit):definition.name,description=capture?captureUnitDescription(unit):definition.description
 const conditions=[unit.statuses.some(s=>s.kind==='guarded')?'Guard':'',unit.statuses.some(s=>s.kind==='inspired')?(capture?'Pierce':'Inspired'):'',unit.statuses.some(s=>s.kind==='rooted')?'Rooted':'',!capture&&unit.statuses.some(s=>s.kind==='poison')?'Poison':''].filter(Boolean)
 const conditionHelp:Record<string,string>=capture?{Guard:'Guard stops its next capture.',Pierce:'Pierce bypasses Guard on its next capture.',Rooted:'Rooted prevents movement and captures.'}:{Guard:'Defense bonus is active.',Inspired:'Attack bonus is active.',Rooted:'Cannot move; may still attack.',Poison:'Takes poison damage at the end of its turns.'}
 const frame=unit.side==='w'?0:20
 const position={x:'0',y:frame===0?'0':'55.555%'}
 const style=`--species:url('/assets/sprites/${escapeHtml(definition.species)}.webp');--unit-x:${position.x};--unit-y:${position.y};`
 const side=unit.side==='w'?'Ivory':'Charcoal'
 const aria=capture?`${side} ${name}, ${ROLE_NAMES[unit.role]}, ${conditions.join(', ')||'Ready'}, instant captures`:`${side} ${definition.name}, ${ROLE_NAMES[unit.role]}, ${stats.hp} of ${stats.maxHp} health, attack ${stats.atk}, defense ${stats.def}`
 const zone=options.zone??'preview'
 const index=Math.max(0,options.index??0)
 const count=Math.max(1,options.count??1)
 const fanAngle=count>1?((index/(count-1))-.5)*8:0
 const fanY=Math.abs(fanAngle)*.24
 const cardStyle=`${style}--fan-angle:${fanAngle.toFixed(2)}deg;--fan-y:${fanY.toFixed(2)}px;`
 const classes=`cm-card tcg-card tcg-card--${zone} tcg-unit-card${unit.side==='b'?' tcg-card--opponent':''}${options.disabled?' tcg-card--disabled':''}`
 const inner=`<span class="tcg-card__frame">
  <span class="tcg-card__topline"><span class="tcg-card__badge">${escapeHtml(ROLE_NAMES[unit.role])}</span><span class="tcg-card__seal">${capture?'':escapeHtml(unit.combat)}</span></span>
  <strong class="tcg-card__title">${escapeHtml(name)}</strong>
  <span class="tcg-card__owner">${escapeHtml(options.ownerLabel??side)}${unit.square?` · ${escapeHtml(unit.square)}`:' · In reserve'}</span>
  <span class="tcg-card__art tcg-unit-card__art" role="img" aria-label="${escapeHtml(side)} ${escapeHtml(definition.species)} illustration"><span class="tcg-card__illustration"></span></span>
  ${capture?`<span class="tcg-unit-card__conditions">${conditions.length?conditions.map(c=>`<b>${c}</b>`).join(''):'<span>Instant capture</span>'}</span>`:`<span class="tcg-unit-card__stats"><b>HP ${stats.hp}/${stats.maxHp}</b><b>ATK ${stats.atk}</b><b>DEF ${stats.def}</b></span>`}
  <span class="tcg-card__category">${capture?'Chess movement':escapeHtml(definition.combat)+' · range '+definition.range} · ${escapeHtml(side)}</span>
  <span class="tcg-card__effect">${escapeHtml(description)}</span>
  <span class="tcg-card__inspection">
   <span class="tcg-card__inspection-row"><b>${unit.square?'Order':'Deploy'}</b><span>${unit.square?'Turn an altar card, then drag this habitat.':'Drag to a starting square · uses your turn.'}</span></span>
   <span class="tcg-card__inspection-row"><b>Effects</b><span>${escapeHtml(conditions.length?conditions.map(c=>conditionHelp[c]??c).join(' '):'No active effects.')}</span></span>
  </span>
  ${zone==='hand'?'<span class="tcg-card__footer">Deploy · one turn</span>':''}
 </span>`
 if(zone==='preview')return `<article class="${classes}" style="${cardStyle}" data-unit-id="${escapeHtml(unit.id)}" data-card-material="animal" data-species="${escapeHtml(definition.species)}" aria-label="${escapeHtml(aria)}">${inner}</article>`
 return `<button type="button" class="${classes}" style="${cardStyle}" data-card-id="${escapeHtml(unit.id)}" data-unit-id="${escapeHtml(unit.id)}" data-card-kind="unit" data-card-material="animal" data-species="${escapeHtml(definition.species)}" data-zone="hand" aria-label="${escapeHtml(`${aria}, reserve animal card`)}"${options.disabled?' disabled aria-disabled="true"':''}>${inner}</button>`
}

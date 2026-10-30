import './checkmate.css'
import './card-panel.css'
import './encounter-checklist.css'
import {getEncounterObjectives} from './encounter-objectives'
import {ENCOUNTERS,ENCOUNTER_ORDER,isEncounterId} from './encounters'
import { altarArt } from './altar'
import { supportDropOptions, type SupportDropOptions } from './support-drop'
import type { EffectCardCue } from './effect-card-motion'
import { createGame,applyAction,legalActions,previewAction,effectiveStats,isCardReady,legalDeploymentSquares,autoDeployRemaining,handDrawInfo,supportLimit } from './engine'
import { serializeGame } from './persistence'
import { BALANCED_OPENING,getCardDefinitions,ROLE_LIMITS,ROLE_NAMES,UNIT_DEFINITIONS,defaultRosters,variantsForRole,STARTER_DECK } from './content'
import type { Action,CardRef,GameState,Role,Side,Square,Unit,CombatRules,EncounterId } from './types'
import { TacticalRenderer } from './visuals'
import { GameSound } from '../sound'
import { renderEffectCard,renderUnitCard,pixelCountdown,captureUnitName,captureUnitDescription } from './cards'
import { CardDrag } from './card-drag'
import { CardLift } from './card-lift'
import { HabitatDrag } from './habitat-drag'
import type { DeploymentOrigin } from './deployment-card'
import { CheckmateOpponent } from './ai-client'
import { DEFAULT_PLAY,restoreSession,serializeSession } from './session'
import type { PlaySettings } from './session'
import { placeInspection,inInspectionCorridor } from './inspection-placement'
import './table-stack.css'
import './card-inspection.css'

type Intent={kind:'fire';cardId:string;unitId:string}|{kind:'install';cardId:string;unitId?:string}|{kind:'deploy';unitId:string}|{kind:'order';cardId:string;order:'move'|'attack'|'auto';unitId?:string}|{kind:'burn';cardId:string;sourceId?:string}
const SAVE='project-checkmate-save-v1'
const squares=Array.from({length:64},(_,i)=>`${'abcdefgh'[i%8]}${8-Math.floor(i/8)}` as Square)
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T
const app=document.querySelector<HTMLDivElement>('#app')!,sound=new GameSound()
const opponent=new CheckmateOpponent(status=>{if(status==='fallback')message('The woodland chose a legal fallback action.')})
let game:GameState,renderer:TacticalRenderer,play:PlaySettings={...DEFAULT_PLAY}
let intent:Intent|null=null,selectedSquare:Square|null=null,preview:Action|null=null
let busy=false,thinking=false,ready=false,revision=0,flipped=false,aiFailed=false
let drag:CardDrag|undefined,habitatDrag:HabitatDrag|undefined,cardLift:CardLift|undefined
let focusSquare:Square='e2',drawNote='',newCards=new Set<string>()
let handTab:'units'|'effects'='units'
let hoverSwitchTimer:ReturnType<typeof setTimeout>|undefined,hoverCandidate:HTMLElement|null=null
let lastPointer={x:0,y:0},hoverAwaitMove=false
let pendingDrop:{cardId:string;square:Square;options:SupportDropOptions;revision:number}|null=null
let suppressPeekFocus=false,dismissedPeekId=''
let dismissedPeekRect:DeploymentOrigin|undefined
let unitHoverTimer:ReturnType<typeof setTimeout>|undefined,unitHoverId='',unitHoverPressed=false,unitHoverSquare:HTMLElement|null=null
let peekPinned=false,peekId='',peekTimer:ReturnType<typeof setTimeout>|undefined
let peekPlacementSide:'left'|'right'|undefined
let selectedEncounter:EncounterId='blockade'
let goalUserOpen:boolean|null=null,goalEncounterId='' 
const encounter=()=>game.options.encounterId?ENCOUNTERS[game.options.encounterId]:null
const capture=()=>game.options.combatRules==='capture'
const cardDefinitions=()=>getCardDefinitions(game.options.combatRules)
const animalName=(u:Unit)=>capture()?captureUnitName(u):UNIT_DEFINITIONS[u.definitionId].name
const unitCard=(u:Unit,options:Parameters<typeof renderUnitCard>[2]={})=>renderUnitCard(u,effectiveStats(game,u.id),{...options,ownerLabel:play.mode==='ai'?(u.side===play.human?'Your animal':'Opponent’s animal'):sideName(u.side),combatRules:game.options.combatRules})+(u.square?fieldExplanation(u.square):'')
const reinforcement=()=>game.options.armyMode==='reinforcement'
const reserves=(side:Side)=>reinforcement()?game.units.filter(u=>u.side===side&&!u.square&&u.hp>0&&u.role!=='k'):[]
const unit=(id:string)=>game.units.find(u=>u.id===id)
const sideName=(side:Side)=>side==='w'?'Ivory':'Charcoal'
const preloadCardArt=(src:string)=>new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>reject(new Error('Card art could not load'));image.src=src})
const randomSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0]!
const isAiTurn=()=>play.mode==='ai'&&game.turn!==play.human&&game.phase!=='finished'
const canAct=()=>ready&&!busy&&!thinking&&!isAiTurn()&&game.phase!=='finished'
const panelSide=()=>play.mode==='ai'?play.human:game.turn
const paused=()=>Boolean(document.querySelector('dialog[open]'))||peekPinned||document.hidden
const actions=()=>legalActions(game)
const artStyle=(index:number)=>`--card-x:${index%4/3*100}%;--card-y:${Math.floor(index/4)/2*100}%`

function shell(){
 app.innerHTML=`<main class="cm-game">
 <p id="cm-status" class="cm-ribbon" role="status" aria-live="polite"></p><details id="cm-objectives" class="cm-objectives" aria-label="Encounter objectives" hidden><summary></summary><div id="cm-objective-body"></div></details>
 <div class="cm-arena"><div id="cm-far-bank" class="cm-bank-mount"></div><div class="cm-board-wrap"><canvas id="cm-board" aria-hidden="true"></canvas><div id="cm-squares" class="cm-squares" role="group" aria-label="Battlefield; arrow keys navigate, Enter selects"></div><div id="cm-loading" class="cm-loading">Setting the battlefield…</div></div><div id="cm-near-bank" class="cm-bank-mount"></div></div>
 <button id="cm-tower-fire" class="cm-tower-fire" hidden>Fire tower shot · Root next turn</button><button id="cm-menu-button" class="cm-menu" aria-label="Open Checkmate menu" aria-haspopup="dialog">☰</button>
 <section class="cm-hand-dock" aria-label="Your floating hand"><div class="cm-hand-heading"><b id="cm-hand-label">Your hand</b><nav id="cm-hand-tabs" class="cm-hand-tabs" aria-label="Hand cards" hidden><button data-hand-tab="units">Animals</button><button data-hand-tab="effects">Effects</button></nav><span id="cm-hand-count"></span></div><div id="cm-hand" class="cm-hand-fan"></div><p id="cm-hand-hint" class="cm-hand-help">Tap to read · drag to your support row to install</p></section><section class="cm-tray" aria-label="Cards and army"><nav class="cm-tabs" aria-label="Battle information"><button data-tab="hand" class="active">Actions</button><button data-tab="orders">Journal</button><button data-tab="army">Army</button></nav><button id="cm-close-tools" class="cm-quiet cm-tools-close">Close actions</button><p id="cm-intent" class="cm-intent"></p><button id="cm-clear" class="cm-quiet" hidden>Cancel selection</button><p id="cm-draw-note" class="cm-draw-note" role="status" aria-live="polite" hidden></p><div id="cm-panel"></div><p id="cm-error" class="cm-error" role="alert"></p><button id="cm-retry-ai" class="secondary" hidden>Retry opponent</button></section>
 </main>
 <dialog id="cm-menu" aria-labelledby="cm-menu-title"><h2 id="cm-menu-title">Project Checkmate</h2><p id="cm-current-mode" class="cm-muted"></p><button id="cm-new" class="primary">New Checkmate match</button><button id="cm-restart" class="secondary">Restart match</button><button id="cm-encounter-info" class="secondary" hidden>Objective & hint</button><button id="cm-classic" class="secondary">Classic chess</button><button id="cm-flip" class="secondary">Flip board</button><button id="cm-undo" class="secondary">Undo decision</button><button id="cm-export" class="secondary">Export JSON replay</button><button id="cm-table-tools" class="secondary">Table actions & journal</button><button id="cm-rules" class="secondary">Rules & card codex</button><button id="cm-menu-close" class="secondary">Return to match</button><label><input id="cm-motion" type="checkbox" checked> Animations & atmosphere</label><label><input id="cm-sound" type="checkbox"> Optional sounds</label></dialog>
 <section id="cm-drop-choice" class="cm-drop-choice" aria-label="Choose card use" hidden></section><section id="cm-preview" class="cm-inline-confirm" aria-labelledby="cm-preview-title" aria-live="polite" hidden><h2 id="cm-preview-title">Confirm action</h2><p id="cm-preview-copy"></p><button id="cm-confirm" class="primary">Confirm</button><button id="cm-cancel" class="secondary">Cancel</button></section>
 <dialog id="cm-result" aria-labelledby="cm-result-title"><h2 id="cm-result-title">Match complete</h2><p id="cm-result-copy"></p><button id="cm-play-again" class="primary">Play again</button><button id="cm-next-encounter" class="primary" hidden>Next encounter</button><button id="cm-choose-encounter" class="secondary" hidden>Choose encounter</button><button id="cm-view-board" class="secondary">View board</button></dialog>
 <dialog id="cm-encounter-brief" aria-labelledby="cm-encounter-title"><h2 id="cm-encounter-title"></h2><p id="cm-encounter-objective"></p><p id="cm-encounter-copy"></p><details><summary>Show a hint</summary><p id="cm-encounter-hint"></p></details><button id="cm-encounter-close" class="primary">Back to the board</button></dialog>
 <dialog id="cm-codex" aria-labelledby="cm-codex-title"><h2 id="cm-codex-title">Rules & card codex</h2><p>Reinforcement starts with kings on e1 and e8. Your other fifteen animals wait in the Animals hand. Drag one onto an empty square in your first two ranks, or first three for rats. Deploying ends your turn and needs no support card. Animals do not occupy support slots. Keyboard: Space on an animal card selects deployment, then choose a highlighted square. Full Army keeps pre-battle deployment.</p><p>Choose a balanced, selected or shuffled opening hand of five. Both sides receive the same opening selection. There are twelve cards in each deck. Draw one automatically at the start of your own turns 3, 6, 9… Drawing costs no action; no cards are drawn after the deck runs out.</p><p>Install from your hand; on a later own turn exhaust a ready support to Move or Attack, or Burn its printed effect and discard it. Every committed battle action ends the turn. Three support slots in new matches. Cooldown 2 skips your next two turns.</p><p>Damage = max(1, ATK − DEF). Surviving melee defenders stay put; sliding attackers stop before them, hares and rats return home. Ranged units stay at source. Defeat the enemy King: no check, castle or en passant here. Last-rank rats become Veterans. Smoke blocks ranged sight; Logs also block movement.</p><p>Recover creates a non-burnable order only after every card is gone. Forced Rest is offered only with no legal action. Full-state repetition or 100 actions without progress draws. Hands, decks and traps are public for testing; the opponent uses this same information and these same rules. Difficulty changes its search, never its stats, cards or number of actions.</p><div class="cm-codex-cards">${STARTER_DECK.map(id=>{const d=cardDefinitions()[id];return `<article><h3>${d.name} · CD ${d.cooldown}</h3><p>${d.description}</p><small>${d.targetHint}</small></article>`}).join('')}</div><button id="cm-close-codex" class="primary">Return</button></dialog>
 <dialog id="cm-unit-details" aria-labelledby="cm-unit-title"><h2 id="cm-unit-title"></h2><div id="cm-unit-copy"></div><button id="cm-unit-close" class="primary">Return to board</button></dialog>
 <section id="cm-unit-hover" role="tooltip" aria-label="Animal health and stats" hidden></section><section id="cm-card-reader" class="cm-card-peek" aria-label="Card details" hidden><div id="cm-card-view"></div><aside class="cm-card-choices"><p id="cm-card-context"></p><div id="cm-card-actions"></div></aside></section>${setupMarkup()}`
}

function setupMarkup(){
 const slots=(side:Side)=>Object.entries(ROLE_LIMITS).flatMap(([role,n])=>Array.from({length:n},(_,i)=>`<label>${ROLE_NAMES[role as Role]} ${i+1}<select data-roster="${side}">${variantsForRole(role as Role).map(v=>`<option value="${v.id}">${v.name}</option>`).join('')}</select><small class="cm-variant-info"></small></label>`)).join('')
 return `<dialog id="cm-setup" aria-labelledby="cm-setup-title"><h2 id="cm-setup-title">New Checkmate match</h2><p id="cm-setup-error" role="alert"></p>
 <label>Play<select id="cm-match-kind"><option value="encounter">Woodland encounters</option><option value="skirmish">Skirmish · standard board</option></select></label>
 <section id="cm-encounter-picker" aria-label="Choose an encounter"><div class="cm-encounter-list">${ENCOUNTER_ORDER.map((id,index)=>{const e=ENCOUNTERS[id];return `<button type="button" class="cm-encounter-option" data-encounter-id="${id}" aria-pressed="${index===0}"><i style="--encounter-art:url('/assets/sprites/${e.species}.webp')" aria-hidden="true"></i><span><b>${e.title}</b><small>${e.objective}</small></span></button>`}).join('')}</div><p id="cm-encounter-intro"></p><p id="cm-encounter-tools" class="cm-muted"></p><p class="cm-muted">Drag an altar card onto an animal to cast its effect. Place a hand card, then drag an animal to order it. One action per turn; restart and undo are in the menu.</p></section>
 <div id="cm-skirmish-settings"><div class="cm-match-fields"><label>Opponent<select id="cm-play-mode"><option value="ai">Play the woodland</option><option value="local">Two players on this device</option></select></label><div id="cm-ai-settings"><label>Difficulty<select id="cm-difficulty"><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label><label>Your side<select id="cm-human"><option value="w">Ivory & gold</option><option value="b">Charcoal & silver</option></select></label><p class="cm-muted">The woodland deploys its army and takes one legal action per turn. No extra cards or stat bonuses.</p></div></div>
 <label>Combat rules<select id="cm-combat-rules"><option value="capture">Card-Powered Chess · instant captures</option><option value="hp">Animal Tactics · HP combat</option></select></label><p id="cm-combat-help" class="cm-muted"></p><label class="cm-army-mode">Army mode<select id="cm-army-mode"><option value="full">Standard chess formation</option><option value="reinforcement" hidden>Legacy reinforcement sandbox</option></select></label><p id="cm-army-mode-help" class="cm-muted"></p><fieldset class="cm-opening-settings"><legend>Tactical opening hand</legend><label>Deal<select id="cm-hand-mode"><option value="balanced">Balanced five</option><option value="selected">Choose five cards</option><option value="shuffled">Shuffled five</option></select></label><p class="cm-muted">Five cards in hand, seven in the deck. Both sides use the same deal.</p><div id="cm-opening-preview" class="cm-opening-preview"></div><div id="cm-opening-builder" hidden><p id="cm-opening-count" role="status"></p><div class="cm-opening-grid">${STARTER_DECK.map(id=>{const d=cardDefinitions()[id];return `<label class="cm-opening-card"><input type="checkbox" name="opening-card" value="${id}"><i style="${artStyle(d.artIndex)}" aria-hidden="true"></i><b>${d.name}</b><small>CD ${d.cooldown} · ${d.description}</small></label>`}).join('')}</div><button id="cm-balanced" class="secondary">Use balanced selection</button></div><label>Deal seed<input id="cm-seed" type="number" min="0" max="4294967295" step="1" value="1"></label><button id="cm-shuffle" class="secondary">Shuffle a new deal</button></fieldset>
 <details class="cm-army-builder"><summary>Army variants · 16 units per side</summary><div class="cm-rosters"><fieldset><legend>Ivory</legend>${slots('w')}</fieldset><fieldset><legend>Charcoal</legend>${slots('b')}</fieldset></div><button id="cm-starter" class="secondary">Starter armies</button></details>
 </div><div class="cm-setup-actions"><button id="cm-start-deployment" class="primary">Start deployment</button><button id="cm-setup-close" class="secondary">Return</button></div></dialog>`
}

let noticeTimer:ReturnType<typeof setTimeout>|undefined
function message(value=''){$('cm-error').textContent=value;clearTimeout(noticeTimer);if(value)noticeTimer=setTimeout(()=>{$('cm-error').textContent=''},5500)}
function cardRef(id:string){return (['w','b'] as Side[]).flatMap(side=>{const p=game.players[side];return [...p.hand,...p.support,...p.deck,...p.discard]}).find(c=>c.id===id)!}
function targets():Square[]{
 if(!intent||!canAct())return []
 if(intent.kind==='deploy')return legalDeploymentSquares(game,intent.unitId)
 const ownSource=(intent.kind==='order'||intent.kind==='install')&&!intent.unitId||intent.kind==='burn'&&!intent.sourceId&&cardDefinitions()[cardRef(intent.cardId).definitionId].target!=='friendly'
 if(ownSource)return game.units.filter(u=>u.side===game.turn&&u.hp>0&&u.square).map(u=>u.square!)
 return [...new Set(actions().filter(matchesIntent).flatMap(a=>a.type==='fire'||a.type==='order'||a.type==='deploy'||a.type==='install'?[a.to]:a.type==='burn'?[a.targetSquare,unit(a.targetUnitId??'')?.square]:[]).filter((x):x is Square=>Boolean(x)))]
}
function matchesIntent(a:Action){
 if(!intent)return false
 if(intent.kind==='fire')return a.type==='fire'&&a.cardId===intent.cardId&&a.unitId===intent.unitId
 if(intent.kind==='deploy')return a.type==='deploy'&&a.unitId===intent.unitId
 if(intent.kind==='install')return a.type==='install'&&a.cardId===intent.cardId&&a.unitId===intent.unitId
 if(intent.kind==='order')return a.type==='order'&&a.cardId===intent.cardId&&(intent.order==='auto'||a.kind===intent.order)&&a.unitId===intent.unitId
 return a.type==='burn'&&a.cardId===intent.cardId&&(!intent.sourceId||a.sourceUnitId===intent.sourceId)
}
function instruction(){
 if(thinking)return 'The woodland is choosing its action. You can pause from the menu.'
 if(busy)return 'Resolving the action…'
 if(isAiTurn())return 'The woodland acts next.'
 if(!intent)return 'Choose a card, or inspect an animal.'
 if(intent.kind==='fire')return 'Choose a highlighted enemy for the tower shot. The animal stays here and is Rooted through its next turn.'
 if(intent.kind==='install')return 'Drag a friendly habitat to move or capture. The card installs and exhausts as the same action.'
 if(intent.kind==='deploy')return 'Choose a highlighted deployment square.'
 if(intent.kind==='order')return intent.unitId?'Drag its habitat to a highlighted square, or click a destination.':'Pick up a friendly habitat and drag it to a highlighted destination.'
 return cardDefinitions()[cardRef(intent.cardId).definitionId].target==='friendly'?'Choose a highlighted friendly target.':intent.sourceId?'Choose a highlighted effect target.':'Choose a friendly source, then the effect target.'
}
function render(){
 document.body.dataset.gameBusy=String(busy||thinking)
 hideUnitHover()
 $('cm-unit-hover').setAttribute('aria-label',capture()?'Animal abilities':'Animal health and stats')
 hoverAwaitMove=true
 closeDropChoice()
 closeCardPeek(false)
 drag?.cancel()
 document.querySelector<HTMLElement>('.cm-game')!.dataset.phase=game.phase
 document.querySelector<HTMLElement>('.cm-game')!.dataset.ordering=String(canAct()&&(intent?.kind==='order'||intent?.kind==='install'))
 if(!busy)renderer.setState(game)
 const legal=targets();renderer.setSelection(selectedSquare,legal)
 $('cm-status').textContent=thinking?`${sideName(game.turn)} woodland is thinking…`:busy?'Resolving action…':game.phase==='deployment'?`${sideName(game.turn)} deploys${game.units.some(u=>u.side===game.turn&&u.role==='k'&&u.square)?'':' — king first'}`:game.phase==='finished'?'Match complete':`${sideName(game.turn)} to act · turn ${game.players[game.turn].ownTurn}${intent?.kind==='install'?' · drag an animal to finish placing':' · one action'}`
 const episode=encounter(),ep=game.encounterProgress
 if(episode&&game.phase!=='finished'){$('cm-status').textContent=(episode.id==='tower'?`Defeat sentinel → e5 · ${Math.max(0,4-(ep?.whiteActions??0))} actions left`:episode.id==='crossing'?`Hold d1 · ${ep?.enemyReplies??0}/3 enemy turns`:episode.id==='rescue'?`Reach c3 · ${Math.max(0,2-(ep?.whiteActions??0))} actions left`:`Capture the marked turtle · ${Math.max(0,2-(ep?.whiteActions??0))} actions left`)+(thinking?' · enemy acts…':'');$('cm-status').title=episode.objective}
 renderObjectives()
 const orderIntent=intent?.kind==='order'?intent:null
 const towerFire=orderIntent?actions().find(a=>a.type==='fire'&&a.cardId===orderIntent.cardId&&(!orderIntent.unitId||a.unitId===orderIntent.unitId)):undefined
 $('cm-tower-fire').hidden=!canAct()||!towerFire&&intent?.kind!=='fire';$('cm-tower-fire').textContent=intent?.kind==='fire'?'Cancel tower shot':'Fire tower shot · Root next turn'
 $('cm-encounter-info').hidden=!episode;$('cm-restart').textContent=episode?'Restart encounter':'Restart match'
 $('cm-intent').textContent=instruction();$('cm-intent').hidden=!intent&&!busy&&!thinking&&!isAiTurn();$('cm-clear').hidden=!intent
 $('cm-draw-note').textContent=drawNote;$('cm-draw-note').hidden=!drawNote
 const tab=document.querySelector<HTMLButtonElement>('.cm-tabs .active')?.dataset.tab??'hand'
 renderTableCards()
 $('cm-panel').innerHTML=game.phase==='deployment'?deploymentPanel():tab==='hand'?handPanel():tab==='orders'?journalPanel():armyPanel()
 for(const button of document.querySelectorAll<HTMLButtonElement>('#cm-squares button')){
  const square=button.dataset.square as Square,u=game.units.find(x=>x.square===square&&x.hp>0)
  button.classList.toggle('cm-encounter-goal',encounter()?.markedSquare===square)
  button.dataset.orderUnit=String(canAct()&&(intent?.kind==='order'||intent?.kind==='install')&&u?.side===game.turn)
  button.classList.toggle('cm-order-source',(intent?.kind==='order'||intent?.kind==='install')&&unit(intent.unitId??'')?.square===square&&canAct());button.disabled=!ready||busy||thinking;button.tabIndex=square===focusSquare?0:-1
  const obstacle=game.obstacles?.[square];button.removeAttribute('title')
  button.setAttribute('aria-pressed',String(selectedSquare===square));button.setAttribute('aria-label',`${square}${u?`, ${sideName(u.side)} ${animalName(u)}${capture()?'':`, ${u.hp} HP`}`:''}${obstacle?`, ${obstacle.kind}${obstacle.spent?' spent':''}`:''}${legal.includes(square)?', legal target':''}${encounter()?.markedSquare===square?', encounter objective':''}`)
 }
 const tray=document.querySelector('.cm-tray')!;tray.scrollTop=0;tray.setAttribute('aria-busy',String(busy||thinking))
 document.querySelectorAll<HTMLButtonElement>('.cm-tray button').forEach(b=>b.disabled=busy||thinking||!ready)
 $('cm-current-mode').textContent=(encounter()?encounter()!.title+' · ':'')+(capture()?'Card-Powered Chess · ':'Animal Tactics · ')+(reinforcement()?'Reinforcement · ':'Full army · ')+(play.mode==='ai'?`You: ${sideName(play.human)} · ${play.difficulty} woodland`:'Two players on this device')
 $<HTMLButtonElement>('cm-undo').disabled=game.log.length<=(!game.options.encounterId&&game.options.armyMode==='full'?32:0)
 $('cm-retry-ai').hidden=!aiFailed
 document.querySelectorAll<HTMLButtonElement>('.cm-arena [data-card-id],#cm-hand [data-card-id]').forEach(button=>button.disabled=!ready||busy)
}
function deploymentPanel(){return `<p>${isAiTurn()?'The woodland places its next unit.':'Choose an unplaced unit, then a highlighted square.'}</p><div class="cm-unit-row">${game.units.filter(u=>u.side===game.turn&&!u.square).map(unitButton).join('')}</div><button id="cm-auto-deploy" class="secondary">Auto-place remaining</button>`}
function handPanel(){
 const side=panelSide(),p=game.players[side],other=game.players[side==='w'?'b':'w'],info=handDrawInfo(game,side)
 const legal=canAct()?actions():[],recover=legal.some(a=>a.type==='recover'),rest=legal.some(a=>a.type==='rest')
 return `<div class="cm-deck-summary"><img src="/assets/checkmate/card-back.webp" alt="" width="30" height="45"><div><b>${info.deckCount} in deck</b><span>${info.nextDrawIn===null?'Deck empty · supports still refresh':`Next draw in ${info.nextDrawIn} of your own turn${info.nextDrawIn===1?'':'s'}`}</span><small>${info.handCount} in hand · ${info.discardCount} discarded</small></div></div>${reinforcement()?'<p>Animals: drag a reserve onto your home ranks. One animal costs your turn; no support card is needed.</p>':''}<p class="cm-table-guide">${capture()?'Place a card, then drag an animal: installing includes its order.':'Install a hand card in your support row.'} On a later turn, click a ready card to order an animal, or drag it onto a legal target to cast its effect.</p>${supportLimit(game)===5?'<p class="cm-legacy-note">This saved match keeps its original five slots. New matches use three.</p>':''}${recover?'<button data-direct="recover" class="secondary">Recover reserve order</button>':''}${rest?'<button data-direct="rest" class="secondary">Forced rest</button>':''}<details><summary>Open match information</summary><p>${sideName(other.side)} hand: ${other.hand.map(c=>cardDefinitions()[c.definitionId].name).join(', ')||'empty'}</p><p>Opponent deck: ${other.deck.map(c=>cardDefinitions()[c.definitionId].name).join(', ')||'empty'}</p><p>Your deck: ${p.deck.map(c=>cardDefinitions()[c.definitionId].name).join(', ')||'empty'}</p><p>Opponent discard: ${other.discard.length}</p></details>`
}
function renderObjectives(){
 const model=getEncounterObjectives(game),widget=$<HTMLDetailsElement>('cm-objectives'),root=document.querySelector<HTMLElement>('.cm-game')!
 root.dataset.encounter=String(Boolean(model));widget.hidden=!model
 if(!model){widget.open=false;root.dataset.goalSpace='overlay';goalEncounterId='';return}
 const id=game.options.encounterId!
 if(goalEncounterId!==id){goalEncounterId=id;goalUserOpen=null}
 const wide=innerWidth>=1100&&innerHeight>=760,portraitRoom=innerWidth<600&&innerHeight>=innerWidth+450
 widget.open=goalUserOpen??(wide||portraitRoom)
 root.dataset.goalSpace=widget.open&&portraitRoom?'reserved':'overlay'
 widget.dataset.result=model.complete?'complete':model.failed?'failed':'active'
 const count=model.steps.filter(s=>s.done).length,next=model.steps.find(s=>s.active)??model.steps.find(s=>!s.done)
 const summary=`<span class="cm-goal-title">${model.title}</span><span class="cm-goal-next">${model.complete?'Encounter complete':next?.label??model.title}</span><span class="cm-goal-count" aria-label="${count} of ${model.steps.length} objectives complete">${count}/${model.steps.length}</span><span class="cm-goal-arrow" aria-hidden="true">▾</span>`
 const summaryNode=widget.querySelector('summary')!;if(summaryNode.innerHTML!==summary)summaryNode.innerHTML=summary
 const body=`<ol>${model.steps.map(s=>`<li data-goal-id="${s.id}" data-done="${s.done}" data-active="${s.active}" aria-label="${s.done?'Completed':s.active?'Current objective':'Next objective'}: ${s.label}"><i aria-hidden="true">${s.done?'✓':s.active?'◆':''}</i><span>${s.label}</span></li>`).join('')}</ol><footer><span role="status" aria-live="polite">${model.complete?'All objectives complete':model.failed?'Encounter failed':model.budgetLabel}${model.complete||model.failed?'':game.turn==='b'?' · enemy turn':''}</span><button type="button" data-objective-hint>Hint</button></footer>`
 if($('cm-objective-body').innerHTML!==body)$('cm-objective-body').innerHTML=body
}
function journalPanel(){return `<p>${game.log.length} recorded placements and actions.</p><ol class="cm-journal">${game.log.slice(-16).map(a=>`<li>${actionLine(a)}</li>`).join('')}</ol>`}
function actionLine(action:Action){
 const owner=sideName(action.player)
 if(action.type==='deploy')return `${owner}: deploy ${animalName(unit(action.unitId)!)} to ${action.to}`
 if(action.type==='fire')return `${owner}: ${animalName(unit(action.unitId)!)} fires tower → ${action.to}`
 if(action.type==='order')return `${owner}: ${animalName(unit(action.unitId)!)} ${action.kind} → ${action.to}`
 if(action.type==='burn'||action.type==='install')return `${owner}: ${action.type} ${cardDefinitions()[cardRef(action.cardId).definitionId].name}`
 return `${owner}: ${action.type==='rest'?'forced rest':'recover reserve order'}`
}
function armyPanel(){return `<div class="cm-unit-row">${game.units.filter(u=>u.square&&u.hp>0).map(unitButton).join('')}</div>`}
function cardButton(card:CardRef,zone:'hand'|'support',side:Side,index=0,count=1){
 const player=game.players[side],support=player.support.find(c=>c.id===card.id)
 const remaining=support?Math.max(0,support.usableOn-player.ownTurn,support.readyOn-player.ownTurn):0
 const state=zone==='hand'?'ready':remaining===0?'ready':support!.usableOn>player.ownTurn?'locked':'exhausted'
 return renderEffectCard(card,{zone,combatRules:game.options.combatRules,state,remaining,ready:state==='ready',fresh:newCards.has(card.id),opponent:side!==panelSide(),index,count})
}
function shrineMedallion(card:CardRef,side:Side){
 const player=game.players[side],support=player.support.find(c=>c.id===card.id)!
 const remaining=Math.max(0,support.readyOn-player.ownTurn)
 const state=remaining>0?'exhausted':support.usableOn>player.ownTurn?'locked':'ready'
 const definition=cardDefinitions()[card.definitionId]
 const label=state==='exhausted'?`${remaining} own turn${remaining===1?'':'s'} until ready`:state==='locked'?'Available next own turn':'Ready'
 return `<span class="cm-shrine-medallion" data-medallion-card="${card.id}" data-state="${state}" data-card-category="${definition.category}" role="img" aria-label="${definition.name}: ${label}"><svg class="cm-shrine-leaf" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M10 1h4v5h-1v3h-2v2H8v1H5v-2H3V7h2V5h2V3h3z"/><path fill="#102d2b" d="M11 4h2v1h-2v2H9v2H7v2H5v3H3v-2h1V9h2V7h2V5h3z"/></svg>${pixelCountdown(remaining,'cm-shrine-count')}<span class="cm-shrine-sparks" aria-hidden="true"></span></span>`
}
function bank(side:Side){
 const player=game.players[side],limit=supportLimit(game),own=side===panelSide(),id=own?'cm-support':'cm-opponent-support',humanSide=play.mode==='ai'?play.human:null
 const owner=play.mode==='ai'?(side===humanSide?'own':'opponent'):(side==='w'?'ivory':'charcoal')
 const title=play.mode==='ai'?(side===humanSide?'Your cards':'Opponent’s cards'):`${sideName(side)} cards`
 const active=game.turn===side&&game.phase==='battle'
 return `<section id="${id}" class="cm-support-bank ${own?'cm-bank-own':''}" data-support-side="${side}" data-owner="${owner}" data-active="${active}" style="--slot-count:${limit}" aria-label="${title}; ${sideName(side)} support row"><header><b><i aria-hidden="true"></i>${title}</b><span>${sideName(side)} · ${player.support.length}/${limit}${own?' · install here':''}</span></header>${altarArt(side)}<div class="cm-bank-slots">${Array.from({length:limit},(_,index)=>`<div class="cm-support-slot ${player.support[index]?'cm-slot-occupied':''}" data-slot="${index}" aria-label="${title}, ${sideName(side)} slot ${index+1}${player.support[index]?' occupied':' empty'}">${player.support[index]?cardButton(player.support[index],'support',side)+shrineMedallion(player.support[index],side):own&&intent?.kind==='install'&&index===player.support.length?'<span class="cm-pending-install">Drag an<br>animal</span>':'<span class="cm-slot-empty">+</span>'}</div>`).join('')}</div></section>`
}
function renderTableCards(){
 const previousMedallions=new Map([...document.querySelectorAll<HTMLElement>('.cm-shrine-medallion')].map(node=>[node.dataset.medallionCard,node.dataset.state]))
 const exhausted=new Set([...document.querySelectorAll<HTMLElement>('.cm-support-slot .tcg-exhausted')].map(card=>card.dataset.cardId))
 const near:Side=panelSide(),far:Side=near==='w'?'b':'w',side=panelSide(),hand=game.players[side].hand,animals=reserves(side),showUnits=reinforcement()&&(encounter()?animals.length>0:handTab==='units')
 $('cm-far-bank').innerHTML=bank(far);$('cm-near-bank').innerHTML=bank(near)
 if(!matchMedia('(prefers-reduced-motion:reduce)').matches&&$<HTMLInputElement>('cm-motion').checked)for(const card of document.querySelectorAll<HTMLElement>('.cm-support-slot .tcg-state-ready'))if(exhausted.has(card.dataset.cardId)){const art=card.querySelector('.tcg-card__illustration');art?.animate([{filter:'brightness(.65)'},{filter:'brightness(1)'}],{duration:200,easing:'ease-out'})}
 for(const card of document.querySelectorAll<HTMLElement>('.cm-support-slot [data-card-id]')){const armed=(intent?.kind==='order'||intent?.kind==='install')&&intent.cardId===card.dataset.cardId;card.classList.toggle('cm-order-armed',armed);card.setAttribute('aria-pressed',String(armed))}
 if(!matchMedia('(prefers-reduced-motion:reduce)').matches&&$<HTMLInputElement>('cm-motion').checked)for(const medallion of document.querySelectorAll<HTMLElement>('.cm-shrine-medallion')){const before=previousMedallions.get(medallion.dataset.medallionCard);if(before&&before!==medallion.dataset.state){medallion.dataset.previous=before;medallion.classList.add('cm-medallion-changed');medallion.addEventListener('animationend',event=>{if((event as AnimationEvent).animationName==='cm-leaf-sparks')medallion.classList.remove('cm-medallion-changed')})}}
 $('cm-hand-tabs').hidden=!reinforcement()||Boolean(encounter())
 document.querySelectorAll<HTMLButtonElement>('[data-hand-tab]').forEach(button=>{const active=button.dataset.handTab===handTab;button.setAttribute('aria-pressed',String(active));button.textContent=button.dataset.handTab==='units'?`Animals ${animals.length}`:`Effects ${hand.length}`})
 $('cm-hand').innerHTML=game.phase==='deployment'?'<p class="cm-hand-empty">Your tactical hand is dealt after deployment.</p>':showUnits?animals.map((u,index)=>unitCard(u,{zone:'hand',index,count:animals.length})).join('')||'<p class="cm-hand-empty">Use your ready altar cards.</p>':hand.map((card,index)=>cardButton(card,'hand',side,index,hand.length)).join('')||(encounter()?'<p class="cm-hand-empty">Use your ready altar cards.</p>':'<p class="cm-hand-empty">Hand empty. Your installed cards keep refreshing.</p>')
 $('cm-hand-label').textContent=play.mode==='ai'?'Your hand':`${sideName(side)} hand`
 $('cm-hand-count').textContent=showUnits?`${animals.length} in reserve`:`${hand.length} cards · ${game.players[side].deck.length} in deck`
 $('cm-hand-hint').textContent=(intent?.kind==='order'||intent?.kind==='install')&&intent.unitId?'Drag the highlighted habitat · release on a legal square':intent?.kind==='deploy'?'Choose a highlighted home square · one turn':showUnits?'Hover or tap to read · drag upward to deploy · swipe to browse':drawNote||'Hover or tap to read · drag to your altar to play'
 layoutHand()
}
function layoutHand(){
 const fan=$('cm-hand'),cards=fan.querySelectorAll<HTMLElement>('.tcg-card'),width=cards[0]?.offsetWidth??0
 if(cards.length>1&&width)fan.style.setProperty('--hand-overlap',`${Math.min(width-44,Math.max(0,(cards.length*width-Math.max(100,fan.clientWidth-28))/(cards.length-1)))}px`)
}
function handDropTarget(x:number,y:number,id?:string):HTMLElement|null{
 if(id&&game.players[game.turn].support.some(c=>c.id===id)){
  if(!canAct()||!isCardReady(game,id))return null
  const hit=document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-square]')
  if(!hit)return null
  const choice=supportDropOptions(game,id,hit.dataset.square as Square)
  return choice.effects.length?hit:null
 }
 const animal=id?unit(id):undefined
 if(animal){
  if(!canAct()||!reserves(game.turn).some(u=>u.id===id))return null
  const hit=document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-square]')
  return hit&&legalDeploymentSquares(game,animal.id).includes(hit.dataset.square as Square)?hit:null
 }
 return installDropTarget(x,y)
}
function closeDropChoice(){pendingDrop=null;const choice=$('cm-drop-choice');if(choice){choice.hidden=true;choice.innerHTML=''}}
function showDropChoice(title:string,buttons:string){
 if(!pendingDrop)return
 const box=$('cm-drop-choice');box.innerHTML=`<p>${title}</p><div>${buttons}</div><button id="cm-drop-cancel" class="cm-quiet">Cancel</button>`;box.hidden=false
 const r=document.querySelector<HTMLElement>(`[data-square="${pendingDrop.square}"]`)!.getBoundingClientRect(),w=box.offsetWidth,h=box.offsetHeight
 box.style.left=`${Math.max(8,Math.min(innerWidth-w-8,r.x+r.width/2-w/2))}px`
 box.style.top=`${Math.max(54,Math.min(innerHeight-h-10,r.y-h-12<54?r.bottom+10:r.y-h-12))}px`
 box.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true})
}
function selectDroppedEffect(){
 const drop=pendingDrop;if(!drop||drop.revision!==revision||!canAct()){closeDropChoice();return}
 if(drop.options.effects.length===1){const action=drop.options.effects[0]!;closeDropChoice();openPreview(action);return}
 showDropChoice('Choose the animal casting this effect.',drop.options.effects.map(action=>`<button data-drop-source="${action.sourceUnitId}" class="secondary">${UNIT_DEFINITIONS[unit(action.sourceUnitId!)!.definitionId].name} · ${unit(action.sourceUnitId!)!.square}</button>`).join(''))
}
function selectDroppedOrder(){
 const drop=pendingDrop;if(!drop||drop.revision!==revision||!drop.options.orderUnitId||!canAct()){closeDropChoice();return}
 const id=drop.options.orderUnitId,cardId=drop.cardId;closeDropChoice();intent={kind:'order',cardId,order:'auto',unitId:id};selectedSquare=unit(id)!.square;message();render()
}
function effectAt(cardId:string,square:Square){
 const effects=supportDropOptions(game,cardId,square).effects
 const distance=(action:Extract<Action,{type:'burn'}>)=>{const source=unit(action.sourceUnitId??'')?.square;if(!source)return 0;return (source.charCodeAt(0)-square.charCodeAt(0))**2+(Number(source[1])-Number(square[1]))**2}
 return effects.sort((a,b)=>distance(a)-distance(b)||(a.sourceUnitId??'').localeCompare(b.sourceUnitId??''))[0]
}
function supportDropped(cardId:string,square:Square,origin?:DeploymentOrigin){
 if(!canAct())return
 const action=effectAt(cardId,square);if(action)void commit(action,'human',origin)
}
function armInstall(cardId:string){
 if(!capture()||!canAct()||!actions().some(a=>a.type==='install'&&a.cardId===cardId))return
 closeCardPeek(false);intent=intent?.kind==='install'&&intent.cardId===cardId?null:{kind:'install',cardId};selectedSquare=null;message();render()
}
function armOrder(cardId:string){
 if(!canAct()||!isCardReady(game,cardId))return
 const cancel=(intent?.kind==='order'||intent?.kind==='install')&&intent.cardId===cardId
 closeCardPeek(false);intent=cancel?null:{kind:'order',cardId,order:'auto'};selectedSquare=null;message();render()
 if(!cancel&&!matchMedia('(prefers-reduced-motion:reduce)').matches){const card=document.querySelector<HTMLElement>(`.cm-support-slot [data-card-id="${cardId}"]`);if(card){const base=getComputedStyle(card).transform;card.animate([{transform:base+' rotateY(-90deg)'},{transform:base+' rotateY(0deg)'}],{duration:180,easing:'ease-out'})}}
}
function previewHoverCard(card:HTMLElement){
 if(drag?.isPressed||peekPinned||busy||!ready||document.body.classList.contains('cm-dragging')||pendingDrop)return
 clearTimeout(peekTimer);hoverCandidate=null
 if(card.dataset.cardKind==='unit')reserveClick(card.dataset.unitId!,false);else cardClick(card.dataset.cardId!,card.dataset.zone!,false)
}
function queueHoverCard(card:HTMLElement){
 if(card.dataset.cardId===peekId){clearTimeout(peekTimer);peekTimer=undefined;return}
 if(card.dataset.cardId===dismissedPeekId)return
 if(hoverCandidate===card)return
 clearTimeout(peekTimer);peekTimer=undefined;clearTimeout(hoverSwitchTimer)
 hoverCandidate=card
 hoverSwitchTimer=setTimeout(()=>{const candidate=hoverCandidate;if(candidate?.isConnected&&!peekPinned)previewHoverCard(candidate)},120)
}
function cardRect(element:HTMLElement):DeploymentOrigin{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}}
function closeCardPeek(resume=true){
 peekPlacementSide=undefined
 clearTimeout(peekTimer);peekTimer=undefined;clearTimeout(hoverSwitchTimer);hoverCandidate=null;const wasPinned=peekPinned,id=peekId,hadFocus=$('cm-card-reader')?.contains(document.activeElement)
 peekPinned=false;peekId='';suppressPeekFocus=true;cardLift?.restore();suppressPeekFocus=false;const peek=$('cm-card-reader');if(peek)peek.hidden=true
 const source=id?document.querySelector<HTMLElement>(`#cm-hand [data-card-id="${id}"],.cm-support-slot [data-card-id="${id}"]`):null
 if(resume&&id){dismissedPeekId=id;dismissedPeekRect=source?cardRect(source):undefined}
 source?.setAttribute('aria-expanded','false');source?.removeAttribute('aria-describedby')
 if(resume&&hadFocus&&source){suppressPeekFocus=true;source.focus({preventScroll:true});suppressPeekFocus=false}
 if(resume&&wasPinned)void maybeOpponent()
}
function schedulePeekClose(){
 if(peekPinned||peekTimer)return
 peekTimer=setTimeout(()=>{peekTimer=undefined;if(!peekPinned&&!drag?.isPressed)closeCardPeek(false)},180)
}
function inPeekCorridor(x:number,y:number){
 const peek=$('cm-card-reader'),reader=peek.hidden?null:peek.getBoundingClientRect(),home=cardLift?.homeRect
 if(!reader||!home)return false
 return inInspectionCorridor(x,y,home,reader)
}
function showCardPeek(id:string,pinned:boolean){
 hideUnitHover()
 closeDropChoice();clearTimeout(peekTimer);peekTimer=undefined;clearTimeout(hoverSwitchTimer);hoverCandidate=null;peekId=id;peekPinned=pinned;if(pinned)dismissedPeekId=''
 const source=cardLift?.node?.dataset.cardId===id?cardLift.node:document.querySelector<HTMLElement>(`#cm-hand [data-card-id="${id}"],.cm-support-slot [data-card-id="${id}"]`)
 if(!source)return
 const definition=source.dataset.cardKind==='unit'?unit(id)!.definitionId:cardRef(id).definitionId
 const peek=$('cm-card-reader');peek.hidden=false;peek.style.left='8px';peek.style.top='54px'
 const hadFocus=source===document.activeElement,newlyLifted=cardLift?.node!==source;suppressPeekFocus=true
 const r=cardLift!.lift(source,definition);if(hadFocus)source.focus({preventScroll:true});suppressPeekFocus=false
 const width=peek.offsetWidth,height=Math.min(peek.offsetHeight,innerHeight-70)
 const placement=placeInspection(r,{width,height},{width:innerWidth,height:innerHeight},document.querySelector('.cm-board-wrap')!.getBoundingClientRect(),peekPlacementSide)
 if(placement.side==='left'||placement.side==='right')peekPlacementSide=placement.side
 peek.style.left=`${placement.left}px`;peek.style.top=`${placement.top}px`

 if(newlyLifted&&!hadFocus)cardLift?.animateFromHome()
 source.setAttribute('aria-controls','cm-card-reader');source.setAttribute('aria-describedby','cm-card-context');source.setAttribute('aria-expanded','true')
}

function effectCue(action:Action,origin?:DeploymentOrigin):EffectCardCue|undefined{
 if(!('cardId'in action)||!['install','order','fire','burn'].includes(action.type))return
 const ref=cardRef(action.cardId);if(!ref)return
 const d=cardDefinitions()[ref.definitionId],source=document.querySelector<HTMLElement>(`#cm-hand [data-card-id="${ref.id}"],.cm-support-slot [data-card-id="${ref.id}"],#cm-card-view [data-card-id="${ref.id}"]`),bank=document.querySelector<HTMLElement>(`[data-support-side="${action.player}"]`)
 const r=source?cardRect(source):bank?cardRect(bank):{x:innerWidth/2-48,y:60,width:95,height:140}
 const from=origin??(source&&r.x>=0&&r.x<innerWidth?r:{x:r.x+r.width/2-48,y:r.y,width:95,height:140})
 return {kind:(action.type==='fire'?'order':action.type) as EffectCardCue['kind'],cardId:ref.id,html:renderEffectCard(ref,{zone:action.type==='install'?'hand':'support',state:'ready',combatRules:game.options.combatRules}),from,effect:d.effect,...(action.type==='burn'?{sourceSquare:unit(action.sourceUnitId??'')?.square??undefined,targetSquare:action.targetSquare??unit(action.targetUnitId??'')?.square??undefined}:action.type==='order'||action.type==='fire'?{sourceSquare:unit(action.unitId)?.square??undefined,targetSquare:action.to}:{})}
}
function reserveClick(id:string,pinned=true){
 const animal=unit(id);if(!animal||!reserves(panelSide()).some(u=>u.id===id))return
 if(pinned)pauseOpponent()
 $('cm-card-context').textContent=`Deploy in your first ${animal.role==='p'?'three':'two'} ranks. One turn; no effect card needed.`
 $('cm-card-actions').innerHTML=''
 $('cm-card-context').textContent=`Drag onto your first ${animal.role==='p'?'three':'two'} ranks. Keyboard: Space chooses a deployment square.`
 showCardPeek(id,pinned)
}
function installDropTarget(x:number,y:number):HTMLElement|null{
 if(!canAct()||game.phase!=='battle'||game.players[game.turn].support.length>=supportLimit(game))return null
 const hit=document.elementFromPoint(x,y) as HTMLElement|null,bank=hit?.closest<HTMLElement>('[data-support-side]')
 if(bank)return bank.dataset.supportSide===game.turn?bank:null
 if(hit?.closest('.cm-board-wrap'))return document.querySelector<HTMLElement>(`[data-support-side="${game.turn}"]`)
 return null
}
function unitButton(u:Unit){const d=UNIT_DEFINITIONS[u.definitionId],s=effectiveStats(game,u.id),frame=u.side==='w'?0:20;return `<button class="cm-unit" data-unit-id="${u.id}" style="--species:url('/assets/sprites/${d.species}.webp');--sprite-x:${frame%4/3*100}%;--sprite-y:${Math.floor(frame/4)/9*100}%"><i aria-hidden="true"></i><b>${animalName(u)}</b><small>${capture()?ROLE_NAMES[u.role]+' · '+(u.statuses.map(x=>({guarded:'Guard',inspired:'Pierce',rooted:'Rooted',poison:''})[x.kind]).filter(Boolean).join(' · ')||'Instant capture'):`${ROLE_NAMES[u.role]} · HP ${s.hp}/${s.maxHp} · ATK ${s.atk} · DEF ${s.def}`}</small></button>`}

function setSquares(){
 for(const square of squares){const button=document.createElement('button');button.dataset.square=square;button.onclick=()=>squareClick(square);button.onfocus=()=>{focusSquare=square;renderer.setFocus(square)};button.onblur=()=>renderer.setFocus(null);button.onkeydown=e=>navigate(e,square);$('cm-squares').append(button)}
 positionSquares()
}
function positionSquares(){for(const square of squares){const p=renderer.getSquarePolygon(square),l=Math.min(...p.map(x=>x.x)),t=Math.min(...p.map(x=>x.y)),w=Math.max(...p.map(x=>x.x))-l,h=Math.max(...p.map(x=>x.y))-t,b=document.querySelector<HTMLButtonElement>(`[data-square="${square}"]`)!;b.style.cssText=`left:${l*100}%;top:${t*100}%;width:${w*100}%;height:${h*100}%;clip-path:polygon(${p.map(x=>`${(x.x-l)/w*100}% ${(x.y-t)/h*100}%`).join(',')})`}}
function navigate(e:KeyboardEvent,s:Square){if(e.key==='Escape'){clearIntent();return}const dx=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0,dy=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;if(!dx&&!dy)return;e.preventDefault();const order=flipped?[...squares].reverse():squares,i=order.indexOf(s),n=order[Math.max(0,Math.min(7,Math.floor(i/8)+dy))*8+Math.max(0,Math.min(7,i%8+dx))];focusSquare=n;document.querySelectorAll<HTMLButtonElement>('#cm-squares button').forEach(b=>b.tabIndex=b.dataset.square===n?0:-1);document.querySelector<HTMLButtonElement>(`[data-square="${n}"]`)!.focus()}
function clearIntent(){habitatDrag?.cancel();$('cm-preview').hidden=true;intent=null;preview=null;selectedSquare=null;message();render()}
function hideUnitHover(){
 clearTimeout(unitHoverTimer);unitHoverTimer=undefined;unitHoverId=''
 if(unitHoverSquare?.getAttribute('aria-describedby')==='cm-unit-hover')unitHoverSquare.removeAttribute('aria-describedby')
 unitHoverSquare=null
 const tooltip=$('cm-unit-hover');if(tooltip){tooltip.hidden=true;tooltip.removeAttribute('data-unit-id');tooltip.removeAttribute('data-square')}
}
function fieldExplanation(square:Square):string{
 const sections:{title:string;copy:string}[]=[],goal=encounter(),obstacle=game.obstacles?.[square],terrain=game.terrain[square],item=game.items[square]
 if(goal?.markedSquare===square){
  const copy=goal.id==='tower'?'Defeat the marked sentinel, then bring any of your animals to e5 within 4 actions.':goal.id==='rescue'?'Bring your king to c3 within 2 actions.':goal.id==='crossing'?'Keep your king on d1 through 3 enemy turns. Leaving this square loses the encounter.':'Capture the marked turtle within 2 actions.'
  sections.push({title:`Encounter goal · ${square}`,copy:copy+' This marker is an objective, not a terrain bonus.'})
 }
 if(obstacle)sections.push(obstacle.kind==='wall'?{title:'Stone wall',copy:'Blocks landing, sliding paths and line of sight. Hares can jump over it using their normal L move, but cannot land here. Trailbreaker can permanently demolish an unoccupied wall directly ahead of a pawn.'}:{title:obstacle.spent?'Spent watchtower':'Watchtower · one shot',copy:obstacle.spent?'Its shot has been used. Animals can still land on the roof, but the tower blocks paths through this square. The shot does not refresh when a new animal arrives.':'Land on the roof, then select a ready altar card and choose Fire: one stationary shot up to 2 squares along a clear rank, file or diagonal. It exhausts the card and Roots the shooter through its next own turn. The tower blocks paths through its square.'})
 if(terrain){const remaining=Math.max(0,terrain.expiresOnOwnStart-game.players[terrain.side].ownTurn);sections.push({title:terrain.kind==='smoke'?'Smoke Veil':'Fallen Log',copy:(terrain.kind==='smoke'?`Animals can move onto this square. Smoke blocks ${capture()?'sliding captures and ranged line of sight':'ranged line of sight'}, including attacks into this square.`:'Blocks movement, landing and line of sight.')+` Clears at the start of ${sideName(terrain.side)}’s ${remaining===1?'next turn':`turn ${terrain.expiresOnOwnStart}`}.`})}
 if(item)sections.push({title:`${sideName(item.side)}’s Bramble Snare`,copy:'The next enemy that ends movement here is Rooted through its next own turn. The snare is consumed when triggered; friendly animals do not trigger it.'})
 return sections.map(section=>`<section class="cm-field-explanation"><h3>${section.title}</h3><p>${section.copy}</p></section>`).join('')
}
function queueUnitHover(square:HTMLElement|null){
 const coordinate=square?.dataset.square as Square|undefined,animal=coordinate?game.units.find(u=>u.square===coordinate&&u.hp>0):null
 if(!coordinate||(!animal&&!fieldExplanation(coordinate))||unitHoverPressed||!ready||busy||peekPinned||document.hidden||document.querySelector('dialog[open]')||document.body.classList.contains('cm-dragging')){hideUnitHover();return}
 const hoverId=animal?.id??`field:${coordinate}`
 if(unitHoverId===hoverId&&unitHoverSquare===square)return
 hideUnitHover();unitHoverId=hoverId;unitHoverSquare=square
 unitHoverTimer=setTimeout(()=>{
  unitHoverTimer=undefined
  const current=game.units.find(u=>u.square===coordinate&&u.hp>0),explanation=fieldExplanation(coordinate)
  if((!current&&!explanation)||busy||unitHoverPressed||document.hidden||document.querySelector('dialog[open]')){hideUnitHover();return}
  closeCardPeek(false)
  const tooltip=$('cm-unit-hover')
  tooltip.innerHTML=current?unitCard(current):explanation
  tooltip.setAttribute('aria-label',current?(capture()?'Animal abilities and square details':'Animal health and square details'):'Square details')
  if(current)tooltip.dataset.unitId=current.id
  tooltip.dataset.square=coordinate;tooltip.hidden=false
  square?.setAttribute('aria-describedby','cm-unit-hover')
  const r=square!.getBoundingClientRect(),width=tooltip.offsetWidth,height=tooltip.offsetHeight
  const placement=placeInspection(r,{width,height},{width:innerWidth,height:innerHeight},document.querySelector('.cm-board-wrap')!.getBoundingClientRect())
  tooltip.style.left=`${placement.left}px`;tooltip.style.top=`${placement.top}px`
 },500)
}
function inspectUnit(id:string){const u=unit(id);if(!u)return;const d=UNIT_DEFINITIONS[u.definitionId],stats=effectiveStats(game,id);$('cm-unit-title').textContent=`${sideName(u.side)} · ${animalName(u)}`;$('cm-unit-copy').innerHTML=unitCard(u)+`<p>${u.square??'Not deployed'}</p>`+(capture()?`<p>${u.statuses.map(x=>({guarded:'Guard: prevents one capture.',inspired:'Pierce: next capture bypasses Guard.',rooted:'Rooted: cannot move or capture.',poison:''})[x.kind]).filter(Boolean).join(' ')||'No active effects.'}</p>`:`<p>Equipment: ${[u.equipment.weapon?'Weapon +1 ATK':'',u.equipment.armor?'Armor +1 DEF':''].filter(Boolean).join(', ')||'none'}</p><p>Status: ${u.statuses.map(s=>`${s.kind}${s.remaining?` (${s.remaining} ticks)`:s.expiresAtOwnEnd?` (through own turn ${s.expiresAtOwnEnd})`:''}`).join(', ')||'none'}${u.veteran?' · Veteran':''}</p>`);pauseOpponent();$<HTMLDialogElement>('cm-unit-details').showModal()}
function squareClick(square:Square){
 if(!ready||busy||thinking)return
 if(!intent){const u=game.units.find(x=>x.square===square&&x.hp>0);if(u){selectedSquare=square;render();inspectUnit(u.id)}else if(fieldExplanation(square))queueUnitHover(document.querySelector<HTMLElement>(`#cm-squares [data-square="${square}"]`));return}
 if(!canAct())return
 if(intent.kind==='order'||intent.kind==='install'){const u=game.units.find(x=>x.square===square);if(u?.side===game.turn){intent={...intent,unitId:u.id};selectedSquare=square;render();return}}
 if(intent.kind==='burn'&&cardDefinitions()[cardRef(intent.cardId).definitionId].target!=='friendly'){const u=game.units.find(x=>x.square===square);if(u?.side===game.turn){intent={...intent,sourceId:u.id};selectedSquare=square;render();return}}
 const chosen=actions().find(a=>matchesIntent(a)&&(a.type==='fire'||a.type==='order'||a.type==='deploy'||a.type==='install'?a.to===square:a.type==='burn'?(a.targetSquare===square||unit(a.targetUnitId??'')?.square===square):false))
 if(chosen?.type==='fire')void commit(chosen,'human');else if(chosen)openPreview(chosen);else message('Choose a highlighted legal target.')
}
function cardClick(id:string,zone:string,pinned=true){
 if(!ready||busy)return
 const ref=cardRef(id);if(!ref)return
 const owner=(['w','b'] as Side[]).find(side=>game.players[side].hand.some(c=>c.id===id)||game.players[side].support.some(c=>c.id===id));if(!owner)return
 if(pinned)pauseOpponent()
 const p=game.players[owner],support=p.support.find(c=>c.id===id),d=cardDefinitions()[ref.definitionId]
 const available=owner===game.turn&&canAct(),readyCard=Boolean(support&&Math.max(support.usableOn,support.readyOn)<=p.ownTurn)
 const legal=available?actions():[],install=legal.some(a=>a.type==='install'&&a.cardId===id),burn=legal.some(a=>a.type==='burn'&&a.cardId===id)
 const state=zone==='hand'?'locked':readyCard?'ready':support!.usableOn>p.ownTurn?'locked':'exhausted'
 $('cm-card-context').textContent=zone==='hand'?`${d.category} · Play here first, then use on your next turn.${p.support.length>=supportLimit(game)?' Your altar is full.':''}`:!available?`${sideName(owner)} support · ${readyCard?'ready':'unavailable until own turn '+Math.max(support!.usableOn,support!.readyOn)}. You can inspect this card; actions are available on its owner’s turn.`:readyCard?`Exhaust: keep this card, cooldown ${d.cooldown}. Effect: discard it.`:`This card is unavailable until your own turn ${Math.max(support!.usableOn,support!.readyOn)}. It cannot order a unit or use its effect yet.`
 $('cm-card-actions').innerHTML=''
 $('cm-card-context').textContent=zone==='hand'?`${d.category} · Drag this card to your altar. Keyboard: Space opens its placement confirmation.`:readyCard&&available?`Click this card to prepare an animal order. Drag it onto a valid target to cast its effect. Keyboard: Space orders · E uses the effect.`:$('cm-card-context').textContent
 showCardPeek(id,pinned)
}

function openPreview(action:Action){
 if(!canAct())return
 closeDropChoice()
 const p=previewAction(game,action);if(!p.legal){message(p.reason);return}
 preview=action
 const target=action.type==='burn'&&action.targetUnitId?unit(action.targetUnitId):action.type==='order'?game.units.find(u=>u.square===action.to):undefined,card='cardId'in action?cardDefinitions()[cardRef(action.cardId).definitionId]:undefined
 $('cm-preview-copy').textContent=(action.type==='install'?`Install ${card!.name}. ${card!.description} It cannot be used until your next own turn.`:action.type==='burn'?`Burn ${card!.name}${target?` on ${animalName(target)}`:''}. ${card!.description} This card is permanently discarded.`:action.type==='order'?`${animalName(unit(action.unitId)!)}: ${action.kind} to ${action.to}. ${p.damage!==undefined?`Damage ${p.damage}; target HP ${p.defenderHpAfter}. `:''}Final square ${p.attackerEnd}. ${card!.name} skips your next ${card!.cooldown} own turns.`:action.type==='deploy'?`Deploy ${animalName(unit(action.unitId)!)} to ${action.to}.`:p.summary)+(action.type==='deploy'&&game.phase==='deployment'?' Deployment alternates.':' One committed action ends this turn.')
 if(capture())$('cm-preview-copy').textContent=`${p.summary}${action.type==='install'?` Install ${card!.name} and ${action.kind} to ${action.to}; the card enters cooldown.`:''} One action ends your turn.`
 closeCardPeek(false);$('cm-preview').hidden=false;$<HTMLButtonElement>('cm-confirm').focus({preventScroll:true})
}
function drawFeedback(){
 const dealt=game.lastEvents.some(e=>e.type==='deal'),draws=game.lastEvents.filter(e=>e.type==='draw'&&e.cardId)
 if(dealt){drawNote='Opening hands dealt · five cards each.';for(const side of ['w','b'] as Side[])for(const card of game.players[side].hand)newCards.add(card.id)}
 if(draws.length){for(const draw of draws)newCards.add(draw.cardId!);drawNote=draws.map(e=>`${sideName(e.side!)} drew ${cardDefinitions()[cardRef(e.cardId!).definitionId].name}.`).join(' ')}
}
async function commit(action:Action,origin:'human'|'ai',deploymentOrigin?:DeploymentOrigin){
 if(!ready||busy||thinking||game.phase==='finished'||origin==='human'&&!canAct()||origin==='ai'&&!isAiTurn())return
 const before=game,token=++revision
 const cue=effectCue(action,deploymentOrigin)
 if(action.type==='deploy'&&!deploymentOrigin){
  const source=origin==='human'?document.querySelector<HTMLElement>(`#cm-hand [data-unit-id="${action.unitId}"],#cm-card-view [data-unit-id="${action.unitId}"],.cm-unit-row [data-unit-id="${action.unitId}"]`):null
  const rect=source?.getBoundingClientRect()
  if(rect&&rect.width&&rect.right>0&&rect.left<innerWidth&&rect.bottom>0&&rect.top<innerHeight)deploymentOrigin={x:rect.x,y:rect.y,width:rect.width,height:rect.height}
 }
 try{
  game=applyAction(game,action);busy=true;preview=null;intent=null;selectedSquare=null;newCards.clear();drawNote='';message();drawFeedback();save();render()
  if(cue?.kind==='install'){const landed=document.querySelector<HTMLElement>(`[data-support-side="${action.player}"] [data-card-id="${cue.cardId}"]`);if(landed)cue.to=cardRect(landed)}
  await renderer.animate(before,game,game.lastEvents,deploymentOrigin,cue)
  if(token!==revision)return
  if(game.phase==='finished'){if(game.winner!=='draw')sound.win();await renderer.celebrate(game.winner!);if(token===revision)showResult()}
 }catch(error){if(token===revision)message(error instanceof Error?error.message:'Action failed.')}
 finally{if(token===revision){busy=false;render();void maybeOpponent()}}
}
async function maybeOpponent(){
 if(!ready||busy||thinking||aiFailed||!isAiTurn()||paused())return
 const token=revision,position=game.ply,side=game.turn
 thinking=true;render()
 try{
  const [action]=await Promise.all([opponent.choose(game,play.difficulty),new Promise<void>(resolve=>setTimeout(resolve,260))])
  if(token!==revision||position!==game.ply||side!==game.turn)return
  thinking=false
  if(paused()){render();return}
  await commit(action,'ai')
 }catch(error){
  if(token!==revision)return
  thinking=false
  if((error as Error).name!=='AbortError'){aiFailed=true;message('The opponent paused. Retry to continue.')}
  render()
 }
}
function pauseOpponent(){if(!thinking)return;++revision;opponent.cancel();thinking=false;render()}
function interrupt(){habitatDrag?.cancel();drag?.cancel();++revision;opponent.cancel();thinking=false;busy=false;aiFailed=false;intent=null;preview=null;selectedSquare=null;renderer.cancel(game);sound.stop();$('cm-preview').hidden=true;closeCardPeek(false);for(const id of ['cm-result','cm-unit-details'])$<HTMLDialogElement>(id).close()}
function savedRaw(){try{return localStorage.getItem(SAVE)}catch{return null}}
function save(){try{localStorage.setItem(SAVE,serializeSession(game,play))}catch{message('Save failed — export JSON replay.')}}
function showResult(){
 const episode=encounter(),won=game.winner==='w'
 $('cm-result-title').textContent=episode?(won?'Encounter complete':'Try another approach'):'Match complete'
 $('cm-result-copy').textContent=episode?`${episode.title} · ${game.finishReason}`:game.winner==='draw'?`Draw — ${game.finishReason}`:`${sideName(game.winner!)} wins — ${game.finishReason}`
 $('cm-play-again').textContent=episode?'Restart encounter':'Play again'
 $('cm-next-encounter').hidden=!episode||!won||ENCOUNTER_ORDER.indexOf(episode.id)===ENCOUNTER_ORDER.length-1
 $('cm-choose-encounter').hidden=!episode
 $('cm-preview').hidden=true;closeCardPeek(false);for(const id of ['cm-menu','cm-setup'])$<HTMLDialogElement>(id).close();$<HTMLDialogElement>('cm-result').showModal()
}

function undo(){
 const baseline=!game.options.encounterId&&game.options.armyMode==='full'?32:0
 if(game.log.length<=baseline)return
 interrupt();let end=game.log.length-1
 if(play.mode==='ai'){while(end>baseline&&game.log[end].player!==play.human)end--}
 const log=game.log.slice(0,end),next=createGame(game.options);game=log.reduce((state,action)=>applyAction(state,action),next)
 drawNote='Last decision undone.';newCards.clear();save();render();void maybeOpponent()
}

function rosterDetails(){document.querySelectorAll<HTMLSelectElement>('[data-roster]').forEach(el=>{const d=UNIT_DEFINITIONS[el.value];el.parentElement!.querySelector('.cm-variant-info')!.textContent=`HP ${d.hp} · ATK ${d.atk} · DEF ${d.def} · ${d.combat}${d.combat==='ranged'?` ${d.range}`:''}. ${d.description}`})}
function updateCodex(){
 const paragraphs=$('cm-codex').querySelectorAll(':scope > p')
 paragraphs[0].textContent=encounter()?encounter()!.objective+' '+encounter()!.briefing:'Skirmishes begin in the standard chess formation. Older reinforcement saves keep their reserve deployment rules.'
 paragraphs[1].textContent=encounter()?'Encounters have fixed starting positions, curated cards and authored enemy replies. Every action uses the same rules as skirmishes.':'Five tactical cards start in hand. Draw one every third own turn, until the deck is empty.'
 paragraphs[2].textContent=capture()?'Installing a card includes one move or capture and leaves that card exhausted. On later turns, click a ready altar card to prepare another animal order, or drag it onto a legal target to cast its effect and discard it. Three altar slots. Every committed action ends your turn.':'Install from your hand; on a later own turn exhaust a ready support to move or attack, or burn its printed effect and discard it. Three altar slots. One action per turn.'
 paragraphs[3].textContent=capture()?'Legal attacks capture immediately. Guard absorbs one capture; the attacker stays at source. Pierce bypasses Guard. Root prevents moving and capturing. Smoke blocks rook, bishop and queen attack rays, but can be crossed by movement. Capture the enemy king to win; no check, castling or en passant. Last-rank rats become Fox Queens.':'Damage = max(1, ATK − DEF). Surviving melee defenders remain; sliders approach before them. Ranged units stay at source. Defeat the enemy king. Last-rank rats become Veterans.'
 $('cm-codex').querySelector('.cm-codex-cards')!.innerHTML=STARTER_DECK.map(id=>{const d=cardDefinitions()[id];return `<article><h3>${d.name} · Cooldown ${d.cooldown}</h3><p>${d.description}</p><small>${d.targetHint}</small></article>`}).join('')
}
function selectedOpening(){return [...document.querySelectorAll<HTMLInputElement>('input[name="opening-card"]:checked')].map(input=>input.value)}
function updateSetup(){
 const episode=$<HTMLSelectElement>('cm-match-kind').value==='encounter'
 $('cm-encounter-picker').hidden=!episode;$('cm-skirmish-settings').hidden=episode
 const encounterSelected=ENCOUNTERS[selectedEncounter];$('cm-encounter-intro').textContent=encounterSelected.briefing
 $('cm-encounter-tools').textContent=selectedEncounter==='blockade'?'Ready altar: Piercing Banner · Hand: Smoke Veil':selectedEncounter==='rescue'?'Ready altar: Wild Herbs · Hand: Piercing Banner':selectedEncounter==='tower'?'Ready altar: Trailbreaker, Reserve Order, Smoke Veil · Tower d3 · Wall c2':'Ready altar: Iron Shield, Spring Ward · Reserve: one Trail Rat'
 document.querySelectorAll<HTMLElement>('[data-encounter-id]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.encounterId===selectedEncounter)))
 const rules=$<HTMLSelectElement>('cm-combat-rules').value as CombatRules,defs=getCardDefinitions(rules)
 $('cm-combat-help').textContent=rules==='capture'?'Instant captures. Guard blocks one capture; Pierce bypasses Guard. Installing a card includes one animal order. Capture the king to win.':'Original HP combat with attack, defense, healing and ranged variants.'
 document.querySelectorAll<HTMLInputElement>('input[name="opening-card"]').forEach(input=>{const d=defs[input.value];input.parentElement!.querySelector('b')!.textContent=d.name;input.parentElement!.querySelector('small')!.textContent=`Cooldown ${d.cooldown} · ${d.description}`})
 document.querySelector<HTMLElement>('.cm-army-builder')!.hidden=rules==='capture'
 $('cm-army-mode-help').textContent=$<HTMLSelectElement>('cm-army-mode').value==='reinforcement'?'Kings start on the board. Deploy your other animals from hand, one per turn.':'Begin immediately in the standard chess formation. No placement phase.'
 $('cm-start-deployment').textContent=episode?'Start encounter':$<HTMLSelectElement>('cm-army-mode').value==='reinforcement'?'Start sandbox':'Start skirmish'
 $('cm-ai-settings').hidden=$<HTMLSelectElement>('cm-play-mode').value!=='ai'
 const mode=$<HTMLSelectElement>('cm-hand-mode').value,selected=selectedOpening()
 $('cm-opening-builder').hidden=mode!=='selected'
 $('cm-opening-count').textContent=`${selected.length}/5 selected${selected.length===5?' · ready to deal':''}`
 document.querySelectorAll<HTMLInputElement>('input[name="opening-card"]').forEach(input=>input.disabled=selected.length>=5&&!input.checked)
 $<HTMLButtonElement>('cm-start-deployment').disabled=!episode&&mode==='selected'&&selected.length!==5
 try{const state=createGame({seed:Number($<HTMLInputElement>('cm-seed').value),...(mode==='balanced'?{openingHand:[...BALANCED_OPENING]}:mode==='selected'?{openingHand:selected}:{})});$('cm-opening-preview').textContent=state.players.w.hand.map(c=>defs[c.definitionId].name).join(' · ')}catch{$('cm-opening-preview').textContent=mode==='selected'?'Choose exactly five cards to deal.':'Enter a whole-number seed from 0 to 4294967295.'}
}
function fillSetup(reshuffle:boolean){
 const query=new URLSearchParams(location.search),requested=query.get('encounter')
 selectedEncounter=isEncounterId(requested)?requested:game.options.encounterId??'blockade'
 $<HTMLSelectElement>('cm-match-kind').value=isEncounterId(requested)?'encounter':query.has('rules')||query.has('skirmish')?'skirmish':'encounter'
 for(const side of ['w','b'] as Side[])document.querySelectorAll<HTMLSelectElement>(`[data-roster="${side}"]`).forEach((el,index)=>el.value=game.options.rosters[side][index])
 $<HTMLInputElement>('cm-seed').value=String(reshuffle?randomSeed():game.options.seed)
 $<HTMLSelectElement>('cm-play-mode').value=play.mode;$<HTMLSelectElement>('cm-difficulty').value=play.difficulty;$<HTMLSelectElement>('cm-human').value=play.human
 $<HTMLSelectElement>('cm-combat-rules').value=new URLSearchParams(location.search).get('rules')==='capture'?'capture':reshuffle?'capture':game.options.combatRules??'hp'
 $<HTMLSelectElement>('cm-army-mode').value=game.options.armyMode??'full'
 const chosen=game.options.openingHand??BALANCED_OPENING
 document.querySelectorAll<HTMLInputElement>('input[name="opening-card"]').forEach(input=>input.checked=chosen.includes(input.value))
 $<HTMLSelectElement>('cm-hand-mode').value=game.options.openingHand?JSON.stringify(game.options.openingHand)===JSON.stringify(BALANCED_OPENING)?'balanced':'selected':'shuffled'
 rosterDetails();updateSetup()
}
function openSetup(reshuffle=true){interrupt();$<HTMLDialogElement>('cm-menu').close();fillSetup(reshuffle);$('cm-setup-error').textContent='';$<HTMLDialogElement>('cm-setup').showModal();render()}
function start(){
 const rosters:Record<Side,string[]>={w:[],b:[]}
 for(const side of ['w','b'] as Side[])document.querySelectorAll<HTMLSelectElement>(`[data-roster="${side}"]`).forEach(el=>rosters[side].push(el.value))
 try{
  const handMode=$<HTMLSelectElement>('cm-hand-mode').value,openingHand=handMode==='balanced'?[...BALANCED_OPENING]:handMode==='selected'?selectedOpening():undefined
  const episode=$<HTMLSelectElement>('cm-match-kind').value==='encounter'
  let next=episode?createGame({encounterId:selectedEncounter}):createGame({seed:Number($<HTMLInputElement>('cm-seed').value),rosters,combatRules:$<HTMLSelectElement>('cm-combat-rules').value as CombatRules,armyMode:$<HTMLSelectElement>('cm-army-mode').value as 'full'|'reinforcement',...(openingHand?{openingHand}:{})})
  if(!episode&&next.options.armyMode==='full')next=autoDeployRemaining(next)
  const nextPlay:PlaySettings=episode?{mode:'ai',human:'w',difficulty:'normal'}:{mode:$<HTMLSelectElement>('cm-play-mode').value as PlaySettings['mode'],human:$<HTMLSelectElement>('cm-human').value as Side,difficulty:$<HTMLSelectElement>('cm-difficulty').value as PlaySettings['difficulty']}
  if(!['ai','local'].includes(nextPlay.mode)||!['w','b'].includes(nextPlay.human)||!['easy','normal','hard'].includes(nextPlay.difficulty))throw new Error('Choose valid opponent settings.')
  interrupt();game=next;play=nextPlay;handTab='units';flipped=play.mode==='ai'&&play.human==='b';renderer.setFlipped(flipped);positionSquares();drawNote='';newCards.clear();drawFeedback();message();save();$<HTMLDialogElement>('cm-setup').close();history.replaceState(null,'','/?mode=checkmate');render();void maybeOpponent()
 }catch(error){$('cm-setup-error').textContent=error instanceof Error?error.message:'Invalid setup.';$('cm-setup-error').scrollIntoView({block:'nearest'})}
}
function restartMatch(){
 const options=game.options;interrupt();game=createGame(options)
 if(!options.encounterId&&options.armyMode!=='reinforcement')game=autoDeployRemaining(game)
 handTab='units';drawNote='';newCards.clear();drawFeedback();message();save()
 for(const id of ['cm-result','cm-menu','cm-encounter-brief'])$<HTMLDialogElement>(id).close()
 render();void maybeOpponent()
}
function showEncounterBrief(){const e=encounter();if(!e)return;$('cm-encounter-title').textContent=e.title;$('cm-encounter-objective').textContent=e.objective;$('cm-encounter-copy').textContent=e.briefing;$('cm-encounter-hint').textContent=e.hint;$<HTMLDialogElement>('cm-menu').close();$<HTMLDialogElement>('cm-encounter-brief').showModal()}
function beginEncounter(id:EncounterId){
 interrupt();game=createGame({encounterId:id});play={mode:'ai',human:'w',difficulty:'normal'};selectedEncounter=id;handTab='units';flipped=false;renderer.setFlipped(false);positionSquares();drawNote='';newCards.clear();message();save();$<HTMLDialogElement>('cm-result').close();render();void maybeOpponent()
}
function exportReplay(){const url=URL.createObjectURL(new Blob([serializeGame(game)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='project-checkmate.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}

function bind(){
 $('cm-objectives').addEventListener('click',event=>{const hit=event.target as HTMLElement;if(hit.closest('summary'))goalUserOpen=!$<HTMLDetailsElement>('cm-objectives').open;if(hit.closest('[data-objective-hint]')){pauseOpponent();showEncounterBrief();$<HTMLDetailsElement>('cm-encounter-brief').querySelector('details')!.open=true}})
 $('cm-objectives').addEventListener('toggle',()=>{const portraitRoom=innerWidth<600&&innerHeight>=innerWidth+450;document.querySelector<HTMLElement>('.cm-game')!.dataset.goalSpace=$<HTMLDetailsElement>('cm-objectives').open&&portraitRoom?'reserved':'overlay'})
 window.addEventListener('resize',renderObjectives)
 cardLift=new CardLift($('cm-card-view'))
 document.addEventListener('pointermove',event=>{
  if(event.pointerType!=='mouse'||!matchMedia('(hover:hover) and (pointer:fine)').matches||event.buttons){hideUnitHover();return}
  queueUnitHover((event.target as HTMLElement).closest<HTMLElement>('#cm-squares [data-square]'))
 })
 document.addEventListener('pointerdown',()=>{unitHoverPressed=true;hideUnitHover()},true)
 document.addEventListener('pointerup',()=>{unitHoverPressed=false},true)
 document.addEventListener('pointercancel',()=>{unitHoverPressed=false;hideUnitHover()},true)
 document.addEventListener('pointerout',event=>{if(!event.relatedTarget)hideUnitHover()})
 document.addEventListener('focusin',event=>{const square=(event.target as HTMLElement).closest<HTMLElement>('#cm-squares [data-square]');if(square)queueUnitHover(square)})
 document.addEventListener('focusout',event=>{if(event.target===unitHoverSquare)hideUnitHover()})
 document.addEventListener('keydown',event=>{if(event.key==='Escape')hideUnitHover()})
 document.addEventListener('visibilitychange',hideUnitHover)
 window.addEventListener('blur',()=>{unitHoverPressed=false;hideUnitHover()})
 window.addEventListener('resize',hideUnitHover)
 window.addEventListener('scroll',()=>{hideUnitHover();closeDropChoice();closeCardPeek()},{passive:true})
 window.addEventListener('resize',()=>{layoutHand();closeDropChoice();closeCardPeek()})
 $('cm-card-reader').addEventListener('pointerenter',()=>{clearTimeout(peekTimer);peekTimer=undefined;clearTimeout(hoverSwitchTimer);hoverCandidate=null})
 $('cm-card-reader').addEventListener('pointerdown',()=>{clearTimeout(hoverSwitchTimer);hoverCandidate=null;peekPinned=true})
 document.addEventListener('pointerout',event=>{if(!event.relatedTarget){clearTimeout(hoverSwitchTimer);hoverCandidate=null;schedulePeekClose()}})
 document.addEventListener('pointerover',event=>{
  if(drag?.isPressed||hoverAwaitMove||!matchMedia('(hover:hover) and (pointer:fine)').matches||peekPinned||busy||!ready||pendingDrop||document.body.classList.contains('cm-dragging')||document.querySelector('dialog[open]'))return
  const card=(event.target as HTMLElement).closest<HTMLElement>('#cm-hand [data-card-id],.cm-support-slot [data-card-id],#cm-card-view [data-card-id]')
  if(card&&card.dataset.cardId!==dismissedPeekId&&!(event.relatedTarget instanceof Node&&card.contains(event.relatedTarget)))queueHoverCard(card)
 })
 document.addEventListener('pointermove',event=>{
  if(hoverAwaitMove&&(event.clientX!==lastPointer.x||event.clientY!==lastPointer.y)){hoverAwaitMove=false;const card=(event.target as HTMLElement).closest<HTMLElement>('#cm-hand [data-card-id],.cm-support-slot [data-card-id]');if(card&&matchMedia('(hover:hover) and (pointer:fine)').matches&&!peekPinned&&!busy&&ready&&!document.querySelector('dialog[open]'))queueHoverCard(card)}
  const r=dismissedPeekRect;if(dismissedPeekId&&(!r||event.clientX<r.x||event.clientX>r.x+r.width||event.clientY<r.y||event.clientY>r.y+r.height))dismissedPeekId=''
  lastPointer={x:event.clientX,y:event.clientY}
  if(drag?.isPressed||peekPinned||busy||!ready||document.body.classList.contains('cm-dragging')||document.querySelector('dialog[open]'))return
  const card=(event.target as HTMLElement).closest<HTMLElement>('#cm-hand [data-card-id],.cm-support-slot [data-card-id]')
  const inReader=Boolean((event.target as HTMLElement).closest('#cm-card-reader'))
  if(inReader){clearTimeout(peekTimer);peekTimer=undefined;clearTimeout(hoverSwitchTimer);hoverCandidate=null;return}
  if(card){queueHoverCard(card);return}
  clearTimeout(hoverSwitchTimer);hoverCandidate=null
  if(inPeekCorridor(event.clientX,event.clientY)){clearTimeout(peekTimer);peekTimer=undefined}else if(! $('cm-card-reader').hidden)schedulePeekClose()

 })
 document.addEventListener('keydown',event=>{
  const card=(event.target as HTMLElement).closest<HTMLElement>('#cm-hand [data-card-id],.cm-support-slot [data-card-id],#cm-card-view [data-card-id]')
  if(!card||event.altKey||event.ctrlKey||event.metaKey)return
  const id=card.dataset.cardId!,zone=card.dataset.zone??'hand'
  if(event.key==='Enter'){event.preventDefault();if(card.dataset.cardKind==='unit')reserveClick(card.dataset.unitId!,true);else cardClick(id,zone,true);return}
  if(!canAct()||(zone==='support'&&!game.players[game.turn].support.some(ref=>ref.id===id)))return
  if(event.key===' '){event.preventDefault();if(card.dataset.cardKind==='unit'){closeCardPeek();intent={kind:'deploy',unitId:card.dataset.unitId!};selectedSquare=null;render();return}if(zone==='hand'){if(capture()){armInstall(id);return}const action=actions().find(a=>a.type==='install'&&a.cardId===id);if(action)openPreview(action);return}if(isCardReady(game,id)){closeCardPeek();intent={kind:'order',cardId:id,order:'auto'};selectedSquare=null;message();render()}return}
  if((event.key==='e'||event.key==='E')&&zone==='support'&&isCardReady(game,id)){event.preventDefault();closeCardPeek();intent={kind:'burn',cardId:id};selectedSquare=null;message();render()}
 })
 document.addEventListener('focusin',event=>{if(drag?.isPressed||suppressPeekFocus||peekPinned||busy||!ready||document.body.classList.contains('cm-dragging')||document.querySelector('dialog[open]'))return;const card=(event.target as HTMLElement).closest<HTMLElement>('#cm-hand [data-card-id],.cm-support-slot [data-card-id],#cm-card-view [data-card-id]');if(card){if(card.dataset.cardKind==='unit')reserveClick(card.dataset.unitId!,false);else cardClick(card.dataset.cardId!,card.dataset.zone!,false)}})
 document.addEventListener('pointerdown',event=>{if(!(event.target as HTMLElement).closest('#cm-card-reader,[data-card-id]'))closeCardPeek()})
 document.addEventListener('focusout',()=>queueMicrotask(()=>{if(!suppressPeekFocus&&!peekPinned&&!document.activeElement?.closest('#cm-card-reader,[data-card-id]'))schedulePeekClose()}))
 drag=new CardDrag({
  enabled:()=>canAct()&&game.phase==='battle',revision:()=>revision,
  card:id=>{const u=reserves(panelSide()).find(u=>u.id===id),p=game.players[panelSide()];return u?{id:u.id,definitionId:u.definitionId}:[...p.hand,...p.support].find(c=>c.id===id)},
  canDrag:(id,zone)=>zone==='hand'||isCardReady(game,id),
  render:id=>{const u=unit(id);return u?unitCard(u):renderEffectCard(cardRef(id),{zone:'hand',state:'ready',combatRules:game.options.combatRules})},
  caption:(id,target)=>{if(unit(id))return 'Deploy on your home ranks · one turn';if(!game.players[game.turn].support.some(c=>c.id===id))return capture()?'Place, then drag an animal · one action':'Install in support · one action';const square=target?.dataset.square as Square|undefined,action=square?effectAt(id,square):null;if(!action)return 'No effect here · release to return';const d=cardDefinitions()[cardRef(id).definitionId],p=previewAction(game,action),caster=unit(action.sourceUnitId??'');return `Release: ${d.name} · ${square}${p.damage!==undefined?' · '+p.damage+' damage':''}${caster?' · from '+caster.square:''}`},
  start:(id,zone)=>{message();closeCardPeek(false);closeDropChoice();if(unit(id))renderer.setSelection(null,legalDeploymentSquares(game,id));else if(zone==='support'){const legal=actions().filter(a=>a.type==='burn'&&a.cardId===id);const squares=legal.map(a=>a.type==='burn'?a.targetSquare??unit(a.targetUnitId??'')?.square:null).filter((s):s is Square=>Boolean(s));renderer.setSelection(null,[...new Set(squares)])}},end:()=>renderer.setSelection(selectedSquare,targets()),
  target:handDropTarget,
  play:(id,target,origin)=>{if(capture()&&!unit(id)&&!game.players[game.turn].support.some(c=>c.id===id)){armInstall(id);return}if(game.players[game.turn].support.some(c=>c.id===id)){if(target?.dataset.square)supportDropped(id,target.dataset.square as Square,origin);return}const u=unit(id),action=actions().find(a=>u?a.type==='deploy'&&a.unitId===id&&a.to===target?.dataset.square:a.type==='install'&&a.cardId===id);if(action)void commit(action,'human',origin)},
  reject:()=>message(handTab==='units'&&reinforcement()?'Animal returned. Drop onto an empty highlighted home square; deploying uses one turn.':'Card returned. Drag a ready altar card onto a highlighted effect target; click it to prepare an animal order.')
 })
 habitatDrag=new HabitatDrag({
  enabled:()=>canAct()&&(intent?.kind==='order'||intent?.kind==='install')&&$('cm-preview').hidden&&!document.querySelector('dialog[open]')&&$('cm-card-reader').hidden,
  revision:()=>revision,
  source:event=>{
   if(intent?.kind!=='order'&&intent?.kind!=='install')return null
   const hit=(event.target as HTMLElement).closest<HTMLElement>('#cm-squares [data-square]'),animal=game.units.find(u=>u.square===hit?.dataset.square&&u.side===game.turn&&u.hp>0)
   if(!hit||!animal)return null
   intent={...intent,unitId:animal.id};selectedSquare=animal.square
   for(const button of document.querySelectorAll<HTMLElement>('#cm-squares button')){button.classList.toggle('cm-order-source',button===hit);button.setAttribute('aria-pressed',String(button===hit))}
   renderer.setSelection(selectedSquare,targets());$('cm-intent').textContent=instruction()
   return hit
  },
  target:(x,y)=>{const square=document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-square]')?.dataset.square;return actions().find(a=>(a.type==='order'||a.type==='install')&&matchesIntent(a)&&a.to===square)??null},
  label:action=>{if(!action||(action.type!=='order'&&action.type!=='install'))return 'Invalid target · release to return';const p=previewAction(game,action);if(capture())return action.kind==='attack'?`Release to ${p.attackerEnd===action.to?'capture':'break Guard'}${action.type==='install'?' + install card':''}`:`Release to move${action.type==='install'?' + install card':''}`;return action.kind==='attack'?`Release to attack · ${p.damage??0} damage${unit(action.unitId)?.combat==='ranged'?' · stays at source':''}`:'Release to move · one action'},
  update:(point,action)=>{if((intent?.kind==='order'||intent?.kind==='install')&&intent.unitId)renderer.setHabitatDrag(intent.unitId,point,action?.type==='order'||action?.type==='install'?action.to??null:null)},
  clear:()=>renderer.setHabitatDrag(null),
  commit:action=>{if(action.type!=='order'&&action.type!=='install')return;const result=previewAction(game,action);if(!result.legal){renderer.setHabitatDrag(null);return}if(result.attackerEnd===action.to)renderer.finishHabitatDrag();else renderer.setHabitatDrag(null);void commit(action,'human')}
 })
 $('cm-close-tools').onclick=()=>document.body.classList.remove('cm-tools-open')
 $('cm-menu-button').onclick=()=>{closeCardPeek(false);pauseOpponent();$<HTMLDialogElement>('cm-menu').showModal()}
 $('cm-table-tools').onclick=()=>{document.body.classList.toggle('cm-tools-open');$<HTMLDialogElement>('cm-menu').close()}
 $('cm-menu-close').onclick=()=>$<HTMLDialogElement>('cm-menu').close()
 $('cm-match-kind').onchange=updateSetup
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-encounter-id]'))button.onclick=()=>{selectedEncounter=button.dataset.encounterId as EncounterId;updateSetup()}
 $('cm-restart').onclick=restartMatch;$('cm-encounter-info').onclick=showEncounterBrief;$('cm-encounter-close').onclick=()=>$<HTMLDialogElement>('cm-encounter-brief').close()
 $('cm-next-encounter').onclick=()=>{const id=game.options.encounterId;if(id){const next=ENCOUNTER_ORDER[ENCOUNTER_ORDER.indexOf(id)+1];if(next)beginEncounter(next)}}
 $('cm-choose-encounter').onclick=()=>{$<HTMLDialogElement>('cm-result').close();openSetup()}
 $('cm-new').onclick=()=>openSetup();$('cm-setup-close').onclick=()=>$<HTMLDialogElement>('cm-setup').close();$('cm-start-deployment').onclick=start
 $('cm-classic').onclick=()=>{interrupt();location.href='/'}
 $('cm-tower-fire').onclick=()=>{if(intent?.kind==='fire'){intent={kind:'order',cardId:intent.cardId,order:'auto',unitId:intent.unitId};render();return}if(intent?.kind!=='order')return;const order=intent;const shot=actions().find(a=>a.type==='fire'&&a.cardId===order.cardId&&(!order.unitId||a.unitId===order.unitId));if(shot?.type==='fire'){intent={kind:'fire',cardId:shot.cardId,unitId:shot.unitId};closeCardPeek(false);render()}}
 $('cm-clear').onclick=clearIntent;$('cm-unit-close').onclick=()=>$<HTMLDialogElement>('cm-unit-details').close()
 $('cm-undo').onclick=undo;$('cm-export').onclick=exportReplay
 $('cm-flip').onclick=()=>{pauseOpponent();if(busy)interrupt();flipped=!flipped;renderer.setFlipped(flipped);positionSquares();render()}
 $('cm-rules').onclick=()=>{updateCodex();pauseOpponent();$<HTMLDialogElement>('cm-codex').showModal()};$('cm-close-codex').onclick=()=>$<HTMLDialogElement>('cm-codex').close()
 $('cm-confirm').onclick=()=>{const action=preview;$('cm-preview').hidden=true;if(action)void commit(action,'human')}
 $('cm-cancel').onclick=()=>{$('cm-preview').hidden=true;clearIntent()}
 $('cm-play-again').onclick=()=>encounter()?restartMatch():openSetup();$('cm-view-board').onclick=()=>$<HTMLDialogElement>('cm-result').close()
 $('cm-retry-ai').onclick=()=>{aiFailed=false;message();void maybeOpponent()}
 $('cm-motion').onchange=()=>{const enabled=$<HTMLInputElement>('cm-motion').checked;document.body.dataset.ambient=enabled?'on':'off';renderer.setReducedMotion(!enabled)}
 $('cm-sound').onchange=()=>sound.setEnabled($<HTMLInputElement>('cm-sound').checked)
 for(const id of ['cm-play-mode','cm-hand-mode','cm-seed','cm-army-mode','cm-combat-rules'])$(id).addEventListener('change',updateSetup)
 $('cm-shuffle').onclick=()=>{$<HTMLInputElement>('cm-seed').value=String(randomSeed());$<HTMLSelectElement>('cm-hand-mode').value='shuffled';updateSetup()}
 $('cm-balanced').onclick=()=>{document.querySelectorAll<HTMLInputElement>('input[name="opening-card"]').forEach(input=>input.checked=BALANCED_OPENING.includes(input.value));updateSetup()}
 document.querySelectorAll<HTMLInputElement>('input[name="opening-card"]').forEach(input=>input.onchange=updateSetup)
 document.querySelectorAll<HTMLSelectElement>('[data-roster]').forEach(select=>select.onchange=rosterDetails)
 $('cm-starter').onclick=()=>{const rosters=defaultRosters();for(const side of ['w','b'] as Side[])document.querySelectorAll<HTMLSelectElement>(`[data-roster="${side}"]`).forEach((select,i)=>select.value=rosters[side][i]);rosterDetails()}
 document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{void maybeOpponent()}))
 
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){$('cm-preview').hidden=true;closeCardPeek();message();if(intent||preview||selectedSquare)clearIntent()}})
 document.addEventListener('click',event=>{if(habitatDrag?.suppressClick(event as MouseEvent)||drag?.suppressClick(event as MouseEvent)){event.preventDefault();event.stopImmediatePropagation()}},true)
 document.addEventListener('click',event=>{
  const target=event.target as HTMLElement
  if(!ready||busy)return
  const dropUse=target.closest<HTMLButtonElement>('[data-drop-use]');if(dropUse){if(dropUse.dataset.dropUse==='order')selectDroppedOrder();else selectDroppedEffect();return}
  const dropSource=target.closest<HTMLButtonElement>('[data-drop-source]');if(dropSource){const action=pendingDrop?.revision===revision?pendingDrop.options.effects.find(a=>a.sourceUnitId===dropSource.dataset.dropSource):undefined;closeDropChoice();if(action)openPreview(action);return}
  if(target.closest('#cm-drop-cancel')){clearIntent();return}
  const handToggle=target.closest<HTMLButtonElement>('[data-hand-tab]');if(handToggle){handTab=handToggle.dataset.handTab as 'units'|'effects';clearIntent();return}
  const reserve=target.closest<HTMLButtonElement>('[data-card-kind="unit"]');if(reserve){reserveClick(reserve.dataset.unitId!);return}
  const tapped=target.closest<HTMLButtonElement>('[data-card-id]')??target.closest('.cm-support-slot')?.querySelector<HTMLButtonElement>('[data-card-id]');if(tapped){if(tapped.dataset.zone==='support'&&isCardReady(game,tapped.dataset.cardId!)&&canAct())armOrder(tapped.dataset.cardId!);else cardClick(tapped.dataset.cardId!,tapped.dataset.zone!);return}
  if(thinking)return
  const tab=target.closest<HTMLButtonElement>('[data-tab]');if(tab){document.querySelectorAll('.cm-tabs button').forEach(button=>button.classList.toggle('active',button===tab));render();return}
  const animal=target.closest<HTMLButtonElement>('button[data-unit-id]')
  if(animal){if(game.phase==='deployment'&&canAct()){intent={kind:'deploy',unitId:animal.dataset.unitId!};render()}else inspectUnit(animal.dataset.unitId!);return}
  if(target.closest('[data-back]')){clearIntent();return}
  if(!canAct())return
  if(target.closest('#cm-auto-deploy')){interrupt();game=autoDeployRemaining(game);drawNote='';newCards.clear();drawFeedback();save();render();void maybeOpponent();return}
  const deploy=target.closest<HTMLButtonElement>('[data-deploy]');if(deploy){closeCardPeek();intent={kind:'deploy',unitId:deploy.dataset.deploy!};selectedSquare=null;message();render();return}
  const install=target.closest<HTMLButtonElement>('[data-install]');if(install){const action=actions().find(a=>a.type==='install'&&a.cardId===install.dataset.install),origin=cardLift?.node?cardRect(cardLift.node):undefined;closeCardPeek();if(action)void commit(action,'human',origin);return}
  const direct=target.closest<HTMLButtonElement>('[data-direct]');if(direct){const action=actions().find(a=>a.type===direct.dataset.direct);if(action)openPreview(action);return}
  const order=target.closest<HTMLButtonElement>('[data-order]');if(order){closeCardPeek();intent={kind:'order',cardId:order.dataset.card!,order:order.dataset.order as 'move'|'attack'|'auto'};selectedSquare=null;message();render();return}
  const burn=target.closest<HTMLButtonElement>('[data-burn]');if(burn){closeCardPeek();intent={kind:'burn',cardId:burn.dataset.burn!};selectedSquare=null;message();render()}
 })
 document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseOpponent();if(busy){interrupt();save();render()}}else void maybeOpponent()})
 window.addEventListener('pagehide',()=>{save();interrupt()})
 window.addEventListener('pageshow',()=>{if(ready){render();void maybeOpponent()}})
}

export async function startCheckmate(){
 const raw=savedRaw(),wantsNew=new URLSearchParams(location.search).get('new')==='1';let invalid=false,migratedDeployment=false
 try{if(!raw)throw new Error('No saved game');const restored=restoreSession(raw);game=restored.game;play=restored.play;if(game.phase==='deployment'&&!game.options.encounterId&&game.options.armyMode==='full'){game=autoDeployRemaining(game);migratedDeployment=true}}catch{invalid=Boolean(raw);game=autoDeployRemaining(createGame({seed:randomSeed(),rosters:defaultRosters(),openingHand:[...BALANCED_OPENING]}));play={...DEFAULT_PLAY}}
 document.body.classList.add('checkmate-mode');shell();renderer=new TacticalRenderer($<HTMLCanvasElement>('cm-board'));flipped=play.mode==='ai'&&play.human==='b';renderer.setFlipped(flipped);setSquares();fillSetup(false);bind();if(migratedDeployment)save()
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');$<HTMLInputElement>('cm-motion').checked=!reduced.matches;document.body.dataset.ambient=reduced.matches?'off':'on';renderer.setReducedMotion(reduced.matches)
 reduced.addEventListener('change',event=>{$<HTMLInputElement>('cm-motion').checked=!event.matches;document.body.dataset.ambient=event.matches?'off':'on';renderer.setReducedMotion(event.matches)})
 render()
 try{await Promise.all([renderer.ready,preloadCardArt('/assets/checkmate/effects.webp'),preloadCardArt('/assets/checkmate/card-back.webp'),preloadCardArt('/assets/checkmate/shrine-vertical.webp'),preloadCardArt('/assets/checkmate/shrine-horizontal.webp')]);ready=true;$('cm-loading').hidden=true;positionSquares();render();if(wantsNew||!raw||invalid){openSetup(false);if(invalid)$('cm-setup-error').textContent='The saved match could not be restored. Start a new match; classic chess is preserved.'}else if(game.phase==='finished')showResult();else{drawFeedback();render();void maybeOpponent()}}
 catch{$('cm-loading').innerHTML='<span>The woodland could not load.</span><button id="cm-retry">Retry assets</button>';$('cm-retry').onclick=()=>location.reload()}
 if(import.meta.env.DEV)(window as unknown as {checkmate:unknown}).checkmate={get state(){return structuredClone(game)},get play(){return {...play}},get busy(){return busy||thinking},reset:(options:Parameters<typeof createGame>[0])=>{interrupt();game=createGame(options);render()},dispatch:(action:Action)=>{pauseOpponent();game=applyAction(game,action);render()}}
}

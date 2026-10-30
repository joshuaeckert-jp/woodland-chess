import type {Action,EncounterId,GameState,Side,Square,UnitStatus} from './types'

export interface EncounterDefinition {
 id:EncounterId;title:string;objective:string;briefing:string;hint:string;species:'turtle'|'lion'|'rat'|'hare';maxWhiteActions:number;enemyReplies?:number;markedSquare:Square;reserveUnitIds:string[]
}
export const ENCOUNTER_ORDER:EncounterId[]=['blockade','rescue','crossing','tower']
export const ENCOUNTERS:Record<EncounterId,EncounterDefinition>={
 blockade:{id:'blockade',title:'Break the Blockade',objective:'Capture the marked turtle in 2 actions.',briefing:'A guarded turtle controls the lane. Your Piercing Banner is ready on the altar; Smoke Veil waits in your hand.',hint:'A normal attack breaks Guard, but the enemy can restore it. Pierce first, then install a card to order your rook.',species:'turtle',maxWhiteActions:2,markedSquare:'a5',reserveUnitIds:[]},
 rescue:{id:'rescue',title:'Rescue the King',objective:'Bring your king to c3 in 2 actions.',briefing:'Your king is rooted, and an enemy rook is approaching. Wild Herbs are ready on the altar; a Banner is in hand.',hint:'Cast Wild Herbs on the king. Then place your hand card and move the king to the marked exit.',species:'lion',maxWhiteActions:2,markedSquare:'c3',reserveUnitIds:[]},
 tower:{id:'tower',title:'The Watchtower',objective:'Defeat the sentinel, then reach e5 in 4 actions.',briefing:'A bound sentinel blocks the exit. Jump the hare onto the tower for one ranged shot, or let the pawn demolish it to open the rook’s lane. Firing Roots its user for the next turn.',hint:'Tower route: hare b2–d3, fire at d5, use another animal while the hare is Rooted, then jump to e5. Clearing route: Trailbreaker on pawn d2, capture e3, rook takes d5, then e5.',species:'hare',maxWhiteActions:4,markedSquare:'e5',reserveUnitIds:[]},
 crossing:{id:'crossing',title:'Hold the Crossing',objective:'Keep your king on d1 for 3 enemy turns.',briefing:'An enemy rook controls the bridge. You have one rat in reserve and two ready Guard cards. Leaving d1 loses the crossing.',hint:'A rat on the d-file buys one turn. Cast each Guard only when you need it to absorb the next capture.',species:'rat',maxWhiteActions:3,enemyReplies:3,markedSquare:'d1',reserveUnitIds:['w-unit-8']},
}
export const isEncounterId=(value:unknown):value is EncounterId=>typeof value==='string'&&ENCOUNTER_ORDER.includes(value as EncounterId)
export const encounterReserveIds=(id:EncounterId):readonly string[]=>ENCOUNTERS[id].reserveUnitIds

/** Curated, deterministic initial positions; only the id and legal actions are saved. */
export function applyEncounterSetup(state:GameState,id:EncounterId):void{
 state.phase='battle';state.turn='w';state.initiative='w';state.ply=0;state.deploymentCount=0;state.noProgress=0;state.winner=null;state.finishReason=null;state.log=[];state.lastEvents=[];state.terrain={};state.items={};if(id==='tower')state.obstacles={};else delete state.obstacles;state.repetitions={};state.encounterProgress={whiteActions:0,enemyReplies:0}
 state.options.combatRules='capture';state.options.armyMode=id==='crossing'?'reinforcement':'full';state.options.supportLimit=3
 for(const u of state.units){u.square=null;u.hp=0;u.maxHp=1;u.atk=0;u.def=0;u.combat='melee';u.statuses=[];u.equipment={};u.hasMoved=true;u.veteran=false}
 const place=(unitId:string,square:Square|null,statuses:UnitStatus[]=[])=>{const u=state.units.find(u=>u.id===unitId)!;u.square=square;u.hp=1;u.statuses=statuses}
 for(const side of ['w','b'] as Side[]){const p=state.players[side];p.ownTurn=side==='w'?1:0;p.hand=[];p.deck=[];p.support=[];p.discard=[];p.reserveCreated=true}
 const hand=(side:Side,ids:string[])=>{state.players[side].hand=ids.map((definitionId,i)=>({id:`${side}-enc-hand-${i}`,definitionId}))}
 const supports=(side:Side,ids:string[])=>{state.players[side].support=ids.map((definitionId,i)=>({id:`${side}-enc-support-${i}`,definitionId,installedAt:0,usableOn:0,readyOn:0,...(definitionId==='reserve-order'?{reserve:true}:{})}))}
 if(id==='blockade'){
  place('w-unit-0','h1');place('w-unit-2','a1');place('b-unit-0','h8');place('b-unit-2','a5',[{kind:'guarded',amount:1},{kind:'rooted',amount:1,expiresAtOwnEnd:1}]);place('b-unit-8','h7')
  hand('w',['smoke']);supports('w',['banner']);supports('b',['brace','reserve-order'])
 }else if(id==='rescue'){
  place('w-unit-0','b2',[{kind:'rooted',amount:1}]);place('b-unit-0','h8');place('b-unit-2','f4')
  hand('w',['banner']);supports('w',['herbs']);supports('b',['reserve-order'])
 }else if(id==='tower'){
  place('w-unit-0','h1');place('w-unit-2','d1');place('w-unit-6','b2');place('w-unit-8','d2');place('b-unit-0','h8');place('b-unit-2','d5',[{kind:'rooted',amount:1}]);place('b-unit-8','e3',[{kind:'rooted',amount:1}])
  supports('w',['trailbreaker','reserve-order','smoke']);supports('b',['banner','brace','smoke'])
  state.obstacles={d3:{kind:'tower',square:'d3'},c2:{kind:'wall',square:'c2'}}
 }else{
  place('w-unit-0','d1');place('w-unit-8',null);place('b-unit-0','h8');place('b-unit-2','d7')
  supports('w',['brace','field-dressing']);supports('b',['banner','brace','smoke'])
 }
 state.lastEvents.push({type:'turn',text:'Encounter begins',side:'w'})
}

/** Called after the action's effects and king defeat, before quiet-draw handling. */
export function encounterOutcome(state:GameState,actingSide:Side):{winner:Side;reason:string}|null{
 const id=state.options.encounterId,p=state.encounterProgress
 if(!id||!p||state.phase==='finished')return null
 const king=state.units.find(u=>u.id==='w-unit-0')!
 if(id==='blockade'&&state.units.find(u=>u.id==='b-unit-2')!.hp===0)return{winner:'w',reason:'Blockade cleared'}
 if(id==='rescue'&&king.square==='c3')return{winner:'w',reason:'King rescued'}
 if(id==='tower'&&state.units.find(u=>u.id==='b-unit-2')!.hp===0&&state.units.some(u=>u.side==='w'&&u.hp>0&&u.square==='e5'))return{winner:'w',reason:'Watchtower mastered'}
 if(id==='crossing'){
  if(king.square!=='d1')return{winner:'b',reason:'The king left the crossing'}
  if(actingSide==='b'&&p.enemyReplies>=3)return{winner:'w',reason:'Crossing held'}
  if(actingSide==='b'&&p.whiteActions>=3)return{winner:'b',reason:'The crossing was not held'}
 }else if(p.whiteActions>=ENCOUNTERS[id].maxWhiteActions)return{winner:'b',reason:'Out of actions'}
 return null
}

/** Authored opponents select only supplied legal actions; ordinary AI is fallback. */
export function chooseEncounterAction(state:GameState,legal:Action[]):Action|null{
 const id=state.options.encounterId
 if(!id||state.turn!=='b'||state.phase!=='battle')return null
 const attack=(unitId:string)=>legal.find(a=>(a.type==='order'||a.type==='install')&&a.kind==='attack'&&a.to===state.units.find(u=>u.id===unitId)?.square)
 const move=(from:Square,to:Square)=>legal.find(a=>(a.type==='order'||a.type==='install')&&a.kind==='move'&&a.to===to&&state.units.find(u=>u.id===a.unitId)?.square===from)
 if(id==='blockade'){
  const target=state.units.find(u=>u.id==='b-unit-2')!
  if(!target.statuses.some(s=>s.kind==='guarded')){const guard=legal.find(a=>a.type==='burn'&&a.targetUnitId===target.id&&state.players.b.support.find(c=>c.id===a.cardId)?.definitionId==='brace');if(guard)return guard}
  return move('h7','h6')??attack('w-unit-2')??null
 }
 if(id==='tower')return move('h8','g8')??move('g8','h8')??null
 if(id==='rescue')return move('f4','b4')??attack('w-unit-0')??null
 return attack('w-unit-0')??attack('w-unit-8')??move('h8','g8')??move('g8','h8')??null
}

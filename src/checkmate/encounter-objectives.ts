import { ENCOUNTERS } from './encounters'
import type { EncounterId, GameState, Square, Unit } from './types'

export interface EncounterObjectiveStep {
  id: string
  label: string
  done: boolean
  active: boolean
}

export interface EncounterObjectives {
  title: string
  steps: EncounterObjectiveStep[]
  budgetLabel: string
  remaining: number
  failed: boolean
  complete: boolean
}

const unit=(state:GameState,id:string):Unit|undefined=>state.units.find(candidate=>candidate.id===id)
const aliveAt=(state:GameState,side:'w'|'b',square:Square)=>state.units.some(candidate=>candidate.side===side&&candidate.hp>0&&candidate.square===square)
const aliveKingAt=(state:GameState,square:Square)=>{
  const king=unit(state,'w-unit-0')
  return Boolean(king&&king.hp>0&&king.square===square)
}
const rooted=(candidate:Unit|undefined)=>Boolean(candidate?.statuses.some(status=>status.kind==='rooted'))

export function getEncounterObjectives(state:GameState):EncounterObjectives|null {
  const id=state.options.encounterId
  if(!id)return null

  const definition=ENCOUNTERS[id]
  const progress=state.encounterProgress ?? {whiteActions:0,enemyReplies:0}
  const complete=state.phase==='finished'&&state.winner==='w'
  const failed=state.phase==='finished'&&state.winner!=='w'
  const ongoing=!complete&&!failed
  const objectiveSteps=stepsFor(state,id,ongoing,complete)

  if(id==='crossing'){
    const target=definition.enemyReplies ?? 3
    return {
      title:definition.title,
      steps:objectiveSteps,
      budgetLabel:`Enemy turns survived · ${progress.enemyReplies}/${target}`,
      remaining:Math.max(0,target-progress.enemyReplies),
      failed,
      complete,
    }
  }

  const remaining=Math.max(0,definition.maxWhiteActions-progress.whiteActions)
  return {
    title:definition.title,
    steps:objectiveSteps,
    budgetLabel:`${remaining} action${remaining===1?'':'s'} left`,
    remaining,
    failed,
    complete,
  }
}

function stepsFor(state:GameState,id:EncounterId,ongoing:boolean,complete:boolean):EncounterObjectiveStep[] {
  const sentinelDefeated=unit(state,'b-unit-2')?.hp===0
  const king=unit(state,'w-unit-0')

  if(id==='tower'){
    const exitReached=sentinelDefeated&&aliveAt(state,'w','e5')
    return [
      {id:'defeat-sentinel',label:'Defeat the sentinel on d5',done:sentinelDefeated,active:ongoing&&!sentinelDefeated},
      {id:'reach-exit',label:'Reach e5 with any animal',done:exitReached,active:ongoing&&sentinelDefeated&&!exitReached},
    ]
  }

  if(id==='rescue'){
    const freed=Boolean(king&&king.hp>0&&!rooted(king))
    const exitReached=aliveKingAt(state,'c3')
    return [
      {id:'free-king',label:'Free your king from Root',done:freed,active:ongoing&&!freed},
      {id:'reach-exit',label:'Bring your king to c3',done:exitReached,active:ongoing&&freed&&!exitReached},
    ]
  }

  if(id==='blockade'){
    return [{id:'capture-turtle',label:'Capture the turtle on a5',done:sentinelDefeated,active:ongoing&&!sentinelDefeated}]
  }

  const held=complete&&aliveKingAt(state,'d1')
  return [{id:'hold-crossing',label:'Keep your king on d1',done:held,active:ongoing&&aliveKingAt(state,'d1')}]
}

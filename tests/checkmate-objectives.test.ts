import { describe, expect, it } from 'vitest'
import { applyAction, createGame, legalActions } from '../src/checkmate/engine'
import { chooseEncounterAction } from '../src/checkmate/encounters'
import { getEncounterObjectives } from '../src/checkmate/encounter-objectives'
import { restoreGame, serializeGame } from '../src/checkmate/persistence'

const reply=(state:ReturnType<typeof createGame>)=>applyAction(state,chooseEncounterAction(state,legalActions(state))!)

describe('encounter objective projection',()=>{
  it('returns null outside an encounter',()=>{
    expect(getEncounterObjectives(createGame())).toBeNull()
  })

  it('tracks the watchtower sequence through legal actions without accepting an early exit',()=>{
    const early=createGame({encounterId:'tower'})
    early.units.find(unit=>unit.id==='w-unit-6')!.square='e5'
    expect(getEncounterObjectives(early)?.steps).toEqual([
      {id:'defeat-sentinel',label:'Defeat the sentinel on d5',done:false,active:true},
      {id:'reach-exit',label:'Reach e5 with any animal',done:false,active:false},
    ])

    let state=createGame({encounterId:'tower'})
    const jump=legalActions(state).find(action=>action.type==='order'&&action.unitId==='w-unit-6'&&action.kind==='move'&&action.to==='d3')!
    state=reply(applyAction(state,jump))
    const fire=legalActions(state).find(action=>action.type==='fire'&&action.unitId==='w-unit-6'&&action.to==='d5')!
    state=reply(applyAction(state,fire))

    expect(getEncounterObjectives(state)).toMatchObject({
      budgetLabel:'2 actions left',remaining:2,complete:false,failed:false,
      steps:[
        {id:'defeat-sentinel',done:true,active:false},
        {id:'reach-exit',done:false,active:true},
      ],
    })
  })

  it('is a pure current-state projection across save reload and a failed encounter',()=>{
    const fresh=createGame({encounterId:'rescue'})
    const before=getEncounterObjectives(fresh)
    const reloaded=restoreGame(serializeGame(fresh))
    expect(getEncounterObjectives(reloaded)).toEqual(before)
    expect(getEncounterObjectives(fresh)).toEqual(before)

    const failed=structuredClone(fresh)
    failed.phase='finished'
    failed.winner='b'
    const failedObjectives=getEncounterObjectives(failed)!
    expect(failedObjectives).toMatchObject({complete:false,failed:true,budgetLabel:'2 actions left'})
    expect(failedObjectives.steps[0]).toMatchObject({done:false,active:false})
  })

  it('projects each encounter-specific win condition and budget',()=>{
    const blockade=createGame({encounterId:'blockade'})
    blockade.units.find(unit=>unit.id==='b-unit-2')!.hp=0
    expect(getEncounterObjectives(blockade)?.steps).toEqual([
      {id:'capture-turtle',label:'Capture the turtle on a5',done:true,active:false},
    ])

    const rescue=createGame({encounterId:'rescue'})
    rescue.units.find(unit=>unit.id==='w-unit-0')!.statuses=[]
    expect(getEncounterObjectives(rescue)?.steps).toEqual([
      {id:'free-king',label:'Free your king from Root',done:true,active:false},
      {id:'reach-exit',label:'Bring your king to c3',done:false,active:true},
    ])

    const crossing=createGame({encounterId:'crossing'})
    crossing.encounterProgress!.enemyReplies=2
    expect(getEncounterObjectives(crossing)).toMatchObject({
      budgetLabel:'Enemy turns survived · 2/3',remaining:1,
      steps:[{id:'hold-crossing',done:false,active:true}],
    })
    crossing.phase='finished'
    crossing.winner='w'
    expect(getEncounterObjectives(crossing)?.steps[0]).toMatchObject({done:true,active:false})
  })
})

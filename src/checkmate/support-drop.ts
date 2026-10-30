import { legalActions } from './engine'
import type { Action, GameState, Square } from './types'

export interface SupportDropOptions {
  orderUnitId?: string
  effects: Extract<Action, { type: 'burn' }>[]
}

/** Resolves a support-card drop strictly from the engine's current legal actions. */
export function supportDropOptions(state: GameState, cardId: string, square: Square): SupportDropOptions {
  if (state.phase !== 'battle') return { effects: [] }
  const player = state.players[state.turn]
  if (!player.support.some(card => card.id === cardId)) return { effects: [] }

  const actions = legalActions(state)
  const cardActions = actions.filter(action => (action.type === 'order' || action.type === 'burn') && action.cardId === cardId)
  const droppedUnit = state.units.find(unit => unit.square === square && unit.hp > 0 && unit.side === state.turn)
  const orderUnitId = droppedUnit && cardActions.some(action => action.type === 'order' && action.unitId === droppedUnit.id) ? droppedUnit.id : undefined
  const effects = cardActions.filter((action): action is Extract<Action, { type: 'burn' }> => action.type === 'burn' && (action.targetSquare === square || (action.targetUnitId !== undefined && state.units.some(unit => unit.id === action.targetUnitId && unit.square === square && unit.hp > 0))))

  return { ...(orderUnitId ? { orderUnitId } : {}), effects }
}

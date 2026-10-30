import { restoreGame, serializeGame } from './persistence'
import type { GameState, Side } from './types'

import type { AiDifficulty } from './ai-types'
export type { AiDifficulty } from './ai-types'
export interface PlaySettings { mode:'local'|'ai'; human:Side; difficulty:AiDifficulty }
export const DEFAULT_PLAY:PlaySettings = {mode:'ai',human:'w',difficulty:'normal'}
export const LOCAL_PLAY:PlaySettings = {mode:'local',human:'w',difficulty:'normal'}

export function serializeSession(game:GameState, play:PlaySettings):string {
  return JSON.stringify({format:'checkmate-session-v1',game:JSON.parse(serializeGame(game)),play})
}

export function restoreSession(raw:string):{game:GameState;play:PlaySettings} {
  if(typeof raw!=='string'||raw.length>2_200_000)throw new Error('Invalid saved match')
  const parsed=JSON.parse(raw)
  if(parsed?.format!=='checkmate-session-v1') return {game:restoreGame(raw),play:{...LOCAL_PLAY}}
  const play=parsed.play
  if(Object.keys(parsed).sort().join(',')!=='format,game,play'||!play||!['local','ai'].includes(play.mode)||!['w','b'].includes(play.human)||!['easy','normal','hard'].includes(play.difficulty)||Object.keys(play).sort().join(',')!=='difficulty,human,mode')throw new Error('Invalid saved opponent settings')
  return {game:restoreGame(JSON.stringify(parsed.game)),play:{...play}}
}

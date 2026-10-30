import {describe,it,expect} from 'vitest'
import {createGame,autoDeployRemaining} from '../src/checkmate/engine'
import {serializeGame} from '../src/checkmate/persistence'
import {restoreSession,serializeSession,LOCAL_PLAY} from '../src/checkmate/session'

describe('Checkmate saved opponent settings',()=>{
 it('restores old replay-only saves as same-device games',()=>{const game=autoDeployRemaining(createGame());expect(restoreSession(serializeGame(game))).toEqual({game,play:LOCAL_PLAY})})
 it('keeps the AI side and difficulty with the exact match replay',()=>{const game=autoDeployRemaining(createGame());const play={mode:'ai' as const,human:'b' as const,difficulty:'hard' as const};expect(restoreSession(serializeSession(game,play))).toEqual({game,play})})
 it('rejects invalid settings rather than silently playing the wrong side',()=>{const data=JSON.parse(serializeSession(createGame(),{mode:'ai',human:'w',difficulty:'easy'}));data.play.human='x';expect(()=>restoreSession(JSON.stringify(data))).toThrow();data.play.human='w';data.play.cheat=true;expect(()=>restoreSession(JSON.stringify(data))).toThrow()})
})

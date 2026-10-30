export type CombatRules = 'hp'|'capture'
export type EncounterId = 'blockade'|'rescue'|'crossing'|'tower'
export type Side = 'w' | 'b'
export type Role = 'k' | 'q' | 'r' | 'b' | 'n' | 'p'
export type Square = `${'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'}${1|2|3|4|5|6|7|8}`
export type CombatStyle = 'melee' | 'ranged'
export type Species = 'lion'|'fox'|'turtle'|'raven'|'hare'|'rat'
export type StatusKind = 'inspired'|'guarded'|'rooted'|'poison'
export interface UnitDefinition { id:string; name:string; role:Role; species:Species; hp:number; atk:number; def:number; combat:CombatStyle; range:number; passive?:'king-guard'|'pierce'; description:string }
export interface UnitStatus { kind:StatusKind; amount:number; remaining?:number; expiresAtOwnEnd?:number }
export interface Unit { id:string; side:Side; definitionId:string; role:Role; square:Square|null; hp:number; maxHp:number; atk:number; def:number; combat:CombatStyle; range:number; hasMoved:boolean; veteran:boolean; equipment:{weapon?:boolean;armor?:boolean}; statuses:UnitStatus[] }
export type CardEffect = 'inspire'|'guard'|'smoke'|'heal'|'shot'|'root'|'snare'|'purify'|'poison'|'log'|'weapon'|'armor'|'reserve'|'clear'
export interface CardDefinition { id:string; name:string; cooldown:number; category:string; effect:CardEffect; target:'friendly'|'hostile'|'square'|'none'; description:string; targetHint:string; artIndex:number; burnable:boolean }
export interface CardRef { id:string; definitionId:string }
export interface SupportCard extends CardRef { installedAt:number; usableOn:number; readyOn:number; reserve?:boolean }
export interface PlayerState { side:Side; ownTurn:number; hand:CardRef[]; deck:CardRef[]; support:SupportCard[]; discard:CardRef[]; reserveCreated:boolean }
export interface Terrain { id:string; kind:'smoke'|'log'; square:Square; side:Side; expiresOnOwnStart:number }
export interface GroundItem { id:string; kind:'snare'; square:Square; side:Side }
export interface Obstacle { kind:'wall'|'tower'; square:Square; spent?:boolean }
export type ArmyMode = 'full'|'reinforcement'
export interface GameOptions { seed:number; rosters:Record<Side,string[]>; openingHand?:string[]; supportLimit?:3|5; armyMode?:ArmyMode; combatRules?:CombatRules; encounterId?:EncounterId }
export type Action =
 | {type:'deploy';player:Side;unitId:string;to:Square}
 | {type:'install';player:Side;cardId:string;unitId?:never;kind?:never;to?:never}
 | {type:'install';player:Side;cardId:string;unitId:string;kind:'move'|'attack';to:Square}
 | {type:'order';player:Side;cardId:string;unitId:string;kind:'move'|'attack';to:Square}
 | {type:'fire';player:Side;cardId:string;unitId:string;to:Square}
 | {type:'burn';player:Side;cardId:string;targetUnitId?:string;targetSquare?:Square;sourceUnitId?:string}
 | {type:'recover';player:Side}
 | {type:'rest';player:Side}
export interface GameEvent { type:'deploy'|'deal'|'install'|'move'|'attack'|'damage'|'heal'|'defeat'|'status'|'terrain'|'item'|'equipment'|'burn'|'draw'|'recover'|'rest'|'promote'|'victory'|'turn'; text:string; unitId?:string; targetUnitId?:string; from?:Square; to?:Square; amount?:number; lethal?:boolean; combat?:CombatStyle; cardId?:string; side?:Side }
export interface GameState { schema:1; options:GameOptions; phase:'deployment'|'battle'|'finished'; initiative:Side; turn:Side; units:Unit[]; players:Record<Side,PlayerState>; terrain:Partial<Record<Square,Terrain>>; items:Partial<Record<Square,GroundItem>>; obstacles?:Partial<Record<Square,Obstacle>>; ply:number; deploymentCount:number; noProgress:number; winner:Side|'draw'|null; finishReason:string|null; log:Action[]; lastEvents:GameEvent[]; repetitions:Record<string,number>; encounterProgress?:{whiteActions:number;enemyReplies:number} }
export interface ActionPreview { legal:boolean; reason:string; damage?:number; defenderHpAfter?:number; attackerEnd?:Square; cardReadyOn?:number; summary:string }
export interface EffectiveStats { atk:number; def:number; hp:number; maxHp:number }

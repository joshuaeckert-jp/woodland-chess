import type { CardDefinition, Role, Side, UnitDefinition } from './types'

export const ROLE_NAMES:Record<Role,string>={k:'King',q:'Queen',r:'Rook',b:'Bishop',n:'Knight',p:'Pawn'}
export const ROLE_LIMITS:Record<Role,number>={k:1,q:1,r:2,b:2,n:2,p:8}
export const SUPPORT_LIMIT=3
export const UNIT_DEFINITIONS:Record<string,UnitDefinition>={
 'lion-regent':{id:'lion-regent',name:'Sunmane Regent',role:'k',species:'lion',hp:8,atk:3,def:1,combat:'melee',range:1,description:'A durable king with a commanding roar. One-square movement; no check or checkmate in this ruleset.'},
 'lion-iron-crown':{id:'lion-iron-crown',name:'Iron Crown',role:'k',species:'lion',hp:10,atk:2,def:1,combat:'melee',range:1,description:'Trades striking power for two additional health. The same royal movement.'},
 'fox-duelist':{id:'fox-duelist',name:'Bramble Duelist',role:'q',species:'fox',hp:7,atk:4,def:0,combat:'melee',range:7,description:'An assertive queen who closes distance with a precise claw swipe.'},
 'fox-emberseer':{id:'fox-emberseer',name:'Emberseer',role:'q',species:'fox',hp:5,atk:3,def:0,combat:'ranged',range:3,description:'Fires along ranks, files and diagonals up to three squares. Remains on her habitat after firing.'},
 'turtle-guardian':{id:'turtle-guardian',name:'Ironback Guardian',role:'r',species:'turtle',hp:8,atk:3,def:1,combat:'melee',range:7,passive:'king-guard',description:'Guardian Stance: +1 DEF while adjacent to its living king. Approaches along clear ranks and files.'},
 'turtle-siege':{id:'turtle-siege',name:'Reef Siege',role:'r',species:'turtle',hp:6,atk:3,def:0,combat:'ranged',range:4,passive:'pierce',description:'Fires up to four squares in a straight line. Piercing Shot ignores 1 DEF at a distance of three or more.'},
 'raven-duskwing':{id:'raven-duskwing',name:'Duskwing',role:'b',species:'raven',hp:6,atk:3,def:0,combat:'melee',range:7,description:'A diagonal hunter who flies into melee and returns if the defender survives.'},
 'raven-stormcaller':{id:'raven-stormcaller',name:'Stormcaller',role:'b',species:'raven',hp:5,atk:3,def:0,combat:'ranged',range:4,description:'Sends a feather bolt along a clear diagonal, up to four squares, without relocating.'},
 'hare-burrowguard':{id:'hare-burrowguard',name:'Burrowguard',role:'n',species:'hare',hp:6,atk:3,def:0,combat:'melee',range:2,description:'Leaps in an L over obstacles. A nonlethal attack returns the hare to its original habitat.'},
 'hare-windrunner':{id:'hare-windrunner',name:'Windrunner',role:'n',species:'hare',hp:5,atk:4,def:0,combat:'melee',range:2,description:'One less health, one more attack. Keeps the same L-shaped leap and nonlethal return.'},
 'rat-scout':{id:'rat-scout',name:'Trail Scout',role:'p',species:'rat',hp:5,atk:2,def:0,combat:'melee',range:1,description:'Advances forward, attacks diagonally, and becomes a Veteran on the last rank.'},
 'rat-tailblade':{id:'rat-tailblade',name:'Tailblade',role:'p',species:'rat',hp:4,atk:3,def:0,combat:'melee',range:1,description:'A harder tail strike at the cost of one health. Uses ordinary pawn geometry before promotion.'},
}

const card=(id:string,name:string,cooldown:number,category:string,effect:CardDefinition['effect'],target:CardDefinition['target'],description:string,targetHint:string,artIndex:number):CardDefinition=>({id,name,cooldown,category,effect,target,description,targetHint,artIndex,burnable:true})
export const CARD_DEFINITIONS:Record<string,CardDefinition>={
 banner:card('banner','Rallying Banner',1,'Buff','inspire','friendly','Give a friendly unit +1 ATK on its next attack. Expires after its next own turn if unused.','A friendly unit without the same active inspiration.',0),
 brace:card('brace','Iron Shield',1,'Defense','guard','friendly','Give a friendly unit +1 DEF through the end of its next own turn.','A friendly unit whose guard would improve.',1),
 smoke:card('smoke','Smoke Pot',1,'Terrain','smoke','square','Create passable smoke that blocks ranged line of sight through the opponent’s next action.','An empty terrain-free square within two cells of a friendly source.',2),
 'field-dressing':card('field-dressing','Spring Water',2,'Healing','heal','friendly','Restore 2 HP, capped at maximum health. Does not cure poison.','A living, damaged friendly unit.',3),
 'aimed-shot':card('aimed-shot','Aimed Shot',2,'Damage','shot','hostile','Deal 1 effect damage, ignoring DEF. Choose a friendly source with a clear line to the target.','An enemy within three cells on a clear rank, file or diagonal from the source.',4),
 vines:card('vines','Tangle Vines',2,'Control','root','hostile','Root an enemy through the end of its next turn. It cannot Move but may still Attack.','A visible enemy within three cells of a friendly source.',5),
 snare:card('snare','Bramble Snare',2,'Trap','snare','square','Place a public snare. An enemy ending movement here is rooted; the snare is consumed.','An empty item-free square within two cells of a friendly source.',6),
 herbs:card('herbs','Purifying Herbs',2,'Recovery','purify','friendly','Remove Poison and Rooted, then restore 1 HP, capped at maximum.','A friendly unit that is damaged, poisoned or rooted.',7),
 venom:card('venom','Venom Dart',3,'Debuff','poison','hostile','Apply Poison 2: 1 damage at the end of the target controller’s next two turns. Reapplication never stacks intensity.','A visible enemy within three cells of a friendly source.',8),
 'fallen-log':card('fallen-log','Fallen Log',3,'Terrain','log','square','Create impassable, line-of-sight blocking terrain through the opponent’s next action. Knights can jump over it.','An empty terrain-free square within two cells of a friendly source.',9),
 'weapon-cache':card('weapon-cache','Weapon Cache',3,'Equipment','weapon','friendly','Fill an empty weapon slot with permanent +1 ATK. Equipment is lost when the unit is defeated.','A friendly unit with an empty weapon slot.',10),
 'armor-cache':card('armor-cache','Armor Cache',3,'Equipment','armor','friendly','Fill an empty armor slot with permanent +1 DEF. Equipment is lost when the unit is defeated.','A friendly unit with an empty armor slot.',11),
 'reserve-order':{id:'reserve-order',name:'Reserve Order',cooldown:1,category:'Order',effect:'reserve',target:'none',description:'Emergency reusable activation. Cannot be burned or discarded. Cooldown 1.',targetHint:'Created only after every ordinary card is gone.',artIndex:0,burnable:false},
}
const captureCard = (id:string, name:string, cooldown:number, category:string, effect:CardDefinition['effect'], target:CardDefinition['target'], description:string, targetHint:string, artIndex:number):CardDefinition => ({ id, name, cooldown, category, effect, target, description, targetHint, artIndex, burnable:true })
export const CAPTURE_CARD_DEFINITIONS:Record<string,CardDefinition>={
 banner:captureCard('banner','Piercing Banner',1,'Buff','inspire','friendly','Give a friendly unit Piercing: its next capture bypasses Guard; it expires after that unit’s next own turn.','A friendly unit without Piercing.',0),
 brace:captureCard('brace','Iron Shield',1,'Defense','guard','friendly','Give a friendly unit Guard. Guard prevents its next capture.','A friendly unit without Guard.',1),
 smoke:captureCard('smoke','Smoke Veil',1,'Terrain','smoke','square','Create passable smoke that blocks sliding attack rays, including the smoked target square.','An empty terrain-free square within two cells of a friendly source.',2),
 'field-dressing':captureCard('field-dressing','Spring Ward',2,'Defense','guard','friendly','Give a friendly unit Guard.','A friendly unit without Guard.',3),
 'aimed-shot':captureCard('aimed-shot','Binding Shot',2,'Control','root','hostile','Root an enemy through its next own end. It cannot move or capture.','A visible enemy within three cells of a friendly source.',4),
 vines:captureCard('vines','Bramble Bind',2,'Control','root','hostile','Root an enemy through its next own end. It cannot move or capture.','A visible enemy within three cells of a friendly source.',5),
 snare:captureCard('snare','Bramble Snare',2,'Trap','snare','square','Place a public snare. The next enemy ending movement here is rooted; the snare is consumed.','An empty item-free square within two cells of a friendly source.',6),
 herbs:captureCard('herbs','Wild Herbs',2,'Recovery','purify','friendly','Remove Rooted from a friendly unit.','A rooted friendly unit.',7),
 venom:captureCard('venom','Binding Venom',3,'Control','root','hostile','Root an enemy through its next own end. It cannot move or capture.','A visible enemy within three cells of a friendly source.',8),
 'fallen-log':captureCard('fallen-log','Fallen Log',3,'Terrain','log','square','Create impassable, line-of-sight blocking terrain through the opponent’s next action.','An empty terrain-free square within two cells of a friendly source.',9),
 'weapon-cache':captureCard('weapon-cache','Piercing Charm',3,'Buff','inspire','friendly','Give a friendly unit Piercing: its next capture bypasses Guard; it expires after that unit’s next own turn.','A friendly unit without Piercing.',10),
 'armor-cache':captureCard('armor-cache','Woodland Ward',3,'Defense','guard','friendly','Give a friendly unit Guard.','A friendly unit without Guard.',11),
 trailbreaker:captureCard('trailbreaker','Trailbreaker',2,'Terrain','clear','friendly','A pawn permanently demolishes an unoccupied wall or tower directly ahead. The pawn stays put; a destroyed tower loses its shot.','Drag onto the pawn or its forward obstacle.',9),
 'reserve-order':{id:'reserve-order',name:'Reserve Order',cooldown:1,category:'Order',effect:'reserve',target:'none',description:'Emergency reusable activation. Cannot be burned or discarded. Cooldown 1.',targetHint:'Created only after every ordinary card is gone.',artIndex:0,burnable:false},
}
export function getCardDefinitions(combatRules:'hp'|'capture'='hp'):Record<string,CardDefinition>{ return combatRules === 'capture' ? CAPTURE_CARD_DEFINITIONS : CARD_DEFINITIONS }
export const STARTER_DECK=['banner','brace','smoke','field-dressing','aimed-shot','vines','snare','herbs','venom','fallen-log','weapon-cache','armor-cache']
export const BALANCED_OPENING=['banner','brace','smoke','field-dressing','aimed-shot']
export const DEFAULT_ROSTER=['lion-regent','fox-duelist','turtle-guardian','turtle-siege','raven-duskwing','raven-stormcaller','hare-burrowguard','hare-windrunner',...Array.from({length:8},(_,i)=>i%2?'rat-tailblade':'rat-scout')]
export function defaultRosters():Record<Side,string[]>{return {w:[...DEFAULT_ROSTER],b:[...DEFAULT_ROSTER]}}
export function variantsForRole(role:Role):UnitDefinition[]{return Object.values(UNIT_DEFINITIONS).filter(u=>u.role===role)}

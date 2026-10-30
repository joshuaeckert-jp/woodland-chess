import { describe,expect,it } from 'vitest'
import { renderEffectCard,renderUnitCard } from '../src/checkmate/cards'
import type { Unit } from '../src/checkmate/types'

describe('effect card renderer',()=>{
 it('renders hand cards as accessible buttons with interaction data',()=>{
  const html=renderEffectCard({id:'card-1',definitionId:'banner'},{zone:'hand',ready:true,index:0,count:3})
  expect(html).toContain('class="cm-card tcg-card tcg-card--hand tcg-state-ready ready"')
  expect(html).toContain('data-card-id="card-1"')
  expect(html).toContain('data-zone="hand"')
  expect(html).toContain('aria-label="Rallying Banner, Buff, cooldown 1, In hand · install first"')
  expect(html).toContain('Order: exhaust · Effect: discard')
 })

 it('uses the 4 by 3 effect atlas coordinates for its framed art',()=>{
  const html=renderEffectCard({id:'card-5',definitionId:'vines'},{zone:'hand'})
  expect(html).toContain('--card-x:33.333%;--card-y:50.000%')
  expect(html).toContain('--fan-angle:0.00deg;--fan-y:0.00px')
  expect(html).toContain('tcg-card__art')
 })

 it('exposes its visual material and rule effect without changing card behavior',()=>{
  const terrain=renderEffectCard({id:'smoke-1',definitionId:'smoke'},{zone:'hand'})
  const defense=renderEffectCard({id:'brace-1',definitionId:'brace'},{zone:'hand'})
  expect(terrain).toContain('data-card-material="terrain"')
  expect(terrain).toContain('data-card-effect="smoke"')
  expect(defense).toContain('data-card-material="defense"')
 })

 it('renders support exhaustion and fresh locks as visibly distinct states',()=>{
  const exhausted=renderEffectCard({id:'spent',definitionId:'brace'},{zone:'support',remaining:2})
  const fresh=renderEffectCard({id:'fresh',definitionId:'smoke'},{zone:'support',fresh:true})
  expect(exhausted).toContain('tcg-state-exhausted tcg-exhausted')
  expect(exhausted).toContain('Exhausted · 2 own turns')
  expect(exhausted).toContain('data-cooldown-remaining="2"')
  expect(exhausted).toContain('tcg-card__cooldown-number')
  expect(exhausted).toContain('shape-rendering="crispEdges"')
  expect(exhausted).toContain('COOLDOWN')
  expect(fresh).toContain('tcg-state-locked')
  expect(fresh).toContain('Locked · installed this turn')
 })

 it('renders the detail card as an article and escapes supplied ids',()=>{
  const preview=renderEffectCard({id:'preview',definitionId:'reserve-order'},{zone:'preview'})
  const hand=renderEffectCard({id:'x\"><script>',definitionId:'reserve-order'},{zone:'hand'})
  expect(preview.startsWith('<article')).toBe(true)
  expect(preview).toContain('data-card-definition="reserve-order"')
  expect(preview).toContain('Effect: retained')
  expect(hand).toContain('data-card-id="x&quot;&gt;&lt;script&gt;"')
  expect(hand).not.toContain('<script>')
 })

 it('keeps the full printed effect readable in a preview',()=>{
  const html=renderEffectCard({id:'long',definitionId:'venom'},{zone:'preview'})
  expect(html).toContain('Apply Poison 2: 1 damage at the end of the target controller’s next two turns.')
  expect(html).toContain('tcg-card--preview')
 })

 it('renders an inspection unit card with its actual team sprite and current stats',()=>{
  const unit:Unit={id:'raven-1',side:'b',definitionId:'raven-stormcaller',role:'b',square:'c6',hp:3,maxHp:5,atk:3,def:0,combat:'ranged',range:4,hasMoved:false,veteran:false,equipment:{},statuses:[]}
  const html=renderUnitCard(unit,{hp:3,maxHp:5,atk:4,def:1})
  expect(html).toContain('tcg-unit-card tcg-card--opponent')
  expect(html).toContain("--species:url('/assets/sprites/raven.webp');--unit-x:0;--unit-y:55.555%")
  expect(html).toContain('HP 3/5')
  expect(html).toContain('ATK 4')
  expect(html).toContain('DEF 1')
  expect(html).toContain('ranged · range 4')
 })

 it('renders a reserve animal as a draggable hand card with its deployment cost',()=>{
  const unit:Unit={id:'turtle-1',side:'w',definitionId:'turtle-guardian',role:'r',square:null,hp:8,maxHp:8,atk:3,def:1,combat:'melee',range:7,hasMoved:false,veteran:false,equipment:{},statuses:[]}
  const html=renderUnitCard(unit,{hp:8,maxHp:8,atk:3,def:1},{zone:'hand',index:1,count:3})
  expect(html.startsWith('<button')).toBe(true)
  expect(html).toContain('tcg-card--hand tcg-unit-card')
  expect(html).toContain('data-card-id="turtle-1"')
  expect(html).toContain('data-unit-id="turtle-1"')
  expect(html).toContain('data-card-kind="unit"')
  expect(html).toContain('data-card-material="animal"')
  expect(html).toContain('data-species="turtle"')
  expect(html).toContain('--fan-angle:0.00deg;--fan-y:0.00px')
  expect(html).toContain('Deploy · one turn')
 })
})

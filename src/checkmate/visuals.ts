import { BoardRenderer, createMovePlan, DEPLOYMENT_DURATION, type RenderPiece } from '../BoardRenderer'
import { DeploymentCardFlight, type DeploymentOrigin } from './deployment-card'
import { EffectCardMotion, type EffectCardCue } from './effect-card-motion'
import { renderUnitCard } from './cards'
import { effectiveStats } from './engine'
import type { GameEvent, GameState, Side, Square, Unit } from './types'
import {SPELL_TOTAL_MS,SPELL_TRAVEL_MS} from './spell-timing'
import { removedObstacles, type BoardObstacle } from './obstacle-art'

export type TacticalEffectPlan = { kind: 'deploy'|'move'|'melee-lethal'|'melee-nonlethal'|'ranged'|'support'; actor?: string; target?: string; actorEnd?: Square|null; targetRemoved: boolean }

export function tacticalEffectPlan(before: GameState, after: GameState, events: GameEvent[]): TacticalEffectPlan {
  const deploy = events.find(event => event.type === 'deploy' && event.unitId && event.to)
  if (deploy) return { kind:'deploy', actor:deploy.unitId, actorEnd:deploy.to, targetRemoved:false }
  const attack = events.find(event => event.type === 'attack')
  const move = events.find(event => event.type === 'move')
  if (!attack) return { kind: move ? 'move' : 'support', actor: move?.unitId, actorEnd: move?.to ?? null, targetRemoved: false }
  const actor = before.units.find(unit => unit.id === attack.unitId)
  const target = before.units.find(unit => unit.id === attack.targetUnitId)
  const alive = target ? after.units.some(unit => unit.id === target.id && unit.hp > 0 && unit.square) : false
  if (attack.combat === 'ranged') return { kind: 'ranged', actor: actor?.id, target: target?.id, actorEnd: actor?.square, targetRemoved: !alive }
  const afterActor = actor && after.units.find(unit => unit.id === actor.id)
  return { kind: alive ? 'melee-nonlethal' : 'melee-lethal', actor: actor?.id, target: target?.id, actorEnd: afterActor?.square, targetRemoved: !alive }
}

const pieces = (state: GameState): RenderPiece[] => state.units.filter(unit => unit.hp > 0 && unit.square).map(unit => ({ square: unit.square!, type: unit.role, color: unit.side }))
const obstacles = (state: GameState): BoardObstacle[] => Object.values(state.obstacles ?? {}).filter((obstacle): obstacle is NonNullable<typeof obstacle> => Boolean(obstacle)).map(obstacle => ({ square: obstacle.square, kind: obstacle.kind, spent: obstacle.spent }))
const optionalImage = (src: string): Promise<HTMLImageElement|null> => new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = src })

export class TacticalRenderer {
  readonly ready: Promise<void>
  readonly readyPromise: Promise<void>
  private readonly deploymentCard = new DeploymentCardFlight()
  private readonly effectCard = new EffectCardMotion()
  private readonly board: BoardRenderer
  private readonly overlay: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private state: GameState | null = null
  private selected: Square | null = null
  private targets: Square[] = []
  private effect: TacticalEffectPlan | null = null
  private beforeState: GameState | null = null
  private events: GameEvent[] = []
  private terrainArt: HTMLImageElement | null = null
  private ambientRaf = 0
  private ambientLast = 0
  private inViewport = true
  private destroyed = false
  private habitatDragging = false
  private intersection: IntersectionObserver | null = null
  private raf = 0
  private revision = 0
  private pendingResolve: (() => void) | null = null
  private reduced = false
  private flipped = false
  private pendingState: GameState | null = null
  private visualProgress = 0
  private observer: ResizeObserver | null
  private cue:EffectCardCue|undefined

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.board = new BoardRenderer(canvas)
    this.ready = this.board.ready.then(async () => { this.terrainArt = await optionalImage('/assets/checkmate/terrain.webp') })
    this.readyPromise = this.ready
    this.overlay = document.createElement('canvas')
    this.overlay.setAttribute('aria-hidden', 'true')
    Object.assign(this.overlay.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' })
    canvas.parentElement?.append(this.overlay)
    const context = this.overlay.getContext('2d')
    if (!context) throw new Error('Project Checkmate requires a 2D overlay')
    this.ctx = context
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resize())
    this.observer?.observe(canvas)
    this.intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries=>{this.inViewport=entries.some(e=>e.isIntersecting);this.syncAmbient()})
    this.intersection?.observe(canvas)
    this.resize()
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  setState(state: GameState): void { this.state = state; this.board.setObstacles(obstacles(state)); this.board.setPosition(pieces(state)); this.draw(); this.syncAmbient() }
  setSelection(selected: Square|null, targets: Square[], last?: [Square, Square]): void { this.selected = selected; this.targets = targets; this.board.setSelection(selected, targets, last); this.draw() }
  setFlipped(value: boolean): void { this.flipped = value; this.board.setFlipped(value); this.draw() }
  setReducedMotion(value: boolean): void { this.reduced = value; this.stopAmbient(); this.board.setReducedMotion(value); if (value && this.pendingState) this.cancel(this.pendingState); this.draw(); this.syncAmbient() }
  setFocus(square: Square|null): void { this.board.setFocus(square) }
  getSquarePolygon(square: Square) { return this.board.getSquarePolygon(square) }
  /** Client-coordinate habitat preview used by the direct-drag interaction. */
  setHabitatDrag(unitId:string|null, point?:{x:number;y:number}, target?:Square|null): void {
    if(!unitId||!point||!this.state){this.habitatDragging=false;this.board.previewHabitatDrag(null);this.syncAmbient();return}
    const unit=this.state.units.find(value=>value.id===unitId&&value.hp>0&&value.square)
    if(!unit?.square){this.habitatDragging=false;this.board.previewHabitatDrag(null);this.syncAmbient();return}
    this.habitatDragging=true;this.syncAmbient()
    const rect=this.canvas.getBoundingClientRect()
    this.board.previewHabitatDrag({square:unit.square,type:unit.role,color:unit.side},{x:point.x-rect.left,y:point.y-rect.top},target)
  }
  /** Call before an ordinary move/lethal melee commit to avoid replaying ground travel. */
  finishHabitatDrag(): void { this.habitatDragging=false; this.board.finishHabitatDrag(); this.syncAmbient() }

  async animate(before: GameState, after: GameState, events: GameEvent[], origin?: DeploymentOrigin, cue?:EffectCardCue): Promise<void> {
    this.cancel()
    const token = this.revision
    this.stopAmbient()
    this.pendingState = after
    const plan = tacticalEffectPlan(before, after, events)
    if (this.reduced) { this.pendingState = null; this.setState(after); return }
    this.state = before
    this.board.setObstacles(obstacles(before))
    this.beforeState = before
    this.effect = plan
    this.events = events
    this.cue = cue
    const actor = plan.actor && before.units.find(unit => unit.id === plan.actor)
    const target = plan.target && before.units.find(unit => unit.id === plan.target)
    let duration = 650, impact = .25
    let scene: Promise<void>
    if (plan.kind === 'deploy' && actor && plan.actorEnd) {
      duration = DEPLOYMENT_DURATION
      impact = 1
      const rect=this.canvas.getBoundingClientRect(),point=this.point(plan.actorEnd),poly=this.board.getSquarePolygon(plan.actorEnd)
      const tile=(Math.max(...poly.map(p=>p.x))-Math.min(...poly.map(p=>p.x)))*rect.width
      const from=origin??{x:rect.left+rect.width*.5-64,y:actor.side===(this.flipped?'b':'w')?rect.bottom-30:rect.top-100,width:128,height:185}
      this.canvas.parentElement!.dataset.deploymentStage='card'
      this.deploymentCard.start(renderUnitCard(after.units.find(u=>u.id===actor.id)!,effectiveStats(after,actor.id),{zone:'hand',combatRules:after.options.combatRules}),from,{x:rect.left+point.x,y:rect.top+point.y+tile*.12,width:tile*.93},duration)
      scene=this.board.animateDeployment(pieces(before),pieces(after),{square:plan.actorEnd,type:actor.role,color:actor.side})
    } else if (plan.kind === 'move' && actor) {
      const move = events.find(e => e.type === 'move')!
      duration = createMovePlan(move.from!, move.to!, false, this.flipped).duration + 400
      impact = (duration - 400) / duration
      scene = this.board.animate(pieces(before), pieces(after), { from: move.from!, to: move.to!, piece: actor.role, color: actor.side })
    } else if (actor && target) {
      duration = plan.kind === 'ranged' ? 760 : plan.targetRemoved ? createMovePlan(actor.square!, target.square!, true, this.flipped).duration : 1600
      impact = plan.targetRemoved && plan.kind !== 'ranged' ? .84 : .77
      scene = this.board.animateTacticalEncounter(pieces(before), pieces(after), { from: actor.square!, target: target.square!, landing: plan.actorEnd ?? actor.square!, piece: actor.role, color: actor.side, targetPiece: target.role, targetColor: target.side, lethal: plan.targetRemoved, ranged: plan.kind === 'ranged' })
    } else { this.board.setPosition(pieces(before)); scene = Promise.resolve() }
    if(cue?.kind==='burn'){duration=SPELL_TOTAL_MS;impact=SPELL_TRAVEL_MS/SPELL_TOTAL_MS}
    const cardScene=cue?this.effectCard.start(cue):Promise.resolve()
    await Promise.all([scene, cardScene, this.playOverlay(Math.max(duration,cue?.kind==='burn'?SPELL_TOTAL_MS:cue?.kind==='install'?680:0), impact, token)])
    if (token !== this.revision) return
    this.deploymentCard.cancel()
    delete this.canvas.parentElement!.dataset.deploymentStage
    this.pendingState = null
    this.effect = null
    this.beforeState = null
    this.events = []
    this.cue = undefined
    this.setState(after)
  }

  private playOverlay(duration: number, impact: number, token: number): Promise<void> {
    return new Promise<void>(resolve => {
      const start = performance.now()
      this.pendingResolve = resolve
      const tick = (now: number) => {
        if (token !== this.revision) return resolve()
        const t = Math.min(1, (now - start) / duration)
        if(this.effect?.kind==='deploy')this.canvas.parentElement!.dataset.deploymentStage=t<.34?'card':t<.60?'habitat':t<.86?'animal':'settle'
        if (t >= impact && this.pendingState) { this.state = this.pendingState; this.board.setObstacles(obstacles(this.pendingState)) }
        this.visualProgress = impact===1?0:Math.max(0, (t - impact) / (1 - impact))
        this.draw(t < impact ? -1 : this.visualProgress,now)
        if (t < 1) this.raf = requestAnimationFrame(tick)
        else { this.raf=0; this.pendingResolve = null; resolve() }
      }
      this.raf = requestAnimationFrame(tick)
    })
  }
  cancel(after?: GameState): void { this.stopAmbient(); this.habitatDragging=false; this.deploymentCard.cancel(); this.effectCard.cancel(); delete this.canvas.parentElement!.dataset.deploymentStage; ++this.revision; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; this.effect = null; this.beforeState = null; this.events = []; this.cue=undefined; const resolve = this.pendingResolve; this.pendingResolve = null; const settled = after ?? this.pendingState; this.pendingState = null; if (settled) this.setState(settled); else this.draw(); this.board.cancel(settled ? pieces(settled) : undefined); resolve?.(); this.syncAmbient() }
  private readonly onVisibility = () => { if (document.hidden && this.pendingState) this.cancel(this.pendingState); this.syncAmbient() }
  destroy(): void { this.destroyed=true;this.stopAmbient();this.intersection?.disconnect(); document.removeEventListener('visibilitychange', this.onVisibility); this.cancel(); this.observer?.disconnect(); this.overlay.remove(); this.board.destroy() }
  celebrate(winner: Side|'draw'): Promise<void> { return this.board.celebrate(winner) }

  private stopAmbient():void{if(this.ambientRaf)cancelAnimationFrame(this.ambientRaf);this.ambientRaf=0}
  private canAnimateTerrain():boolean{return !this.destroyed&&!this.reduced&&!document.hidden&&document.body.dataset.gameBusy!=='true'&&this.inViewport&&!this.habitatDragging&&!this.effect&&!this.pendingState&&!this.raf&&Boolean(this.state&&Object.values(this.state.terrain).some(t=>t?.kind==='smoke'))}
  private syncAmbient():void{
    this.stopAmbient()
    if(!this.canAnimateTerrain())return
    const tick=(now:number)=>{this.ambientRaf=0;if(!this.canAnimateTerrain())return;if(now-this.ambientLast>=1000/12){this.ambientLast=now;this.draw(0,now)}this.ambientRaf=requestAnimationFrame(tick)}
    this.ambientRaf=requestAnimationFrame(tick)
  }
  private resize(): void { if (this.pendingState) this.cancel(this.pendingState); const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); this.overlay.width = Math.max(1, Math.round(rect.width * dpr)); this.overlay.height = Math.max(1, Math.round(rect.height * dpr)); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.draw();this.syncAmbient() }
  private point(square: Square) { const p = this.board.getSquarePolygon(square); return { x: p.reduce((n, v) => n + v.x, 0) / 4 * this.canvas.clientWidth, y: p.reduce((n, v) => n + v.y, 0) / 4 * this.canvas.clientHeight } }
  private draw(progress = 0,now=performance.now()): void {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight; this.ctx.clearRect(0, 0, width, height)
    if (!this.state) return
    this.drawTerrain(this.reduced?0:now)
    for (const unit of this.state.units) if (unit.hp > 0 && unit.square) this.drawUnitMeta(unit)
    if(this.cue?.kind==='burn'&&progress>=0)this.drawSpellCue(Math.min(1,progress))
    if (this.beforeState && this.state && progress >= 0) this.drawObstacleRubble(removedObstacles(obstacles(this.beforeState), obstacles(this.state)), progress)
    if (!this.effect || progress < 0) return
    for (const e of this.events) {
      if (!['damage', 'heal', 'status', 'terrain', 'item', 'equipment', 'promote'].includes(e.type)) continue
      const poison = e.type === 'damage' && e.text.includes('Poison')
      if (poison && progress < .65) continue
      const t = Math.min(1, poison ? (progress-.65)/.35 : progress)
      const id = e.targetUnitId ?? e.unitId
      const square = e.to ?? (id && (this.state.units.find(u => u.id === id)?.square ?? [...this.events].reverse().find(event=>event.type==='move'&&event.unitId===id)?.to ?? this.beforeState?.units.find(u => u.id === id)?.square))
      if (!square) continue
      const point = this.point(square)
      const u = id && this.state.units.find(u => u.id === id)
      const index = e.type === 'heal' ? 4 : e.type === 'equipment' || e.type === 'promote' ? 3 : e.type === 'status' ? (u && u.statuses.some(s => s.kind === 'rooted') ? 7 : u && u.statuses.some(s => s.kind === 'poison') ? 5 : 3) : e.type === 'damage' && e.text.includes('Poison') ? 5 : 6
      this.ctx.save()
      this.ctx.globalAlpha = Math.sin(Math.PI * Math.min(.99, t)) * .85
      const size = this.canvas.clientWidth * .10 * (.8 + t * .3)
      if (this.terrainArt && e.type !== 'terrain' && e.type !== 'item') this.ctx.drawImage(this.terrainArt, index % 4 * 192, Math.floor(index / 4) * 192, 192, 192, point.x-size/2, point.y-size/2, size, size)
      this.ctx.restore()
      if ((e.type === 'damage' || e.type === 'heal') && e.amount) {
        this.ctx.save(); this.ctx.globalAlpha = 1 - Math.max(0, t - .7) / .3
        this.ctx.font = `bold ${Math.max(13, this.canvas.clientWidth*.023)}px ui-monospace, monospace`
        this.ctx.lineWidth = 3; this.ctx.strokeStyle = '#102330'
        this.ctx.fillStyle = e.type === 'heal' ? '#b5f0b2' : '#ffd2af'
        const label = `${e.type === 'heal' ? '+' : '−'}${e.amount}`
        this.ctx.strokeText(label, point.x + 5, point.y - 12 - t*18)
        this.ctx.fillText(label, point.x + 5, point.y - 12 - t*18); this.ctx.restore()
      }
    }
  }
  private drawSpellCue(progress:number):void {
    const cue=this.cue
    if(!cue)return
    const target=cue.targetSquare as Square|undefined
    if(!target)return
    const p=this.point(target),ctx=this.ctx
    const effect=cue.effect??''
    const palette=effect==='heal'||effect==='purify'?'#b8f0ad':effect==='guard'?'#80c6df':effect==='inspire'?'#f3d875':effect==='shot'?'#ff9e58':effect==='poison'?'#bb82d8':effect==='root'||effect==='snare'?'#79ae66':effect==='smoke'?'#d1dcdf':effect==='log'?'#bc8555':'#cad5ae'
    ctx.save()
    ctx.imageSmoothingEnabled=false
    ctx.fillStyle=palette
    // The screen-space mist owns travel; this layer only adds the target's ability glyph.
    const pulse=Math.sin(Math.min(.98,progress)*Math.PI),size=Math.max(10,this.canvas.clientWidth*.032)*(1+progress*.35)
    ctx.globalAlpha=pulse*.9
    if(effect==='guard'){
      ctx.strokeStyle=palette;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x,p.y-size*.62);ctx.lineTo(p.x+size*.48,p.y-size*.30);ctx.lineTo(p.x+size*.34,p.y+size*.43);ctx.lineTo(p.x,p.y+size*.62);ctx.lineTo(p.x-size*.34,p.y+size*.43);ctx.lineTo(p.x-size*.48,p.y-size*.30);ctx.closePath();ctx.stroke()
    } else if(effect==='inspire'){
      for(let i=-1;i<=1;i++){ctx.fillRect(Math.round(p.x+i*size*.26)-3,Math.round(p.y-size*.66),6,Math.round(size*.48));ctx.fillRect(Math.round(p.x+i*size*.26)-size*.12,Math.round(p.y-size*.18),Math.round(size*.24),4)}
    } else if(effect==='heal'){
      ctx.fillRect(Math.round(p.x-size*.12),Math.round(p.y-size*.48),Math.round(size*.24),Math.round(size*.96));ctx.fillRect(Math.round(p.x-size*.48),Math.round(p.y-size*.12),Math.round(size*.96),Math.round(size*.24));for(let i=0;i<5;i++)ctx.fillRect(Math.round(p.x-size*.5+i*size*.25),Math.round(p.y+size*.46-i*size*.12),4,4)
    } else if(effect==='armor'){
      ctx.fillStyle='#b8c5cf';ctx.fillRect(Math.round(p.x-size*.38),Math.round(p.y-size*.36),Math.round(size*.76),Math.round(size*.72));ctx.fillStyle='#718391';ctx.fillRect(Math.round(p.x-size*.12),Math.round(p.y-size*.48),Math.round(size*.24),Math.round(size*.96))
    } else if(effect==='weapon'){
      ctx.fillStyle='#c7d5dc';ctx.fillRect(Math.round(p.x-3),Math.round(p.y-size*.58),6,Math.round(size*.9));ctx.fillRect(Math.round(p.x-size*.3),Math.round(p.y+size*.14),Math.round(size*.6),5);ctx.fillStyle='#f1df8b';ctx.fillRect(Math.round(p.x-2),Math.round(p.y-size*.42),4,Math.round(size*.36))
    } else if(effect==='shot'){
      ctx.fillStyle='#ffca72';ctx.fillRect(Math.round(p.x-size*.68),Math.round(p.y-2),Math.round(size*.96),4);ctx.fillStyle='#ff7755';ctx.fillRect(Math.round(p.x+size*.28),Math.round(p.y-size*.22),Math.round(size*.22),Math.round(size*.44))
    } else if(effect==='poison'){
      for(let i=0;i<5;i++)ctx.fillRect(Math.round(p.x+Math.cos(i*1.9)*size*.42)-3,Math.round(p.y-size*.34+i*size*.17)-3,6,6)
    } else if(effect==='smoke'){
      ctx.fillStyle='#d1dcdf';for(let i=0;i<5;i++)ctx.fillRect(Math.round(p.x-size*.55+i*size*.22),Math.round(p.y-size*.25+(i%2)*size*.16),Math.round(size*.34),Math.round(size*.34))
    } else if(effect==='purify'){
      ctx.fillStyle='#eef7e8';ctx.fillRect(Math.round(p.x-3),Math.round(p.y-size*.52),6,Math.round(size*1.04));ctx.fillRect(Math.round(p.x-size*.52),Math.round(p.y-3),Math.round(size*1.04),6);ctx.fillStyle='#72cfd0';ctx.fillRect(Math.round(p.x-size*.17),Math.round(p.y-size*.17),Math.round(size*.34),Math.round(size*.34))
    }
    else if(effect==='root'||effect==='snare'){for(let i=-1;i<=1;i++){ctx.fillRect(Math.round(p.x+i*size*.2)-2,Math.round(p.y),4,Math.round(size*.55));ctx.fillRect(Math.round(p.x+i*size*.2)-size*.16,Math.round(p.y+size*.32),Math.round(size*.32),3)}}
    else if(effect==='log'){ctx.fillRect(Math.round(p.x-size*.55),Math.round(p.y-size*.05),Math.round(size*1.1),Math.round(size*.22));ctx.fillStyle='#6b452d';ctx.fillRect(Math.round(p.x-size*.42),Math.round(p.y),Math.round(size*.84),3)}
    else {for(let i=0;i<5;i++){const a=i*Math.PI*2/5+progress*2;ctx.fillRect(Math.round(p.x+Math.cos(a)*size*.55)-3,Math.round(p.y+Math.sin(a)*size*.55)-3,6,6)}ctx.fillRect(Math.round(p.x-4),Math.round(p.y-4),8,8)}
    ctx.restore()
  }
  private drawObstacleRubble(removed: BoardObstacle[], progress:number):void {
    if (!removed.length) return
    const size=Math.max(2,this.canvas.clientWidth*.012),ctx=this.ctx
    ctx.save(); ctx.fillStyle='#9b8c70'; ctx.globalAlpha=1-progress*.45
    for(const obstacle of removed){const p=this.point(obstacle.square as Square);for(let i=0;i<7;i++){const angle=i*2.41;const distance=size*(1+progress*3)*(i%3+1);ctx.fillRect(Math.round(p.x+Math.cos(angle)*distance-size/2),Math.round(p.y+Math.sin(angle)*distance-size/2),size,size)}}
    ctx.restore()
  }
  private drawTerrain(now:number): void {
    if (!this.state) return
    const draw = (square: Square, glyph: string, color: string, index: number) => { const poly = this.board.getSquarePolygon(square), w = this.canvas.clientWidth, h = this.canvas.clientHeight, ctx = this.ctx; ctx.save(); ctx.beginPath(); ctx.moveTo(poly[0].x*w,poly[0].y*h); for(let i=1;i<4;i++)ctx.lineTo(poly[i].x*w,poly[i].y*h); ctx.closePath(); ctx.clip(); const p=this.point(square); if(this.terrainArt){const cell=this.terrainArt.naturalWidth/4,sx=index%4*cell,sy=Math.floor(index/4)*cell,size=Math.min(w,h)*.105;ctx.drawImage(this.terrainArt,sx,sy,cell,cell,p.x-size/2,p.y-size/2,size,size)}else{ctx.fillStyle=color;ctx.globalAlpha=.7;ctx.font='16px monospace';ctx.fillText(glyph,p.x-6,p.y+5)}ctx.restore() }
    for (const terrain of Object.values(this.state.terrain)) if (terrain) {
      draw(terrain.square, terrain.kind === 'smoke' ? '☁' : '▰', terrain.kind === 'smoke' ? '#d7d9db' : '#9a7049', terrain.kind === 'smoke' ? 0 : 1)
      if(terrain.kind==='smoke'){
        const poly=this.board.getSquarePolygon(terrain.square),w=this.canvas.clientWidth,h=this.canvas.clientHeight,ctx=this.ctx,p=this.point(terrain.square),tile=(Math.max(...poly.map(v=>v.x))-Math.min(...poly.map(v=>v.x)))*w,seed=terrain.square.charCodeAt(0)+Number(terrain.square[1])*7
        ctx.save();ctx.beginPath();ctx.moveTo(poly[0].x*w,poly[0].y*h);for(let i=1;i<4;i++)ctx.lineTo(poly[i].x*w,poly[i].y*h);ctx.closePath();ctx.clip();ctx.fillStyle='#d7e6dc'
        for(let i=0;i<7;i++){const phase=(now/6500+seed*.17+i*.147)%1;ctx.globalAlpha=.05+Math.sin(phase*Math.PI)*.10;const x=p.x+Math.sin(seed+i*1.9+phase*3)*tile*.37,y=p.y+tile*(.35-phase*.5);ctx.fillRect(Math.round(x-tile*.14),Math.round(y),Math.max(3,Math.round(tile*.3)),Math.max(2,Math.round(tile*.07)));ctx.fillRect(Math.round(x-tile*.06),Math.round(y-tile*.05),Math.max(2,Math.round(tile*.16)),Math.max(2,Math.round(tile*.05)))}ctx.restore()
      }
    }
    for (const item of Object.values(this.state.items)) if (item) draw(item.square, '⌘', '#d2bb65', 2)
  }
  private drawUnitMeta(unit: Unit): void {
    const point = this.point(unit.square!), w = Math.max(22, this.canvas.clientWidth * .05), ctx = this.ctx
    if (this.state?.options.combatRules!=='capture'&&(unit.hp < unit.maxHp || unit.role === 'k' || this.selected === unit.square)) { ctx.fillStyle = 'rgba(24,32,32,.8)'; ctx.fillRect(point.x - w / 2, point.y + w * .34, w, 4); ctx.fillStyle = unit.side === 'w' ? '#e4d391' : '#79b1ab'; ctx.fillRect(point.x - w / 2, point.y + w * .34, w * unit.hp / unit.maxHp, 4) }
    const badges = [unit.statuses.some(s=>s.kind==='guarded')?'◈':'',unit.statuses.some(s=>s.kind==='inspired')?'↟':'',unit.statuses.some(s => s.kind === 'rooted') ? '⌁' : '', unit.statuses.some(s => s.kind === 'poison') ? '☠' : '', unit.equipment.weapon ? '⚔' : '', unit.equipment.armor ? '◆' : '', unit.veteran ? '★' : ''].filter(Boolean)
    if (badges.length) { ctx.fillStyle = '#f0cf7a'; ctx.font = '10px monospace'; ctx.fillText(badges.join(''), point.x - w * .45, point.y - w * .28) }
  }
}

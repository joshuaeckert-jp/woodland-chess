import type { Color, PieceSymbol, Square } from "chess.js";
import { OBSTACLE_SPRITE_LAYOUT, obstacleGeometry, towerPerchElevation, type BoardObstacle } from "./checkmate/obstacle-art";
import { BOARD_AMBIENCE_FRAME_MS, canRunBoardAmbience, idlePoseForPiece, rimMoteAt } from "./board-ambience";
import { drawCourtyardTiles, loadCourtyardArt } from "./courtyard-tiles";
import { drawSquareHabitat, loadSquareHabitatArt } from "./square-habitats";

export type { BoardObstacle } from "./checkmate/obstacle-art";

export interface RenderPiece {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

export interface MoveEffect {
  from: Square;
  to: Square;
  piece: PieceSymbol;
  color: Color;
  capturedSquare?: Square;
  rook?: { from: Square; to: Square };
  promotion?: PieceSymbol;
  /** The direct-manipulation preview has already carried the ground to `to`. */
  habitatPlaced?: boolean;
}

export interface TacticalEncounterEffect {
  from: Square; target: Square; landing: Square; piece: PieceSymbol; color: Color
  targetPiece: PieceSymbol; targetColor: Color; lethal: boolean; ranged: boolean
}

type Point = { x: number; y: number };
type Transient = {
  piece: RenderPiece;
  from: Point;
  to: Point;
  progress: number;
  animalProgress: number;
  frame: number;
  opacity?: number;
  scale?: number;
  plan: MovePlan;
  animalCenter?: Point;
  habitatCenter?: Point;
  habitatScale?: number;
  animalScale?: number;
  habitatOpacity?: number;
  animalOpacity?: number;
  perchFrom?: number;
  perchTo?: number;
  mirror?: boolean;
  role?: "mover" | "victim" | "rook" | "deployment";
};

const SPECIES: Record<PieceSymbol, string> = {
  k: "lion", q: "fox", b: "raven", n: "hare", r: "turtle", p: "rat",
};
const PIECE_ORDER: PieceSymbol[] = ["k", "q", "b", "n", "r", "p"];
const LIGHT = "#DDCDA7";
const TEAL = "#315754";
const BOARD_SIZE = 1254;
const GRID_Y = [98, 220, 343, 467, 590, 713, 832, 949, 1084];
const GRID_TOP = { left: 136, right: 1117 };
const GRID_BOTTOM = { left: 117, right: 1137 };

/** Asset-space projected corners, normalized to the full 1254px board image. */
export function projectSquarePolygon(square: Square, flipped = false): Point[] {
  const grid = squareGrid(square);
  const col = flipped ? 7 - grid.x : grid.x;
  const row = flipped ? 7 - grid.y : grid.y;
  const edge = (rowIndex: number, colIndex: number): Point => {
    const y = GRID_Y[rowIndex];
    const ratio = (y - GRID_Y[0]) / (GRID_Y[8] - GRID_Y[0]);
    const left = GRID_TOP.left + (GRID_BOTTOM.left - GRID_TOP.left) * ratio;
    const right = GRID_TOP.right + (GRID_BOTTOM.right - GRID_TOP.right) * ratio;
    return { x: (left + (right - left) * colIndex / 8) / BOARD_SIZE, y: y / BOARD_SIZE };
  };
  return [edge(row, col), edge(row, col + 1), edge(row + 1, col + 1), edge(row + 1, col)];
}

/** The side nearest the viewer shows its rear, so both armies face the opponent. */
export function restFrameForPiece(color: Color, flipped: boolean): number {
  return (color === "w") !== flipped ? 16 : 0;
}

export interface MovePlan {
  duration: number;
  distance: number;
  walkFrames: [number, number];
  departureFrame: number;
  hasCapture: boolean;
  facing: "away" | "toward" | "side";
  mirror: boolean;
}

export type AnimationStage = "habitat" | "rise" | "turn-away" | "chase" | "attack" | "turn-back" | "settle" | "sit";

export const DEPLOYMENT_DURATION = 1600;

export interface DeploymentFrame {
  habitatOpacity: number;
  habitatScale: number;
  animalOpacity: number;
  animalStage: "hidden" | "arrive" | "settle" | "rest";
}

export function deploymentFrameAt(progress: number): DeploymentFrame {
  const t = Math.max(0, Math.min(1, progress));
  const habitat = t >= .58 ? 1 : Math.max(0, Math.min(1, (t - .34) / .24));
  const animal = t >= .72 ? 1 : Math.max(0, Math.min(1, (t - .60) / .12));
  return {
    habitatOpacity: habitat,
    habitatScale: .82 + habitat * .18,
    animalOpacity: animal,
    animalStage: t < .60 ? "hidden" : t < .84 ? "arrive" : t < .96 ? "settle" : "rest",
  };
}

export function animationStageAt(progress: number, capture: boolean): AnimationStage {
  if (progress < .18) return "habitat";
  if (progress < .30) return "rise";
  if (progress < .38) return "turn-away";
  if (progress < .78) return "chase";
  if (capture && progress < .87) return "attack";
  if (progress < .93) return "turn-back";
  if (progress < .975) return "settle";
  return "sit";
}

export interface CaptureLayout {
  active: boolean;
  reclaim: boolean;
  defender: { x: number; y: number; scale: number; opacity: number };
  incoming: { x: number; y: number; scale: number };
}

/** Encounter positions are tile-relative, making capture choreography testable. */
export function captureLayoutAt(progress: number): CaptureLayout {
  const enter = Math.max(0, Math.min(1, (progress - .10) / .08));
  const reclaim = Math.max(0, Math.min(1, (progress - .87) / .13));
  const active = progress >= .10 && progress < 1;
  const defenderOpacity = progress < .87 ? 1 : 1 - reclaim;
  return {
    active,
    reclaim: reclaim > 0,
    defender: { x: .20 * enter, y: -.18 * enter, scale: 1 - .28 * enter, opacity: defenderOpacity },
    incoming: {
      x: -.10 * enter * (1 - reclaim),
      y: .10 * enter * (1 - reclaim),
      scale: 1 - .22 * enter * (1 - reclaim),
    },
  };
}

/** A deterministic plan keeps motion testing independent of a canvas or sprite asset. */
export function createMovePlan(from: Square, to: Square, capture = false, flipped = false): MovePlan {
  const a = squareGrid(from);
  const b = squareGrid(to);
  const distance = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  // Motion is described from the viewer's camera, rather than White's ranks.
  const fromDisplayY = flipped ? 7 - a.y : a.y;
  const toDisplayY = flipped ? 7 - b.y : b.y;
  const fromDisplayX = flipped ? 7 - a.x : a.x;
  const toDisplayX = flipped ? 7 - b.x : b.x;
  const away = toDisplayY < fromDisplayY;
  const facing = fromDisplayY === toDisplayY ? "side" : away ? "away" : "toward";
  return {
    distance,
    duration: capture
      ? Math.min(2600, Math.max(2200, 2130 + distance * 70))
      : Math.min(1800, Math.max(1300, 1217 + distance * 83)),
    walkFrames: facing === "side" ? [2, 11] : away ? [6, 7] : [4, 5],
    departureFrame: away ? 3 : 1,
    hasCapture: capture,
    facing,
    mirror: facing === "side" && toDisplayX < fromDisplayX,
  };
}

function squareGrid(square: Square): Point {
  return { x: square.charCodeAt(0) - 97, y: 8 - Number(square[1]) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load woodland sprite: ${url}`));
    image.src = url;
  });
}

function loadOptionalImage(url: string): Promise<HTMLImageElement | null> {
  return loadImage(url).catch(() => null);
}

export class BoardRenderer {
  readonly ready: Promise<void>;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly observer: ResizeObserver | null;
  private readonly viewportObserver: IntersectionObserver | null;
  private pieces: RenderPiece[] = [];
  private obstacles: BoardObstacle[] = [];
  private selected: Square | null = null;
  private focused: Square | null = null;
  private legal: Square[] = [];
  private last?: [Square, Square];
  private check?: Square;
  private flipped = false;
  private reducedMotion = false;
  private destroyed = false;
  private animationId = 0;
  private raf = 0;
  private ambienceRaf = 0;
  private ambienceLast = 0;
  private ambienceNow = 0;
  private canvasVisible = true;
  private celebrationId = 0;
  private celebrationRaf = 0;
  private celebration: { winner: "w" | "b" | "draw"; progress: number } | null = null;
  private settleCelebration: (() => void) | null = null;
  private transient: Transient[] = [];
  private pendingAfter?: RenderPiece[];
  private habitatDrag: { piece: RenderPiece; point: Point; target?: Square } | null = null;
  private committedHabitat: { from: Square; to: Square } | null = null;
  private settleAnimation: (() => void) | null = null;
  private cssWidth = 1;
  private cssHeight = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Woodland chess requires a 2D canvas");
    this.ctx = ctx;
    this.ready = Promise.all([
      loadCourtyardArt(),
      loadSquareHabitatArt(),
      ...Object.values(SPECIES).map((species) => loadImage(`/assets/sprites/${species}.webp`).then((image) => this.images.set(species, image))),
      loadImage("/assets/sprites/habitats.webp").then((image) => this.images.set("habitats", image)),
      loadImage("/assets/board.webp").then((image) => this.images.set("board", image)),
      loadOptionalImage("/assets/checkmate/wall-scenery.webp").then((image) => { if (image) this.images.set("obstacle-wall", image); }),
      loadOptionalImage("/assets/checkmate/tower-scenery.webp").then((image) => { if (image) this.images.set("obstacle-tower", image); }),
    ]).then(() => undefined);
    const resize = () => this.resize();
    this.observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    this.observer?.observe(canvas);
    this.viewportObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      this.canvasVisible = entries.some((entry) => entry.target === this.canvas && entry.isIntersecting);
      if (this.canvasVisible) this.startAmbience(); else this.stopAmbience();
    });
    this.viewportObserver?.observe(canvas);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.resize();
    void this.ready.then(() => this.startAmbience());
  }

  setPosition(pieces: RenderPiece[]): void {
    this.pieces = pieces.map((piece) => ({ ...piece }));
    this.transient = [];
    this.draw();
    this.startAmbience();
  }

  /** Optional tactical scenery; classic chess deliberately leaves this empty. */
  setObstacles(obstacles: readonly BoardObstacle[]): void {
    this.obstacles = obstacles.map(obstacle => ({ ...obstacle }));
    this.draw();
    this.startAmbience();
  }

  /**
   * Draw-only direct-manipulation preview. `point` is canvas-local CSS pixels;
   * state and animal poses are intentionally left untouched.
   */
  previewHabitatDrag(piece: RenderPiece | null, point?: Point, target?: Square | null): void {
    this.habitatDrag = piece && point ? { piece: { ...piece }, point: { ...point }, ...(target ? { target } : {}) } : null;
    if (this.habitatDrag) this.stopAmbience(); else this.startAmbience();
    this.draw();
  }

  /**
   * Preserve a valid drag's ground placement into the next matching move scene.
   * Call immediately before committing the engine action; ranged/nonlethal scenes
   * deliberately ignore this handoff and continue to use their legal landing.
   */
  finishHabitatDrag(): void {
    const preview = this.habitatDrag;
    this.habitatDrag = null;
    this.committedHabitat = preview?.target ? { from: preview.piece.square, to: preview.target } : null;
    this.draw();
    this.startAmbience();
  }

  setSelection(selected: Square | null, legal: Square[], last?: [Square, Square], check?: Square): void {
    this.selected = selected;
    this.legal = [...legal];
    this.last = last;
    this.check = check;
    this.draw();
  }

  setFocus(square: Square | null): void {
    this.focused = square;
    this.draw();
  }

  setFlipped(flipped: boolean): void {
    this.flipped = flipped;
    this.draw();
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
    if (value && this.transient.length) this.cancel();
    if (value) this.stopAmbience(); else this.startAmbience();
    this.draw();
  }

  celebrate(winner: "w" | "b" | "draw"): Promise<void> {
    this.cancelCelebration();
    if (this.reducedMotion || this.destroyed) return Promise.resolve();
    this.stopAmbience();
    const token = ++this.celebrationId;
    const duration = winner === "draw" ? 1800 : 2100;
    const started = performance.now();
    return new Promise((resolve) => {
      this.settleCelebration = resolve;
      const tick = (now: number) => {
        if (token !== this.celebrationId || this.destroyed) return resolve();
        this.celebration = { winner, progress: Math.min(1, (now - started) / duration) };
        this.draw();
        if (this.celebration.progress < 1) this.celebrationRaf = requestAnimationFrame(tick);
        else {
          this.celebration = null;
          this.celebrationRaf = 0;
          this.settleCelebration = null;
          this.draw();
          this.startAmbience();
          resolve();
        }
      };
      this.celebrationRaf = requestAnimationFrame(tick);
    });
  }

  cancelCelebration(): void {
    ++this.celebrationId;
    if (this.celebrationRaf) cancelAnimationFrame(this.celebrationRaf);
    this.celebrationRaf = 0;
    this.celebration = null;
    const resolve = this.settleCelebration;
    this.settleCelebration = null;
    resolve?.();
    this.draw();
    this.startAmbience();
  }

  animate(before: RenderPiece[], after: RenderPiece[], effect: MoveEffect): Promise<void> {
    this.cancel();
    if (this.reducedMotion || this.destroyed) {
      this.setPosition(after);
      return Promise.resolve();
    }
    const token = ++this.animationId;
    const moving = before.find((piece) => piece.square === effect.from) ?? { square: effect.from, type: effect.piece, color: effect.color };
    const finalType = effect.promotion ?? moving.type;
    const plan = createMovePlan(effect.from, effect.to, Boolean(effect.capturedSquare), this.flipped);
    const habitatPlaced = Boolean(effect.habitatPlaced) || (this.committedHabitat?.from === effect.from && this.committedHabitat?.to === effect.to);
    this.committedHabitat = null;
    const from = this.squarePoint(effect.from);
    const to = this.squarePoint(effect.to);
    const rook = effect.rook && before.find((piece) => piece.square === effect.rook!.from);
    this.pieces = before.filter((piece) => piece.square !== moving.square && piece.square !== effect.capturedSquare && piece.square !== rook?.square);
    this.pendingAfter = after.map((piece) => ({ ...piece }));
    const travelers: Transient[] = [{ piece: moving, from, to, progress: habitatPlaced ? 1 : 0, animalProgress: 0, frame: this.restFrame(moving), plan, mirror: plan.mirror, role: "mover", perchFrom: this.perchAt(effect.from), perchTo: this.perchAt(effect.to), ...(habitatPlaced ? { habitatCenter: to } : {}) }];
    if (rook && effect.rook) {
      const rookPlan = createMovePlan(effect.rook.from, effect.rook.to, false, this.flipped);
      travelers.push({ piece: rook, from: this.squarePoint(effect.rook.from), to: this.squarePoint(effect.rook.to), progress: 0, animalProgress: 0, frame: this.restFrame(rook), plan: rookPlan, mirror: rookPlan.mirror, role: "rook", perchFrom: this.perchAt(effect.rook.from), perchTo: this.perchAt(effect.rook.to) });
    }
    const victim = effect.capturedSquare && before.find((piece) => piece.square === effect.capturedSquare);
    if (victim) travelers.push({ piece: victim, from: this.squarePoint(victim.square), to: this.squarePoint(victim.square), progress: 0, animalProgress: 0, frame: this.restFrame(victim), opacity: 1, scale: 1, plan, role: "victim", perchFrom: this.perchAt(victim.square), perchTo: this.perchAt(victim.square) });
    this.transient = travelers;
    const started = performance.now();
    return new Promise((resolve) => {
      this.settleAnimation = resolve;
      const tick = (now: number) => {
        if (token !== this.animationId || this.destroyed) return resolve();
        const t = Math.min(1, (now - started) / plan.duration);
        // The habitat reaches its destination before the animal rises. This is
        // deliberately sequential: it avoids a sliding sitting sticker.
        const ground = habitatPlaced ? 1 : easeInOut(Math.min(1, t / 0.18));
        const animal = easeInOut(Math.max(0, Math.min(1, (t - 0.38) / 0.40)));
        for (const item of travelers) {
          if (victim && item.piece.square === victim.square) {
            const layout = captureLayoutAt(t);
            item.frame = t < 0.78 ? this.restFrame(victim) : 9;
            item.habitatCenter = { x: item.to.x + layout.defender.x * this.scene().tile, y: item.to.y + layout.defender.y * this.scene().tile };
            item.animalCenter = item.habitatCenter;
            item.habitatScale = layout.defender.scale;
            item.animalScale = layout.defender.scale;
            item.opacity = layout.defender.opacity;
            continue;
          }
          item.progress = ground;
          item.animalProgress = animal;
          item.frame = poseFor(t, item.plan, item.piece.type, this.framesPerTeam(), restFrameForPiece(item.piece.color, this.flipped) === 16);
          item.animalCenter = undefined;
          item.habitatCenter = undefined;
          item.habitatScale = 1;
          item.animalScale = 1;
          if (victim && item.role === "mover" && t >= .10) {
            const layout = captureLayoutAt(t);
            const tile = this.scene().tile;
            const baseGround = lerpPoint(item.from, item.to, ground);
            item.habitatCenter = { x: baseGround.x + layout.incoming.x * tile * ground, y: baseGround.y + layout.incoming.y * tile * ground };
            item.habitatScale = 1 - (1 - layout.incoming.scale) * ground;
            const incomingAnimalHome = { x: item.to.x + layout.incoming.x * tile, y: item.to.y + layout.incoming.y * tile };
            if (t >= .38 && t < .78) {
              item.animalCenter = lerpPoint(item.from, incomingAnimalHome, animal);
              item.animalScale = 1 - (1 - layout.incoming.scale) * animal;
            } else if (t >= .93) {
              item.animalCenter = lerpPoint(incomingAnimalHome, item.to, Math.min(1, (t - .93) / .07));
              item.animalScale = layout.incoming.scale;
            }
            // At impact, the attacker reads as reaching toward the actual defender.
            if (t >= .78 && t < .93) {
              const defender = { x: item.to.x + layout.defender.x * this.scene().tile, y: item.to.y + layout.defender.y * this.scene().tile };
              const amount = t < .87 ? (t - .78) / .09 : 1 - (t - .87) / .06;
              item.animalCenter = lerpPoint(incomingAnimalHome, defender, Math.max(0, Math.min(.36, amount * .36)));
              item.animalScale = layout.incoming.scale;
            }
          }
          // En passant needs a local, legible strike rather than a remote fade.
          if (effect.capturedSquare && effect.capturedSquare !== effect.to && item.piece.square === effect.from && t >= .78 && t < .93) {
            const victimPoint = this.squarePoint(effect.capturedSquare);
            const feint = t < .87 ? (t - .78) / .09 : 1 - (t - .87) / .06;
            const animalHome = item.animalCenter ?? item.to;
            item.animalCenter = lerpPoint(animalHome, victimPoint, Math.max(0, Math.min(.60, feint * .60)));
          }
        }
        this.draw();
        if (t < 1) this.raf = requestAnimationFrame(tick);
        else {
          this.transient = [];
          this.pieces = after.map((piece) => ({ ...piece }));
          this.pendingAfter = undefined;
          // A promotion becomes its new species only after the arrival settles.
          const promoted = this.pieces.find((piece) => piece.square === effect.to && piece.color === effect.color);
          if (promoted) promoted.type = finalType;
          this.draw();
          this.settleAnimation = null;
          this.startAmbience();
          resolve();
        }
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  animateDeployment(before: RenderPiece[], after: RenderPiece[], piece: RenderPiece): Promise<void> {
    this.cancel();
    if (this.reducedMotion || this.destroyed) {
      this.setPosition(after);
      return Promise.resolve();
    }
    const token = ++this.animationId;
    const destination = this.squarePoint(piece.square);
    const plan = createMovePlan(piece.square, piece.square, false, this.flipped);
    const arrival: Transient = {
      piece,
      from: destination,
      to: destination,
      progress: 1,
      animalProgress: 0,
      frame: this.restFrame(piece),
      plan,
      habitatCenter: destination,
      animalCenter: destination,
      habitatOpacity: 0,
      animalOpacity: 0,
      habitatScale: .82,
      animalScale: 1,
      role: "deployment",
    };
    this.pieces = before.map((value) => ({ ...value }));
    this.pendingAfter = after.map((value) => ({ ...value }));
    this.transient = [arrival];
    const started = performance.now();
    return new Promise((resolve) => {
      this.settleAnimation = resolve;
      const tick = (now: number) => {
        if (token !== this.animationId || this.destroyed) return resolve();
        const t = Math.min(1, (now - started) / DEPLOYMENT_DURATION);
        const frame = deploymentFrameAt(t);
        const rear = restFrameForPiece(piece.color, this.flipped) === 16;
        const frames = this.framesPerTeam(this.images.get(SPECIES[piece.type]));
        arrival.habitatOpacity = frame.habitatOpacity;
        arrival.habitatScale = frame.habitatScale;
        arrival.animalOpacity = frame.animalOpacity;
        arrival.animalProgress = Math.max(0, Math.min(1, (t - .60) / .40));
        arrival.frame = deploymentPose(piece.type, frame.animalStage, rear, frames, t);
        const tile = this.scene().tile;
        const drop = frame.animalStage === "hidden" ? .30 : Math.max(0, .30 * (1 - Math.min(1, (t - .60) / .24)));
        const hareHop = piece.type === "n" && t >= .72 && t < .96 ? Math.sin(Math.PI * Math.min(1, (t - .72) / .24)) * .12 : 0;
        arrival.animalCenter = { x: destination.x, y: destination.y - tile * (drop + hareHop) };
        this.draw();
        if (t < 1) this.raf = requestAnimationFrame(tick);
        else {
          this.transient = [];
          this.pieces = after.map((value) => ({ ...value }));
          this.pendingAfter = undefined;
          this.draw();
          this.settleAnimation = null;
          this.startAmbience();
          resolve();
        }
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  /** Tactical-only entry point. Classic callers keep using animate unchanged. */
  animateTacticalEncounter(before: RenderPiece[], after: RenderPiece[], effect: TacticalEncounterEffect): Promise<void> {
    this.cancel()
    if (this.reducedMotion || this.destroyed) { this.setPosition(after); return Promise.resolve() }
    if (effect.lethal && !effect.ranged) return this.animate(before, after, { from: effect.from, to: effect.target, piece: effect.piece, color: effect.color, capturedSquare: effect.target })
    const attacker = before.find(piece => piece.square === effect.from) ?? { square: effect.from, type: effect.piece, color: effect.color }
    const defender = before.find(piece => piece.square === effect.target) ?? { square: effect.target, type: effect.targetPiece, color: effect.targetColor }
    const from = this.squarePoint(effect.from), landing = this.squarePoint(effect.ranged ? effect.from : effect.landing), target = this.squarePoint(effect.target)
    const token = ++this.animationId
    this.pendingAfter = after.map(piece => ({ ...piece }))
    this.pieces = before.filter(piece => piece.square !== attacker.square && piece.square !== defender.square)
    const actor: Transient = { piece: attacker, from, to: landing, progress: 0, animalProgress: 0, frame: this.restFrame(attacker), plan: createMovePlan(effect.from, effect.landing, false, this.flipped), role: 'mover', perchFrom: this.perchAt(effect.from), perchTo: this.perchAt(effect.ranged ? effect.from : effect.landing) }
    const victim: Transient = { piece: defender, from: target, to: target, progress: 0, animalProgress: 0, frame: this.restFrame(defender), plan: createMovePlan(effect.target, effect.target, false, this.flipped), role: 'victim', opacity: 1, scale: 1, perchFrom: this.perchAt(effect.target), perchTo: this.perchAt(effect.target) }
    this.transient = [victim, actor]
    return new Promise((resolve) => {
      this.settleAnimation = resolve
      const started = performance.now(), duration = effect.ranged ? 760 : 1600
      const tick = (now: number) => {
        if (token !== this.animationId || this.destroyed) return resolve()
        const t = Math.min(1, (now - started) / duration)
        const strike = Math.max(0, Math.min(1, (t - .56) / .18))
        actor.progress = effect.ranged ? 0 : easeInOut(Math.min(1, t / .28))
        actor.animalProgress = effect.ranged ? 0 : easeInOut(Math.max(0, Math.min(1, (t - .24) / .34)))
        actor.frame = t < .24 ? (this.restFrame(attacker) === 16 ? 17 : 1) : t < .52 ? poseFor(.40 + (t-.24)/.28*.35, actor.plan, attacker.type, this.framesPerTeam(), this.restFrame(attacker) === 16) : t < .74 ? 8 : t < .86 ? 9 : (this.restFrame(attacker) === 16 ? 18 : 10)
        victim.frame = t < .56 ? this.restFrame(defender) : 9
        victim.animalCenter = { x: target.x + Math.sign(target.x - from.x) * Math.sin(strike*Math.PI) * this.scene().tile * .08, y: target.y + Math.sign(target.y - from.y) * Math.sin(strike*Math.PI) * this.scene().tile * .08 }
        if (effect.lethal && effect.ranged) { victim.opacity = 1 - Math.max(0, Math.min(1, (t - .72) / .20)); victim.scale = 1 - Math.max(0, Math.min(.35, (t - .72) * 1.75)) }
        // The attacker lunges at contact, then returns to its legal landing habitat.
        if (!effect.ranged && t >= .52 && t < .80) actor.animalCenter = lerpPoint(landing, target, Math.sin((t - .52) / .28 * Math.PI) * .30)
        else actor.animalCenter = undefined
        this.draw()
        if (effect.ranged && t >= .58) this.drawTacticalProjectile(attacker, effect.target, Math.min(1, (t - .58) / .22))
        if (t < 1) this.raf = requestAnimationFrame(tick)
        else { this.transient = []; this.pieces = after.map(piece => ({ ...piece })); this.pendingAfter = undefined; this.settleAnimation = null; this.draw(); this.startAmbience(); resolve() }
      }
      this.raf = requestAnimationFrame(tick)
    })
  }

  cancel(after?: RenderPiece[]): void {
    this.cancelCelebration();
    ++this.animationId;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.transient = [];
    const settled = after ?? this.pendingAfter;
    if (settled) this.pieces = settled.map((piece) => ({ ...piece }));
    this.pendingAfter = undefined;
    this.habitatDrag = null;
    this.draw();
    this.startAmbience();
    const resolve = this.settleAnimation;
    this.settleAnimation = null;
    resolve?.();
  }

  destroy(): void {
    this.destroyed = true;
    this.stopAmbience();
    this.cancel();
    this.observer?.disconnect();
    this.viewportObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  private readonly onVisibility = () => {
    if (document.hidden && this.transient.length) this.cancel();
    if (document.hidden) this.cancelCelebration();
    if (document.hidden) this.stopAmbience(); else this.startAmbience();
  };

  private shouldAnimateAmbience(): boolean {
    return canRunBoardAmbience({
      reducedMotion: this.reducedMotion,
      documentHidden: document.hidden,
      canvasVisible: this.canvasVisible,
      actionActive: this.transient.length > 0 || (document.body.classList.contains("checkmate-mode") && document.body.dataset.gameBusy === "true"),
      dragActive: Boolean(this.habitatDrag),
      celebrationActive: Boolean(this.celebration),
      settingEnabled: !document.body.classList.contains("checkmate-mode") || document.body.dataset.ambient !== "off",
    });
  }

  private startAmbience(): void {
    if (this.ambienceRaf || !this.shouldAnimateAmbience() || this.destroyed) return;
    const tick = (now: number) => {
      if (!this.shouldAnimateAmbience() || this.destroyed) {
        this.ambienceRaf = 0;
        return;
      }
      if (now - this.ambienceLast >= BOARD_AMBIENCE_FRAME_MS) {
        this.ambienceLast = now;
        this.ambienceNow = now;
        this.draw();
      }
      this.ambienceRaf = requestAnimationFrame(tick);
    };
    this.ambienceRaf = requestAnimationFrame(tick);
  }

  private stopAmbience(): void {
    if (this.ambienceRaf) cancelAnimationFrame(this.ambienceRaf);
    this.ambienceRaf = 0;
  }

  private resize(): void {
    // Stored pixel positions become invalid after a resize; settle atomically.
    if (this.transient.length) this.cancel();
    if (this.habitatDrag) this.previewHabitatDrag(null);
    if (this.celebration) this.cancelCelebration();
    const rect = this.canvas.getBoundingClientRect();
    this.cssWidth = Math.max(1, rect.width || this.canvas.clientWidth || 1);
    this.cssHeight = Math.max(1, rect.height || this.canvas.clientHeight || 1);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cssWidth * dpr);
    this.canvas.height = Math.round(this.cssHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.draw();
  }

  private scene(): { x: number; y: number; size: number; boardX: number; boardY: number; board: number; tile: number } {
    const size = Math.min(this.cssWidth, this.cssHeight);
    const x = (this.cssWidth - size) / 2;
    const y = (this.cssHeight - size) / 2;
    const board = size;
    const averageGridWidth = ((GRID_TOP.right - GRID_TOP.left) + (GRID_BOTTOM.right - GRID_BOTTOM.left)) / 2;
    return { x, y, size, boardX: x, boardY: y, board, tile: size * averageGridWidth / BOARD_SIZE / 8 };
  }

  private squarePoint(square: Square): Point {
    const polygon = this.squarePolygonPixels(square);
    return polygon.reduce((point, corner) => ({ x: point.x + corner.x / 4, y: point.y + corner.y / 4 }), { x: 0, y: 0 });
  }

  /** Physical hit region in normalized canvas coordinates, also valid before assets load. */
  getSquarePolygon(square: Square): Point[] {
    const s = this.scene();
    return this.squarePolygonPixels(square).map((point) => ({ x: point.x / this.cssWidth, y: point.y / this.cssHeight }));
  }

  private squarePolygonPixels(square: Square): Point[] {
    const s = this.scene();
    return projectSquarePolygon(square, this.flipped).map((point) => ({ x: s.x + point.x * s.size, y: s.y + point.y * s.size }));
  }

  private draw(): void {
    if (this.destroyed) return;
    const { ctx } = this;
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    const s = this.scene();
    const board = this.images.get("board");
    if (board) ctx.drawImage(board, s.x, s.y, s.size, s.size);
    if (this.flipped && board) this.drawFlippedLabels(s);
    drawCourtyardTiles(ctx, (column, row) => {
      const y = GRID_Y[row];
      const ratio = (y - GRID_Y[0]) / (GRID_Y[8] - GRID_Y[0]);
      const left = GRID_TOP.left + (GRID_BOTTOM.left - GRID_TOP.left) * ratio;
      const right = GRID_TOP.right + (GRID_BOTTOM.right - GRID_TOP.right) * ratio;
      return { x: s.x + (left + (right - left) * column / 8) / BOARD_SIZE * s.size, y: s.y + y / BOARD_SIZE * s.size };
    }, s.tile);
    const ambience = this.shouldAnimateAmbience();
    if (ambience) this.drawAmbientRim(s);
    const orderedPieces = [...this.pieces].sort((a, b) => this.squarePoint(a.square).y - this.squarePoint(b.square).y);
    const dragging = this.habitatDrag;
    const towerSquares = new Set(this.obstacles.filter(obstacle => obstacle.kind === 'tower').map(obstacle => obstacle.square));
    for (const obstacle of this.obstacles) this.drawObstacleGround(obstacle);
    for (let index = 0; index < orderedPieces.length; index++) {
      const piece = orderedPieces[index];
      if (piece.square === dragging?.piece.square || towerSquares.has(piece.square)) continue;
      const point = this.squarePoint(piece.square);
      this.drawHabitat(piece, point, 1, 1);
      if (ambience) this.drawIdleHabitatAccent(piece, point, idlePoseForPiece(piece.type, index, this.ambienceNow, s.tile));
    }
    this.drawTiles(s);
    const sceneLayer = [
      ...this.obstacles.map(obstacle => ({ kind: 'obstacle' as const, obstacle, y: this.squarePoint(obstacle.square as Square).y })),
      ...orderedPieces.map(piece => ({ kind: 'piece' as const, piece, y: this.squarePoint(piece.square).y })),
    ].sort((a, b) => a.y - b.y || (a.kind === 'obstacle' ? -1 : 1));
    for (let index = 0; index < sceneLayer.length; index++) {
      const entry = sceneLayer[index];
      if (entry.kind === 'obstacle') { this.drawObstacle(entry.obstacle); continue; }
      const point = this.squarePoint(entry.piece.square);
      const celebration = this.celebrationOffset(entry.piece);
      const idle = ambience ? idlePoseForPiece(entry.piece.type, index + 17, this.ambienceNow, s.tile) : null;
      if (towerSquares.has(entry.piece.square)) {
        this.drawHabitat(entry.piece, point, 1, 1);
        if (idle) this.drawIdleHabitatAccent(entry.piece, point, idle);
      }
      this.drawAnimal(entry.piece, { x: point.x + celebration.x, y: point.y + celebration.y + (idle?.animalY ?? 0) }, celebration.frame || this.restFrame(entry.piece), 1, idle?.animalScale ?? 1, 1, false);
    }
    if (dragging?.target) this.drawHabitat(dragging.piece, this.squarePoint(dragging.target), .28, .98);
    if (dragging) this.drawHabitat(dragging.piece, dragging.point, .94, 1);
    const transientDraw = this.transient.map((item) => ({
      item,
      habitat: item.habitatCenter ?? lerpPoint(item.from, item.to, item.progress),
      animal: item.animalCenter ?? lerpPoint(item.from, item.to, item.animalProgress),
    }));
    // Ground is its own layer. The defender is then visible beneath the attacker.
    for (const entry of transientDraw) this.drawHabitat(entry.item.piece, entry.habitat, entry.item.habitatOpacity ?? entry.item.opacity ?? 1, entry.item.habitatScale ?? entry.item.scale ?? 1, this.perchAt(entry.item));
    for (const entry of transientDraw.filter(({ item }) => item.role === "victim")) this.drawAnimal(entry.item.piece, entry.animal, entry.item.frame, entry.item.animalOpacity ?? entry.item.opacity ?? 1, entry.item.animalScale ?? entry.item.scale ?? 1, entry.item.habitatScale ?? entry.item.scale ?? 1, Boolean(entry.item.mirror), this.perchAt(entry.item));
    for (const entry of transientDraw.filter(({ item }) => item.role !== "victim")) {
      const motion = entry.item.role === "deployment" ? { x: 0, y: 0 } : speciesMotion(entry.item.piece.type, entry.item.frame, tForFrame(entry.item), s.tile);
      this.drawAnimal(entry.item.piece, { x: entry.animal.x + motion.x, y: entry.animal.y + motion.y }, entry.item.frame, entry.item.animalOpacity ?? entry.item.opacity ?? 1, entry.item.animalScale ?? entry.item.scale ?? 1, entry.item.habitatScale ?? entry.item.scale ?? 1, Boolean(entry.item.mirror), this.perchAt(entry.item));
    }
    const victim = transientDraw.find(({ item }) => item.role === "victim" && item.frame === 9);
    const attacker = transientDraw.find(({ item }) => item.role === "mover");
    if (victim && attacker) this.drawCaptureFx(attacker.item.piece.type, victim.habitat);
    this.drawCelebration();
  }

  private drawFrame(s: ReturnType<BoardRenderer["scene"]>): void {
    const { ctx } = this;
    const m = s.size * .018;
    const left = s.boardX - s.size * .052;
    const right = s.boardX + s.board + s.size * .052;
    const top = s.boardY - s.size * .052;
    const bottom = s.boardY + s.board + s.size * .069;
    ctx.fillStyle = "#1D2930";
    ctx.fillRect(s.x, s.y, s.size, s.size);

    // Top/side walnut rails sit behind the exact, unchanged playing-grid rect.
    ctx.fillStyle = "#2C1B17";
    ctx.fillRect(left, top, right - left, s.board + s.size * .078);
    ctx.fillStyle = "#4A3024";
    ctx.fillRect(left + m * .35, top + m * .35, right - left - m * .7, s.board + s.size * .071);
    ctx.fillStyle = "#714A32";
    ctx.fillRect(s.boardX - s.size * .039, s.boardY - s.size * .039, s.board + s.size * .078, s.size * .021);
    ctx.fillRect(s.boardX - s.size * .039, s.boardY - s.size * .039, s.size * .021, s.board + s.size * .063);
    ctx.fillStyle = "#39241C";
    ctx.fillRect(s.boardX + s.board + s.size * .018, s.boardY - s.size * .039, s.size * .021, s.board + s.size * .063);

    // Chunky two-course masonry makes the lower front edge read as a solid object.
    const faceY = s.boardY + s.board + s.size * .025;
    const faceH = s.size * .04;
    ctx.fillStyle = "#302B2A";
    ctx.fillRect(left, faceY - s.size * .006, right - left, faceH + s.size * .012);
    const brickH = faceH / 2;
    for (let row = 0; row < 2; row++) {
      const brickW = s.size * .092;
      const offset = row ? -brickW * .48 : 0;
      for (let x = left + offset; x < right; x += brickW) {
        const inset = Math.max(1, s.size * .0025);
        const chip = (Math.round((x - left) / brickW) + row * 3) % 4 === 0;
        ctx.fillStyle = row ? "#60483B" : "#705041";
        ctx.fillRect(x + inset, faceY + row * brickH + inset, brickW - inset * 2, brickH - inset * 2);
        if (chip) {
          ctx.fillStyle = "#9B7359";
          ctx.fillRect(x + brickW * .17, faceY + row * brickH + brickH * .19, brickW * .16, Math.max(1, brickH * .12));
          ctx.fillStyle = "#3A3430";
          ctx.fillRect(x + brickW * .67, faceY + row * brickH + brickH * .65, brickW * .13, Math.max(1, brickH * .11));
        }
      }
    }

    // Thin brass catches the light without reducing square contrast.
    ctx.fillStyle = "#B68B42";
    const brass = Math.max(1, s.size * .0028);
    ctx.fillRect(s.boardX - brass, s.boardY - brass, s.board + brass * 2, brass);
    ctx.fillRect(s.boardX - brass, s.boardY + s.board, s.board + brass * 2, brass);
    ctx.fillRect(s.boardX - brass, s.boardY - brass, brass, s.board + brass * 2);
    ctx.fillRect(s.boardX + s.board, s.boardY - brass, brass, s.board + brass * 2);

    // Ivy stays entirely in the rails; no foliage enters a chess square.
    ctx.fillStyle = "#4B6C42";
    const ivy = [
      [s.boardX - s.size * .040, s.boardY - s.size * .035],
      [s.boardX + s.board + s.size * .020, s.boardY - s.size * .027],
      [s.boardX - s.size * .040, faceY + s.size * .005],
      [s.boardX + s.board + s.size * .020, faceY + s.size * .012],
    ];
    for (const [x, y] of ivy) {
      ctx.fillRect(x, y, s.size * .019, s.size * .006);
      ctx.fillRect(x + s.size * .009, y + s.size * .004, s.size * .006, s.size * .022);
      ctx.fillStyle = "#6E8A52";
      ctx.fillRect(x + s.size * .014, y + s.size * .012, s.size * .011, s.size * .007);
      ctx.fillStyle = "#4B6C42";
    }

    ctx.fillStyle = "#E8D9B5";
    ctx.font = `${Math.max(8, Math.round(s.size * .020))}px ui-monospace, SFMono-Regular, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let col = 0; col < 8; col++) ctx.fillText(this.logicalSquare(col, 7)[0], s.boardX + (col + .5) * s.tile, faceY + faceH * .5);
    ctx.textAlign = "center";
    for (let row = 0; row < 8; row++) ctx.fillText(this.logicalSquare(0, row)[1], s.boardX - s.size * .028, s.boardY + (row + .5) * s.tile);
  }

  private drawTiles(s: ReturnType<BoardRenderer["scene"]>): void {
    const { ctx } = this;
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const square = this.logicalSquare(col, row);
      const polygon = this.squarePolygonPixels(square);
      const path = () => { ctx.beginPath(); ctx.moveTo(polygon[0].x, polygon[0].y); for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y); ctx.closePath(); };
      if (this.last?.includes(square)) {
        path(); ctx.fillStyle = "rgba(232, 190, 94, .22)"; ctx.fill();
      }
      if (this.selected === square) {
        path(); ctx.strokeStyle = "rgba(244, 206, 105, .95)"; ctx.lineWidth = Math.max(2, s.tile * .035); ctx.stroke();
      } else if (this.legal.includes(square)) {
        const center = this.squarePoint(square);
        const half = Math.max(3, s.tile * .075);
        ctx.fillStyle = "rgba(244, 210, 114, .82)";
        ctx.beginPath(); ctx.moveTo(center.x, center.y - half); ctx.lineTo(center.x + half, center.y); ctx.lineTo(center.x, center.y + half); ctx.lineTo(center.x - half, center.y); ctx.closePath(); ctx.fill();
      }
      if (this.check === square) {
        path(); ctx.strokeStyle = "rgba(201, 57, 48, .92)"; ctx.lineWidth = Math.max(2, s.tile * .04); ctx.stroke();
      }
      if (this.focused === square) {
        path(); ctx.strokeStyle = "rgba(255, 244, 181, .98)"; ctx.lineWidth = Math.max(2, s.tile * .025); ctx.setLineDash([Math.max(3, s.tile * .07), Math.max(2, s.tile * .035)]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  /** Leaves and firefly motes remain on the physical rail, never over a square. */
  private drawAmbientRim(s: ReturnType<BoardRenderer["scene"]>): void {
    const { ctx } = this;
    const now = this.ambienceNow;
    const px = Math.max(1, Math.round(s.tile * .026));
    ctx.save();
    for (let index = 0; index < 5; index++) {
      const mote = rimMoteAt(index, now);
      const along = mote.progress;
      let x: number;
      let y: number;
      if (mote.edge === "top") {
        x = s.boardX + s.board * (.12 + along * .72);
        y = s.boardY - s.size * (.025 + mote.drift * .012);
      } else {
        x = mote.edge === "left" ? s.boardX - s.size * (.033 + mote.drift * .010) : s.boardX + s.board + s.size * (.022 + mote.drift * .010);
        y = s.boardY + s.board * (.10 + along * .77);
      }
      ctx.fillStyle = index % 2 ? "rgba(212, 190, 103, .72)" : "rgba(107, 141, 76, .82)";
      ctx.fillRect(Math.round(x), Math.round(y), px, px);
      if (index % 2 === 0) ctx.fillRect(Math.round(x + px), Math.round(y - px), px, px);
    }
    ctx.restore();
  }

  /** Small habitat cues make water and grass feel alive without obscuring a unit. */
  private drawIdleHabitatAccent(piece: RenderPiece, center: Point, idle: ReturnType<typeof idlePoseForPiece>): void {
    const { ctx } = this;
    const tile = this.scene().tile;
    ctx.save();
    if (piece.type === "r" && !this.perchAt(piece.square)) {
      const size = Math.max(2, Math.round(tile * (.18 + idle.ripple * .045)));
      const x = Math.round(center.x - size / 2);
      const y = Math.round(center.y + tile * .205 - size * .18);
      ctx.strokeStyle = "rgba(150, 221, 212, .50)";
      ctx.lineWidth = Math.max(1, Math.round(tile * .012));
      ctx.strokeRect(x, y, size, Math.max(2, Math.round(size * .22)));
      ctx.strokeStyle = "rgba(91, 167, 158, .42)";
      ctx.strokeRect(Math.round(center.x - size * .31), Math.round(y + size * .16), Math.round(size * .62), Math.max(2, Math.round(size * .16)));
    }
    if ((piece.type === "n" || piece.type === "p") && !this.perchAt(piece.square)) {
      const baseY = center.y + tile * .22;
      const sway = idle.grassSway * tile * .025;
      const blade = Math.max(2, Math.round(tile * .045));
      ctx.fillStyle = "rgba(99, 142, 72, .84)";
      ctx.fillRect(Math.round(center.x - tile * .28), Math.round(baseY - blade), Math.max(1, Math.round(tile * .014)), blade);
      ctx.fillRect(Math.round(center.x + tile * .25 + sway), Math.round(baseY - blade * .8), Math.max(1, Math.round(tile * .014)), Math.round(blade * .8));
      ctx.fillStyle = "rgba(142, 174, 87, .72)";
      ctx.fillRect(Math.round(center.x - tile * .26 + sway), Math.round(baseY - blade * .58), Math.max(1, Math.round(tile * .012)), Math.max(2, Math.round(blade * .58)));
    }
    ctx.restore();
  }

  private drawCaptureFx(type: PieceSymbol, center: Point): void {
    const { ctx } = this;
    const r = this.scene().tile;
    ctx.save();
    ctx.lineWidth = Math.max(2, r * .025);
    ctx.lineCap = "square";
    if (type === "k") {
      ctx.strokeStyle = "rgba(241, 205, 96, .78)";
      for (const scale of [.24, .40]) { ctx.beginPath(); ctx.arc(center.x, center.y, r * scale, 0, Math.PI * 2); ctx.stroke(); }
    } else if (type === "q" || type === "n") {
      ctx.strokeStyle = type === "q" ? "rgba(255, 223, 168, .9)" : "rgba(238, 184, 99, .9)";
      for (const dx of [-.14, .02]) { ctx.beginPath(); ctx.moveTo(center.x + r * dx, center.y + r * .17); ctx.lineTo(center.x + r * (dx + .16), center.y - r * .18); ctx.stroke(); }
    } else if (type === "p") {
      ctx.strokeStyle = "rgba(243, 139, 160, .88)"; ctx.beginPath(); ctx.arc(center.x, center.y, r * .30, .25, 2.6); ctx.stroke();
    } else if (type === "r") {
      ctx.strokeStyle = "rgba(207, 227, 220, .82)"; ctx.beginPath(); ctx.arc(center.x, center.y, r * .28, 0, Math.PI * 1.6); ctx.stroke();
    } else if (type === "b") {
      ctx.fillStyle = "rgba(206, 222, 235, .72)"; ctx.fillRect(center.x - r * .10, center.y - r * .10, r * .20, r * .20);
    }
    ctx.restore();
  }

  private drawTacticalProjectile(shooter: RenderPiece, target: Square, progress: number): void {
    const from = this.squarePoint(shooter.square), to = this.squarePoint(target)
    const ctx = this.ctx, tile = this.scene().tile
    const perch = this.perchAt(shooter.square)
    if (perch) from.y += tile * (.18 - perch)
    const point = lerpPoint(from, to, progress)
    const towerShot = this.obstacles.some(obstacle => obstacle.square === shooter.square && obstacle.kind === 'tower' && !obstacle.spent)
    ctx.save(); ctx.fillStyle = towerShot ? '#d8b7ff' : shooter.type === 'b' ? '#dbeaf4' : shooter.type === 'r' ? '#8ac8d1' : '#f0b96d'
    ctx.fillRect(Math.round(point.x - tile * .04), Math.round(point.y - tile * .04), Math.max(3, tile * .08), Math.max(3, tile * .08)); ctx.restore()
  }

  /** Full projected foundations are ground, so highlights and neighbouring animals stay above them. */
  private drawObstacleGround(obstacle: BoardObstacle): void {
    const ctx = this.ctx, corners = this.squarePolygonPixels(obstacle.square as Square), tile = this.scene().tile;
    const point = (u: number, v: number): Point => {
      const top = lerpPoint(corners[0], corners[1], u), bottom = lerpPoint(corners[3], corners[2], u);
      return lerpPoint(top, bottom, v);
    };
    ctx.save(); ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y);
    for (const corner of corners.slice(1)) ctx.lineTo(corner.x, corner.y);
    ctx.closePath(); ctx.clip();
    ctx.fillStyle = 'rgba(72, 82, 48, .46)'; ctx.fill();
    const seed = obstacle.square.charCodeAt(0) + Number(obstacle.square[1]) * 13;
    for (let i = 0; i < 40; i++) {
      const u = ((i * 37 + seed * 3) % 101) / 100, v = ((i * 61 + seed) % 101) / 100;
      const p = point(u, v), size = Math.max(1, Math.round(tile * (.026 + i % 3 * .012)));
      ctx.fillStyle = ['#5e7339', '#7c8745', '#414f31', '#9a9474'][i % 4];
      ctx.fillRect(Math.round(p.x), Math.round(p.y), size * (i % 2 + 1), size);
    }
    // Broken paving leads from the square's front edge into the original stone base.
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const p = point(.33 + col * .12 + row % 2 * .025, .63 + row * .13);
      const w = Math.max(2, Math.round(tile * .105)), h = Math.max(1, Math.round(tile * .065));
      ctx.fillStyle = '#3d4136'; ctx.fillRect(Math.round(p.x), Math.round(p.y + 1), w, h);
      ctx.fillStyle = (col + row) % 2 ? '#918b73' : '#aaa184';
      ctx.fillRect(Math.round(p.x), Math.round(p.y), w, h);
    }
    ctx.restore();
  }

  /** Chunky projected masonry: a lit top plane, a front face, and a dark right side. */
  private drawObstacle(obstacle: BoardObstacle): void {
    const ctx = this.ctx, tile = this.scene().tile, center = this.squarePoint(obstacle.square as Square)
    const geometry = obstacleGeometry(obstacle), width = tile * geometry.footprint, height = tile * geometry.height
    const baseY = center.y + tile * .18
    const sprite = this.images.get(`obstacle-${obstacle.kind}`)
    if (sprite) {
      const layout = OBSTACLE_SPRITE_LAYOUT[obstacle.kind]
      const maxWidth = tile * layout.footprint
      const scale = maxWidth / sprite.naturalWidth
      const drawWidth = sprite.naturalWidth * scale, drawHeight = sprite.naturalHeight * scale
      ctx.save(); ctx.imageSmoothingEnabled = false
      if (obstacle.kind === 'tower' && obstacle.spent) ctx.filter = 'saturate(0.3) brightness(0.72)'
      ctx.drawImage(sprite, Math.round(center.x - drawWidth / 2), Math.round(baseY - drawHeight * layout.groundAnchor), Math.round(drawWidth), Math.round(drawHeight))
      ctx.restore()
      return
    }
    const quad = (points: Point[], color: string) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (let i=1;i<points.length;i++) ctx.lineTo(points[i].x, points[i].y); ctx.closePath(); ctx.fill() }
    const masonry = (left:number, top:number, faceWidth:number, faceHeight:number, rows:number) => {
      for (let row=0;row<rows;row++) for (let x=left-(row%2?faceWidth*.08:0);x<left+faceWidth;x+=faceWidth*.31) {
        const brickW=Math.max(2,Math.round(faceWidth*.24)), brickH=Math.max(2,Math.round(faceHeight/(rows*1.65)))
        ctx.fillStyle=(row+x>left+faceWidth*.46)?'#817965':'#9a9076'
        ctx.fillRect(Math.round(x),Math.round(top+faceHeight*(.10+row/rows*.82)),brickW,brickH)
      }
    }
    ctx.save(); ctx.imageSmoothingEnabled = false
    if (obstacle.kind === 'wall') {
      const left = Math.round(center.x - width / 2), top = Math.round(baseY - height)
      const depth=height*.48, right=left+width
      quad([{x:left,y:top+depth},{x:right,y:top+depth},{x:right+depth,y:top},{x:left+depth,y:top}],'#b3a580')
      quad([{x:right,y:top+depth},{x:right+depth,y:top},{x:right+depth,y:baseY-depth},{x:right,y:baseY}],'#343b38')
      quad([{x:left,y:top+depth},{x:right,y:top+depth},{x:right,y:baseY},{x:left,y:baseY}],'#666354')
      masonry(left,top+depth,width,Math.max(3,height-depth),2)
      ctx.fillStyle='#536c48'; ctx.fillRect(Math.round(left+width*.14),Math.round(top+depth+height*.32),Math.max(2,Math.round(width*.15)),Math.max(2,Math.round(height*.16)))
    } else {
      const left = Math.round(center.x - width / 2), top = Math.round(baseY - height)
      const depth=height*.23, bodyW=Math.round(width*.62), bodyX=Math.round(center.x-bodyW/2), bodyTop=top+Math.round(height*.16), bodyBottom=baseY
      quad([{x:bodyX,y:bodyTop+depth},{x:bodyX+bodyW,y:bodyTop+depth},{x:bodyX+bodyW+depth,y:bodyTop},{x:bodyX+depth,y:bodyTop}],'#b9ad87')
      quad([{x:bodyX+bodyW,y:bodyTop+depth},{x:bodyX+bodyW+depth,y:bodyTop},{x:bodyX+bodyW+depth,y:bodyBottom-depth},{x:bodyX+bodyW,y:bodyBottom}],'#303937')
      quad([{x:bodyX,y:bodyTop+depth},{x:bodyX+bodyW,y:bodyTop+depth},{x:bodyX+bodyW,y:bodyBottom},{x:bodyX,y:bodyBottom}],'#686757')
      masonry(bodyX,bodyTop+depth,bodyW,Math.max(4,bodyBottom-bodyTop-depth),3)
      ctx.fillStyle='#4c6949'; ctx.fillRect(Math.round(bodyX+bodyW*.10),Math.round(bodyTop+height*.55),Math.max(2,Math.round(bodyW*.22)),Math.max(2,Math.round(height*.12)))
      ctx.fillStyle='#303837'; ctx.fillRect(left,top,Math.round(width),Math.max(3,Math.round(height*.18)))
      ctx.fillStyle='#8d866f'
      for (let col=0;col<3;col++) ctx.fillRect(left+Math.round(width*(.05+col*.34)),top-Math.max(2,Math.round(height*.12)),Math.max(3,Math.round(width*.19)),Math.max(3,Math.round(height*.20)))
      // The single rune is part of the physical base: gold means ready, charcoal means spent.
      ctx.fillStyle = obstacle.spent ? '#3d4541' : '#d5bd67'
      const rune = Math.max(2, Math.round(tile * .045)); ctx.fillRect(Math.round(center.x - rune / 2), Math.round(baseY - height * .43), rune, rune)
      if (!obstacle.spent) { ctx.fillStyle = '#f3dd85'; ctx.fillRect(Math.round(center.x - rune / 4), Math.round(baseY - height * .43 - rune / 4), Math.max(1, Math.round(rune / 2)), Math.max(1, Math.round(rune / 2))) }
    }
    ctx.restore()
  }

  private celebrationOffset(piece: RenderPiece): { x: number; y: number; frame: number } {
    const celebration = this.celebration;
    if (!celebration || celebration.winner === "draw" || piece.color !== celebration.winner) return { x: 0, y: 0, frame: 0 };
    const wave = Math.sin(celebration.progress * Math.PI * 6);
    if (piece.type === "b") {
      const flapFrame = this.framesPerTeam() >= 16 ? 12 + (Math.floor(celebration.progress * 18) % 2) : 6 + (Math.floor(celebration.progress * 18) % 2);
      return { x: 0, y: -this.scene().tile * (.09 + Math.abs(wave) * .06), frame: flapFrame };
    }
    if (piece.type === "n") return { x: 0, y: -this.scene().tile * Math.abs(wave) * .12, frame: wave > 0 ? 4 : 5 };
    if (piece.type === "r") return { x: this.scene().tile * wave * .018, y: -this.scene().tile * Math.abs(wave) * .024, frame: 1 };
    if (piece.type === "p") return { x: 0, y: -this.scene().tile * Math.abs(wave) * .035, frame: 1 };
    return { x: 0, y: -this.scene().tile * Math.abs(wave) * .045, frame: 1 };
  }

  private drawCelebration(): void {
    const celebration = this.celebration;
    if (!celebration) return;
    const { ctx } = this;
    const s = this.scene();
    const p = celebration.progress;
    ctx.save();
    if (celebration.winner === "draw") {
      ctx.fillStyle = "rgba(235, 229, 191, .7)";
      for (let i = 0; i < 4; i++) ctx.fillRect(s.x + s.size * (.39 + i * .07), s.y + s.size * (.43 + Math.sin(p * 8 + i) * .015), Math.max(2, s.tile * .035), Math.max(2, s.tile * .035));
      ctx.restore();
      return;
    }
    const king = this.pieces.find((piece) => piece.color === celebration.winner && piece.type === "k");
    if (king) {
      const point = this.squarePoint(king.square);
      ctx.strokeStyle = "rgba(244, 203, 86, .85)";
      ctx.lineWidth = Math.max(2, s.tile * .025);
      ctx.beginPath(); ctx.arc(point.x, point.y, s.tile * (.39 + p * .05), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(250, 211, 92, .9)";
      for (const offset of [-.11, 0, .11]) ctx.fillRect(point.x + s.tile * offset - 2, point.y - s.tile * .47 - Math.abs(offset) * s.tile * .25, 4, s.tile * .13);
    }
    ctx.fillStyle = "rgba(208, 162, 61, .78)";
    for (let i = 0; i < 12; i++) {
      const x = s.x + s.size * (.18 + ((i * .137 + .09) % .64));
      const y = s.y + s.size * (.12 + ((p * .24 + i * .073) % .32));
      ctx.fillRect(x, y, Math.max(2, s.tile * .028), Math.max(2, s.tile * .042));
    }
    ctx.restore();
  }

  private drawFlippedLabels(s: ReturnType<BoardRenderer["scene"]>): void {
    const { ctx } = this;
    const px = (value: number) => s.x + s.size * value / BOARD_SIZE;
    const py = (value: number) => s.y + s.size * value / BOARD_SIZE;
    ctx.save();
    ctx.fillStyle = "#4B3024";
    for (let row = 0; row < 8; row++) {
      const y = (GRID_Y[row] + GRID_Y[row + 1]) / 2;
      ctx.fillRect(px(91), py(y - 18), s.size * 39 / BOARD_SIZE, s.size * 36 / BOARD_SIZE);
    }
    for (let col = 0; col < 8; col++) {
      const y = 1116;
      const topRatio = (GRID_Y[8] - GRID_Y[0]) / (GRID_Y[8] - GRID_Y[0]);
      const left = GRID_TOP.left + (GRID_BOTTOM.left - GRID_TOP.left) * topRatio;
      const right = GRID_TOP.right + (GRID_BOTTOM.right - GRID_TOP.right) * topRatio;
      const x = left + (right - left) * (col + .5) / 8;
      ctx.fillRect(px(x - 24), py(y - 20), s.size * 48 / BOARD_SIZE, s.size * 37 / BOARD_SIZE);
    }
    ctx.fillStyle = "#F0C65E";
    ctx.font = `${Math.max(9, s.size * 27 / BOARD_SIZE)}px ui-monospace, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let row = 0; row < 8; row++) ctx.fillText(String(row + 1), px(110), py((GRID_Y[row] + GRID_Y[row + 1]) / 2));
    for (let col = 0; col < 8; col++) ctx.fillText(String.fromCharCode(104 - col), px(GRID_BOTTOM.left + (GRID_BOTTOM.right - GRID_BOTTOM.left) * (col + .5) / 8), py(1114));
    ctx.restore();
  }

  private logicalSquare(col: number, row: number): Square {
    const x = this.flipped ? 7 - col : col;
    const y = this.flipped ? 7 - row : row;
    return `${String.fromCharCode(97 + x)}${8 - y}` as Square;
  }

  private drawPiece(piece: RenderPiece, habitatCenter: Point, frame: number, opacity: number, scale: number, animalCenter = habitatCenter, animalScale = scale, mirror = false): void {
    this.drawHabitat(piece, habitatCenter, opacity, scale);
    this.drawAnimal(piece, animalCenter, frame, opacity, animalScale, scale, mirror);
  }

  private drawHabitat(piece: RenderPiece, center: Point, opacity: number, scale: number, perch = this.perchAt(piece.square)): void {
    const s = this.scene();
    if (!perch) {
      drawSquareHabitat(this.ctx, piece.type, center, s.tile, opacity, scale);
      const habitat = this.images.get("habitats");
      if (habitat) {
        const frame = (piece.color === "b" ? 6 : 0) + PIECE_ORDER.indexOf(piece.type);
        const size = habitatBox(piece.type) * s.tile * scale;
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        // Keep the proven foot line while reducing the raised scenery to reveal the square biome.
        this.drawAtlas(habitat, frame, { x: center.x, y: center.y + s.tile * .12 + size * .08 * .375 }, size * .92);
        this.ctx.restore();
      }
      return;
    }
    const habitat = this.images.get("habitats");
    if (!habitat) return;
    const habitatFrame = (piece.color === "b" ? 6 : 0) + PIECE_ORDER.indexOf(piece.type);
    this.ctx.save();
    this.ctx.globalAlpha = opacity;
    // A tower owns the ground plane; the habitat becomes a small nest rather than competing with the stone base.
    this.drawAtlas(habitat, habitatFrame, { x: center.x, y: center.y + s.tile * (perch ? .18 - perch + .035 : .12) }, habitatBox(piece.type) * s.tile * scale * (perch ? .42 : 1));
    this.ctx.restore();
  }

  private drawAnimal(piece: RenderPiece, center: Point, frame: number, opacity: number, scale: number, groundScale: number, mirror: boolean, perch = this.perchAt(piece.square)): void {
    const s = this.scene();
    const animal = this.images.get(SPECIES[piece.type]);
    if (!animal) return;
    const frames = this.framesPerTeam(animal);
    const teamOffset = piece.color === "b" ? frames : 0;
    this.ctx.save();
    this.ctx.globalAlpha = opacity;
    // Both atlas baselines are 112. Align feet at the habitat's visible front.
    // Atlas feet normally rest at each habitat's front. On a tower they use its
    // physical top plane (+.18 shared ground baseline minus tower height).
    const habitatFoot = perch ? .18 - perch : piece.type === "b" ? .15 : .12 + habitatBox(piece.type) * groundScale * .375 - .05;
    const animalOffset = habitatFoot - animalBox(piece.type) * scale * .375;
    const flapScale = piece.type === "b" && isFlightFrame(frame) ? 1.25 : 1;
    this.drawAtlas(animal, teamOffset + Math.max(0, Math.min(frames - 1, frame)), { x: center.x, y: center.y + s.tile * animalOffset }, animalBox(piece.type) * flapScale * s.tile * scale, mirror);
    this.ctx.restore();
  }

  private drawAtlas(image: HTMLImageElement, index: number, center: Point, size: number, mirror = false): void {
    const cell = image.naturalWidth ? image.naturalWidth / 4 : 256;
    const sx = (index % 4) * cell, sy = Math.floor(index / 4) * cell;
    if (!mirror) {
      this.ctx.drawImage(image, sx, sy, cell, cell, Math.round(center.x - size / 2), Math.round(center.y - size / 2), Math.round(size), Math.round(size));
      return;
    }
    this.ctx.save();
    this.ctx.translate(Math.round(center.x), Math.round(center.y));
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(image, sx, sy, cell, cell, Math.round(-size / 2), Math.round(-size / 2), Math.round(size), Math.round(size));
    this.ctx.restore();
  }

  private framesPerTeam(image?: HTMLImageElement): number {
    const sample = image ?? this.images.get("raven");
    if (!sample?.naturalWidth || !sample.naturalHeight) return 16;
    const cell = sample.naturalWidth / 4;
    return Math.max(1, Math.floor((sample.naturalHeight / cell) * 2));
  }

  private restFrame(piece: RenderPiece): number {
    const desired = restFrameForPiece(piece.color, this.flipped);
    return desired === 16 && this.framesPerTeam(this.images.get(SPECIES[piece.type])) < 20 ? 3 : desired;
  }

  private perchAt(value: string | Transient): number {
    if (typeof value === 'string') return towerPerchElevation(this.obstacles, value)
    const from=value.perchFrom ?? towerPerchElevation(this.obstacles, value.piece.square)
    const to=value.perchTo ?? from
    return from + (to-from) * value.animalProgress
  }
}

function poseFor(t: number, plan: MovePlan, type: PieceSymbol, framesPerTeam: number, restRear: boolean): number {
  const stage = animationStageAt(t, plan.hasCapture);
  const rearFrame = (frame: number, fallback: number) => restRear && framesPerTeam >= 20 ? frame : fallback;
  if (stage === "habitat" || stage === "sit") return rearFrame(16, 0);
  if (stage === "rise") return rearFrame(17, 1);
  if (stage === "turn-away") return t < .34 || plan.facing !== "away" ? 2 : 3;
  if (stage === "chase") {
    if (t < .45) return plan.facing === "away" ? 3 : plan.facing === "toward" ? 1 : 2;
    if (type === "b" && framesPerTeam >= 16) {
      const flap = Math.floor((t - .45) * 28) % 2;
      const back = plan.facing === "away";
      return (back ? 14 : 12) + flap;
    }
    const base = plan.walkFrames[Math.floor(t * 14) % 2];
    return base;
  }
  if (stage === "attack") {
    if (restRear && type === "b" && framesPerTeam >= 16) return t < .825 ? 14 : 15;
    return rearFrame(19, t < .825 ? 8 : 9);
  }
  if (stage === "turn-back") return t < .90 ? 2 : restRear ? 3 : 1;
  return rearFrame(18, 10);
}

function deploymentPose(type: PieceSymbol, stage: DeploymentFrame["animalStage"], rear: boolean, frames: number, t: number): number {
  if (stage === "rest") return rear && frames >= 20 ? 16 : 0;
  if (type === "b" && stage === "arrive" && frames >= 16) {
    const flap = Math.floor(Math.max(0, t - .60) * 22) % 2;
    return (rear ? 14 : 12) + flap;
  }
  if (stage === "settle") return rear && frames >= 20 ? 18 : 10;
  return rear && frames >= 20 ? 17 : 1;
}

function tForFrame(item: Transient): number {
  // animalProgress is zero until chase, then tracks its 0.38–0.78 travel.
  return item.animalProgress;
}

export function isFlightFrame(frame: number): boolean { return frame >= 12 && frame <= 15; }

export function speciesMotion(type: PieceSymbol, frame: number, chaseProgress: number, tile: number): Point {
  if (type === "b" && isFlightFrame(frame)) {
    const wingRise = .25 + .15 * Math.sin(Math.PI * Math.max(0, Math.min(1, chaseProgress)));
    return { x: 0, y: -tile * wingRise };
  }
  if (type === "n" && chaseProgress > 0 && chaseProgress < 1) {
    const hop = Math.abs(Math.sin(chaseProgress * Math.PI * 3));
    return { x: 0, y: -tile * hop * .25 };
  }
  if (type === "r" && chaseProgress > 0 && chaseProgress < 1) {
    return { x: tile * Math.sin(chaseProgress * Math.PI * 4) * .018, y: -tile * Math.abs(Math.sin(chaseProgress * Math.PI * 2)) * .018 };
  }
  if (type === "p" && chaseProgress > 0 && chaseProgress < 1) {
    return { x: 0, y: -tile * Math.abs(Math.sin(chaseProgress * Math.PI * 7)) * .045 };
  }
  if (frame === 1 || frame === 3) return { x: 0, y: -tile * .055 };
  if (frame >= 4 && frame <= 7) return { x: 0, y: -tile * .035 };
  return { x: 0, y: 0 };
}

function animalBox(type: PieceSymbol): number {
  if (type === "k") return 1.10;
  if (type === "q" || type === "n") return 1.05;
  if (type === "r") return 1.03;
  if (type === "p") return .88;
  if (type === "b") return 1.00;
  return .95;
}

function habitatBox(type: PieceSymbol): number { return type === "p" ? .86 : .93; }

function easeInOut(t: number): number { return t * t * (3 - 2 * t); }
function lerpPoint(a: Point, b: Point, t: number): Point { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

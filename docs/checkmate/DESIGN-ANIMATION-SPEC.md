# Project Checkmate — design and motion specification

## Screen contract

The screen's job is to let local players understand the board, inspect the action economy and commit exactly one informed action. Audience: existing Woodland Chess players on phones and laptops. Classic keeps its board-only interface. Checkmate adds the minimum persistent battle information: active side, hand/support area and unit inspection. New Game chooses local two-player or the local Woodland AI, human side, AI difficulty and a mirrored opening-hand mode. Menus hold setup, codex, replay, undo, orientation, motion and optional sound.

Primary flow: choose mode → choose opponent/side/opening → build both armies → alternate deployment → install → select a ready support → choose Move, Attack or Burn → inspect legal targets and deterministic result → confirm → one animation sequence → opponent turn. In an AI match the human interaction locks while the worker chooses its legal deployment or one legal battle action, then resumes after that action's animation. Clicking a preview never spends a resource. Cancel returns to selection without changing game state.

Necessary states: initial asset loading/retry; roster draft and cancel; opponent/side/difficulty/opening selection; King-first deployment; AI thinking and bounded fallback; chosen unit/legal squares; hand/install; installed-but-locked; ready; exhausted with remaining own turns; source/target selection; invalid target; action preview; animation input lock; free draw with deck count/new-card badge/announcement; poison/terrain expiry; no legal action/forced rest; depleted-resource recovery; restored match/storage failure; King defeat/draw; restart and return to classic. No invisible state may alter combat.

On wide screens use a large square board beside a narrow tactics panel. On a phone keep the board near full width and cards in a scrollable bottom surface. The board must never be stretched, covered by fixed controls or made smaller to accommodate every card at once. Individual card inspection gives the full text, regardless of thumbnail size. All occupied units must expose HP, ATK, DEF, role, style, equipment and statuses on inspection. Match information is public in this prototype.

## Art direction

Continue the existing dimensional pixel woodland: midnight teal page, ivory/teal squares, thick weathered brick edge, walnut frames, antique brass details and modest ivy. Avoid a new visual language for cards. Soft board shadow and genuine alpha blend into the page. Source images are generated raster artwork, packed losslessly as WebP; no smooth vector replacements for animal art.

Six familiar silhouettes remain the anchor. Ivory/gold and charcoal/silver teams face each other. The near team uses three-quarter rear sitting poses; flipping changes both facing and hit geometry. Habitats stay large enough to identify, with light/dark square corners visible. Do not crop paws, tail, wings or ears to fit a cell. Actual animals are separate from their habitats.

| Family / role | Habitat | Locomotion | Melee attack | Ranged variant design |
|---|---|---|---|---|
| Lion / King | Dry savanna earth, sparse grass | Heavy measured steps, mane and tail lag | Plant front paws, lift chest, roar with small expanding sound rings | None in v0.1 |
| Fox / Queen | Mossy woodland soil, roots | Low quick stride, tail balances turn | Wind-up, short claw swipe, recover | Emberseer: poised forepaw release, small ember bolt; stays on ground |
| Turtle / Rook | Small pond/islet, reeds | Slow alternating limb push, shell sway | Tuck, short shell roll, untuck with all four feet | Reef Siege: shell brace, compact water/pebble shot along file |
| Raven / Bishop | Rooted tree stump | Rise, spread, flap and glide with genuine flight frames | Claw contact; only a defeated victim may be lifted/dropped out | Stormcaller: wing flick and feather bolt on a clear diagonal |
| Hare / Knight | Grassy mound, small flowers | Crouch, hindleg drive, visible foreleg landing | Compact hindfoot kick; spring back when target survives | None in v0.1 |
| Rat / Pawn | Packed earth, pebbles | Quick alternating fore/hind steps, trailing tail | Tail wind-up and lateral whip; return if nonlethal | None in v0.1 |

Two variants per role currently share the family sprite library and differ in stats, combat style, name and inspection text. Bespoke accessory silhouettes and dedicated variant-specific frame sheets are a future art pass, not already-created assets. The existing 40-frame atlases preserve front, rear, walk, sit/rise/settle and attack poses; raven has distinct wing-up/down flight frames. Anatomy acceptance: two forelegs visible where the camera permits, correct hindlegs, one coherent tail, two wings; occlusion must follow camera direction, never missing limb art.

## Timing and causality

Use readable, slightly deliberate motion. Suggested master movement lasts 1.8–2.8 seconds by distance. Habitat departure 0–18%, rise/free tail and turn 18–38%, animal pursuit 38–78%, contact/arrival 78–93%, turn and settle 93–100%. Do not translate a sitting animal as a sticker. Foot contact, shadow and height must agree. Flight is elevated with flaps; hare hops on a bounded arc; turtle lumbers; rat scurries. Fast tactical effects should not repeat an entire walk cycle.

All final locations come from the engine, not an animation guess. The engine resolves once, animations illustrate the resulting event stream, and interruption settles to that same final state. No animation grants extra actions or implements combat rules.

### Encounter matrix

| Event | Required visual behavior |
|---|---|
| Normal Move | Habitat moves first, animal rises/turns, follows using its species gait, then settles. |
| Lethal melee | Existing habitat shifts to a corner; incoming habitat fits beside it. Attacker reaches its ground, strikes; defender and its ground disappear only after impact; attacker claims full square. |
| Nonlethal slider | Attacker habitat stops at engine's square before defender. Animal attacks across the gap and returns to that habitat. Defender recoils and stays; no disappear/respawn. |
| Nonlethal Knight/Pawn | Attack excursion and return to origin habitat. Do not leave the animal on the occupied target. |
| Ranged attack | Wind-up and species release at source; source habitat never moves. A bounded projectile travels to target, impact/recoil and HP change happen together. Only lethal targets fade. |
| King defeat | Finish impact, settle scene, winning side's existing board-local celebration, then restart/view-board dialog. Never open result before attack completes. |
| Draw | Quiet board settle and result; no winner celebration. |
| Veteran | Small brass star/leaf crown burst, persistent Veteran badge and stats. Species remains rat. |
| Classic castling / en passant | Retain existing two-unit castle movement and adjacent en-passant strike. They are disabled only in Checkmate. |

### Card and status motion designs

These are the complete production targets. The prototype implements core travel/combat and lightweight effect feedback; the more elaborate transitions below remain a polish queue where not explicitly present in code.

| Action/state | Motion design and sound cue |
|---|---|
| Install | Selected hand card lifts 4px and travels into support over 240–320ms; no board animation. Show a lock and “Next own turn”. Soft wooden placement. |
| Automatic draw | At own turns 3, 6, 9 and onward, deal one card without spending the action. Update deck remaining; flash one brief new-card badge and announce the card name. |
| Exhaust for Order | Card tilts/turns 12° into its slot over 180ms and dims; remaining cooldown replaces Ready. It remains visibly owned, not discarded. |
| Refresh | Card returns upright with one brief brass-edge pulse; label changes to Ready. No looping glow. |
| Burn | Card lifts, printed illustration releases its effect, edges dissolve into leaf/ember motes, discard count increments. Use 300–450ms; preserve enough time to read the choice. |
| Banner | Short brass leaf flare above target, Inspired badge. Consumed on next attack. |
| Iron Shield | Low gold ring under target and a short shield glint; Guard badge. |
| Spring Water | Turquoise ripple and upward leaf motes; +HP number at target. No HP increase beyond max. |
| Aimed Shot | Small aimed streak from chosen source to target; single impact and −1. |
| Tangle Vines | Roots curl around habitat edge, leave feet visible; Rooted badge with duration. |
| Bramble Snare | Public thorn ring on square; on trigger close modestly, then disappear and add Rooted. |
| Purifying Herbs | Green leaf swirl removes poison/root badges before +1 healing. |
| Venom | Purple dart/puff; Poison badge. At own-turn end one small puff and −1 per affected unit, exactly once. |
| Smoke | Low persistent cloud within projected square; enough alpha to see the square. Small dissolve at expiry. |
| Fallen Log | Short grounded log with contact shadow; no oversized full-square obstruction. Crumble/leaf fade on expiry. |
| Equipment | Brief cache-to-unit glint and visible weapon/armor badge; permanent numerical change on inspection. Future accessory art must follow facing. |
| Recover | Plain Reserve Order builds into an empty support slot; locked until next turn. Distinct from healing. |
| Forced rest | Short neutral pulse on turn indicator, then clear turn change; no false unit animation. |

Damage and healing numbers appear at the actual target even when it has already been removed from the final state. HP bars use engine values. Multiple poison ticks need separate target feedback, not a single generic explosion. Labels and icons must distinguish Ready, Locked, Exhausted and Discarded without relying on color.

## Reusable terrain/effect art

`public/assets/checkmate/effects.webp`: 4×3, 192px cells, Banner / Shield / Smoke / Water / Shot / Vines / Snare / Herbs / Venom / Log / Weapon / Armor.

`terrain.webp`: 4×2, 192px cells, Smoke / Log / Snare / Guard / Healing / Poison / Ember / Roots. These sprites support both persistent ground and brief bounded effects. `card-back.webp`: walnut/brass/teal deck back. Full generated PNGs and packed sources are in `art-sources/checkmate/`.

Future GDD terrain families: attack ground uses amber broken-ring marks, defensive ground gold moss-covered cairns, healing ground pale turquoise reeds, poison ground purple fungi, burning ground sparse orange embers, energy ground cyan leaf-runic seams. Every family must keep square color identifiable and use a separate duration/ownership badge. These future terrain rules are not implemented by merely having matching effect art.

## Accessibility and interruption

Projected square polygons drive both canvas markers and transparent HTML buttons. Keyboard focus follows the same perspective; flip changes navigation order. Arrow keys navigate, Enter/Space select, Escape cancels uncommitted selection. Dialogs trap focus and return it; touch targets are at least 40–44px for controls. Full rule text must not depend on hover.

Respect OS reduced motion at startup and expose a menu override. Reduced motion resolves to final board state with short/nonspatial feedback; never require waiting through travel. Sound is off initially. Resize, tab hide, undo, new game or mode switch cancel pending animation promises and settle coherently. Tests should include cancellation during ranged attacks and after a King hit.

## Acceptance and next art pass

Acceptance criteria: square polarity stays readable; each species/habitat recognizable on phone; final unit location matches preview; target survival never looks like capture; source stays still for ranged; all limbs remain coherent; one resource cost and turn change per action; no obscuring celebratory UI before result.

Next polish pass: dedicated ranged-release poses, nonlethal recoil frames for each species, directional equipment overlays, install/exhaust/burn travel, source-aware status projectiles, and optional family-specific foley. Online synchronization and replay scrubbing must consume the same events, never alter motion/rules independently.


Trading-card table update: new matches have three support slots per player in rows above and below the board. Saved v0.1 matches retain five slots to preserve their replay and resources. The resolved immutable `supportLimit` is saved by ruleset v0.2. Cards use the existing original woodland illustrations with a native trading-card frame. Tap a card for its full readable effect or unit statistics. Drag a hand card to its own support row (or the board, explicitly installing it in support) to spend one Install action. Opposing/full/invalid/cancelled drops spend nothing. A ready installed card offers Exhaust to move/attack, retaining the card in cooldown, or Use effect, permanently discarding it. New installations are locked upright; spent cooldown cards turn sideways. Pointer/touch/keyboard controls and reduced motion are supported; classic chess is unchanged.

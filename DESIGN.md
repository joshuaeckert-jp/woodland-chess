# Design

The board and animals are the interface. Gameplay shows only the board and a 44px walnut/brass burger button. All other controls belong in compact native dialogs. Do not restore the earlier sidebar/header layout.

Palette: page #102330, ivory tiles #DDCDA7, teal tiles #315754, walnut #38241B/#4A3024, brass #C49B55, moss #78925B, text #EEE5CD. Quiet system sans with a restrained Georgia modal title. Preserve the rich layered pixel shading, raised weathered brick foundation, walnut rim, brass, and edge vines. Board alpha and soft shadow blend into the page.

Natural animal colors stay consistent across armies. Ivory/gold and charcoal/silver accessories identify teams. Raven eyes blue; turtle eyes amber. Habitats: savanna lion, forest fox, rooted stump raven, grassy hare mound, turtle pond/islet, packed earth rat. Enlarge animals and terrain while keeping tile corners readable. Near-side animals face away toward the enemy in three-quarter rear rest poses; the far side faces toward them.

Projection is centralized in BoardRenderer for the 1254px board: row boundaries 98,220,343,467,590,713,832,949,1084; top x endpoints136/1117, bottom117/1137. projectSquarePolygon drives drawing and DOM hit areas. Never substitute rectangular grid selection/focus.

Species atlases: 192px cells, 4 columns and 10 rows, 20 frames per team including shared/reused poses. Habitats are separate. Runtime lossless WebP is RGBA-identical to packed PNGs; source PNGs and prompts are retained in art-sources.

Motion is habitat-first, then rise/turn/chase/attack/settle. Flight uses real wing poses. Hare arcs land between hops. Captures make room for two terrains then reclaim center. Victory is brief and board-local. Reduced motion settles immediately. Audio is opt-in synthesized foley.

## Project Checkmate extension

The tactical mode uses the same palette, pixel-art depth, board geometry and sprite families. It adds a responsive scrollable card panel, roster dialog, unit inspector, action confirmation and codex. New Game chooses local two-player or the local Woodland AI, side, difficulty and mirrored opening-hand mode. Cards use walnut frames with generated atlas illustrations; Ready, locked and exhausted states have text labels. Deck remaining, a new-card badge and a short draw announcement keep the free turn-3/6/9 draws understandable. During an AI turn, input locks and the compact turn indicator communicates thinking without inventing board motion. Terrain is clipped to projected square polygons. Nonlethal defenders recoil in place; ranged animals keep their origin habitat. The full production motion matrix and current/proposed distinction are in `docs/checkmate/DESIGN-ANIMATION-SPEC.md`.


Trading-card table update: new matches have three support slots per player in rows above and below the board. Saved v0.1 matches retain five slots to preserve their replay and resources. The resolved immutable `supportLimit` is saved by ruleset v0.2. Cards use the existing original woodland illustrations with a native trading-card frame. Tap a card for its full readable effect or unit statistics. Drag a hand card to its own support row (or the board, explicitly installing it in support) to spend one Install action. Opposing/full/invalid/cancelled drops spend nothing. A ready installed card offers Exhaust to move/attack, retaining the card in cooldown, or Use effect, permanently discarding it. New installations are locked upright; spent cooldown cards turn sideways. Pointer/touch/keyboard controls and reduced motion are supported; classic chess is unchanged.

## Physical materials and ambient life (v0.21)

Card materials communicate roles beyond color: masonry for terrain, riveted metal for defense, stitched cloth over walnut for buffs, thorned bark for control/traps, medicinal foliage for recovery and paw-carved wood for animals. Generated transparent nine-slice frames fit compact shrine cards and their enlarged original readers. Names, effects and cooldowns stay unobstructed. Smoke drifts only within card illustration windows and actual smoke squares; ambient animation does not imply an unimplemented area ability or instant card.

Board life is quiet and anchored: phased breathing, small pond ripples, sparse grass sway and rail motes. It never changes a unit's square or facing. Canvas idle work is limited to12fps and suspended while actions, dragging, visibility or motion preferences require it. No perpetual whole-card wobble or pulsing board grid. Art source: art-sources/card-material-frames-v1.png. Existing game rules/decks are unchanged by this visual release.

## Altar objects (v0.24)

A support card manifests as its illustrated object on the stone altar, without a paper face or frame. Keep the actual card button and accessible name underneath the visual treatment; hovering moves the same node into the full readable card reader, and leaving restores the object. An order settles and dims the object; the base medallion remains the countdown. A cast dissolves the object into mist. Hand cards retain their material frames. Illustration lower-padding metadata aligns each object with the ledge without changing hitboxes or layout.

## Encounter objectives (v0.25)

Encounter objectives live in a compact green quest note with brass edging and pixel checkboxes. Completed tasks update automatically; active and subsequent objectives remain distinguishable without requiring a prescribed solution. Show remaining actions or survived enemy turns. Native details supports collapse/keyboard access, and Hint opens the existing encounter explanation with the hint expanded. Keep goals outside playable squares by default, preserve the normal skirmish ribbon, and derive completion from game state so undo/reload remain faithful.

## Spell mist (v0.26)

Casting should show the causal chain: object → dissolving source → flowing mist → gathered effect. Blue/violet stepped clouds follow several curved streams rather than a thin targeting line; the pointer remains visible and the selected animal stays readable. Source evaporation takes380ms while dragging. Valid release gathers the stream over550ms and wraps the target for450ms, revealing the board effect at arrival. Invalid drops return over250ms. Preserve source geometry explicitly when accepting DOMRects, whose numeric properties are not enumerable. Drag and release own separate presentation instances reconstructed synchronously from source and cursor coordinates, so cleanup never depends on shared global animation ownership. These coordinates never enter replay state. Honor reduced motion and static settings, and resolve pending transitions on cancellation.

## Grey courtyard and full-square habitats (v0.27)

Keep the original copper/wood rim, mossy masonry thickness, projected grid, character atlases, facing and action choreography. Replace only the board surface with neutral pale-grey limestone and charcoal slate paving. Each animal owns a square-sized ground layer: turtle pond, raven roots, hare meadow, lion savanna, fox leaf litter and rat earth. Cached square terrain has a stepped, ragged alpha perimeter revealing the underlying paving and checker identity. Apply the completed mask once; repeated destination-in fills erase earlier parts of a canvas. Ordinary habitat travel/drag, capture crowding and deployment reuse this layer; roof occupants retain the small nest so the masonry owns the ground. Selection paints after static habitats, before animals.

Wall/tower v2 art uses frontal elevated silhouettes and horizontal stone courses to match board rows. A1.25-tile art width permits small rubble/ivy spill; collision and target polygons still occupy one logical square. Tower art is512×410, groundAnchor .95 and deckAnchor .20, matching the existing .75-tile animal/shot elevation; wall art is512×344 with groundAnchor .94. Neither scenery bitmap rotates when the board flips. Optional art failures retain deterministic procedural paving/terrain/scenery. Ground textures are cached; no new continuous animation or game rules.

## Dimensional terrain correction (v0.28)

Restore v1 wall/tower sprites and their original geometry (1.10 footprint; wall .85 ground anchor; tower .86/.24,562px height, .75-tile perch). Keep neutral grey courtyard and full-square biome tops. Terrain composites contact shadow → shallow ragged extrusion → square biome top → original raised habitat atlas → animal. Shade silhouettes are cached from the same alpha as the top. The original habitat overlay uses .92 scale and a bottom-anchor compensation to preserve the existing animal foot line. Roof nests remain unchanged. This restores the proven 3D pond stones, roots and vegetation without replacing animations or flattening silhouettes into the ground texture.

## Full-square structure foundations (v0.29)

Keep v1 art and camera; increase wall/tower sprite footprint from1.10 to1.28 tiles. Scale the tower's physical height and roof elevation together from the authored562/512 aspect and .86/.24 anchors, so nest, feet, travel and projectile origins stay aligned. Paint a full projected square of moss-tinted stone with sparse chips and a broken paving approach below all structure/animal/highlight layers. The visual foundation and silhouette have no extra collision area; demolition removes both naturally with the obstacle state.

## Structure ground alignment (v0.30)

Preserve the existing building angle and original masonry pixels. Load a separate moss/paver texture into each actual projected board polygon so all four ground edges follow the chess square. Cache a lower-band alpha treatment of each original sprite, removing lateral diamond tips and blending its front point into the square foundation. Wall clipping begins below60% height and tower below70%; a central contact lane retains doorway roots and steps. Original source files, RGB colors, sprite positions, ground/deck anchors and enlarged tower elevation are unchanged. The cached treatment runs only at image load; there is no per-frame image-data work. Board flip moves scenery to the corresponding projected square without rotating its body.

## Temporary terrain routes (v0.31)

A valid habitat drag previews the animal's biome along its engine-authorized route at25% opacity. On release the route strengthens to45%; the destination ground builds from55% to100% opacity as the animal follows. Once the animal and any capture settle, a360ms retreat reveals cobblestones from origin to destination; only the final habitat remains. Hare routes use separated landing patches. Project samples through the board grid, and clip static unit and obstacle polygons out of trails. Castling has a separate king and rook route. Stationary/ranged actions and deployments have no route.

Trails are presentation state only. Use cached flat habitat textures on a single route layer to avoid opacity accumulating between overlapping samples. Draw after paving, before foundations, habitats, highlights and animals. Keep the movement promise/pending position alive through retreat. Cancellation, new state, hidden page, resize, reduced motion and teardown clear the route and settle atomically; invalid preview fades160ms. Ambient loops remain paused until the route clears. Reduced motion omits trails. No engine action, terrain effect, cooldown or replay data is added.

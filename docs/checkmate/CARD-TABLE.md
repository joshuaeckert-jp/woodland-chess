# Pixel card table — v0.9

The board is the primary play surface. One canonical viewport budget reserves a compact status area, two support rails and a shallow hand strip, then gives the remaining width/height to the square board. The former 330/250/600px board caps and repeated layout overrides have been removed.

Portrait uses opponent support → board → own support → hand. Wide landscape uses side shrines. Short landscape uses smaller side shrines. The board is 488px at 652×1004, about 359px at 390×844 and 708px at 1440×900. Shrine thumbnails show identity, artwork and cooldown rather than squeezing full rules into tiny text. Hover/focus/tap supplies full text.

The hand is a bottom-edge fan. Only its upper strip occupies the play area; card bodies extend below it, as in a physical hand held in front of the player. Overlap increases with hand size while retaining a minimum selectable width; larger reserve hands can scroll horizontally. This is deliberate compact presentation rather than accidental top clipping.

## Inspect and drag

Hover waits 120ms, then moves the original card node into the enlarged reading stage. A footprint preserves its home spacing. A pointer-movement bounds check keeps it stable while the pointer is inside its original footprint, enlarged face or their connecting corridor. Reparenting-generated pointerout events do not close it. One entrance animation plays per lift. Keyboard focus enlarges without entrance motion. Touch/Enter pins, Escape/outside press/Close dismisses. Reduced motion skips movement.

The enlarged face has concise drag guidance and Close; it has no Play, Deploy, Order or Effect buttons.

- Hand effect: drag to your shrine to install. One action; a newly installed card locks until its next own turn.
- Reserve animal: drag to an empty legal home square to deploy. One action; no support card required.
- Ready shrine card: drag onto an animal or legal square. A friendly target may offer the existing anchored Order/Effect choice when both uses are legal. Invalid/locked/opposing/cancelled drags spend nothing.
- Ordered animal: drag its habitat to a legal destination, committing one move/attack without another confirmation. The animal stays at source during the drag and then follows using its existing animation. Ranged, nonlethal and lethal positioning rules are preserved.

Keyboard alternatives remain on the original card: Enter pins inspection; Space on a hand effect opens its installation confirmation; Space on a reserve selects deployment targeting; Space on a ready support selects order targeting; E selects its printed effect. Board navigation and inline confirmation remain available. The ambiguity chooser remains only when needed to interpret a drop.

## Rules and persistence

This update changes presentation and interaction, not combat, draw, cooldown or one-action rules. Reinforcement and Full Army remain available. New matches have three support slots; old five-slot saves keep their recorded capacity. Classic retains independent rules and saves. Replay ruleset remains v0.3.

The transition layer never changes game state. One validated action commits and saves once, then animates. Resize, cancellation, new-game interruption and reduced motion settle transient visuals. Existing deployment, effect, movement and attack choreography is preserved.

## References

Reviewed the official [9 Kings store screenshots](https://store.steampowered.com/app/2784470/9_Kings/) and a [Hearthstone gameplay reference](https://games.gg/news/web3-trading-card-games/). The adopted principles are board priority, a compact bottom hand and full card reading on demand; artwork and rules remain Woodland Chess’s own. Generated shrine assets and prompts are documented in SHRINE-ART.md.

## Fitted stone sockets — v0.9.1

Each resting card sits entirely within a full-height inset stone well, with space for its sideways cooldown pose. The shared artwork keeps its proportions and crops behind the masonry instead of flattening. Portrait support rows reserve 128px (112px on shorter phones); the board budget accounts for both rows. Existing five-slot saves scale card faces into the same wells. Inspection continues to lift the original card beyond the shrine.

## Face-down cooldown — v0.9.2

Exhausted cards keep their upright dimensions and display the woodland back with a large crisp 5×7 pixel numeral. The value uses the existing owner-turn progression (`readyOn − ownTurn`), so it shows own-turn starts until ready and preserves replay/rules semantics. New-install locks keep their front face. Ordering performs a 140ms front-to-edge and 160ms edge-to-back flip. Readiness reveals the front with a 200ms return; counter ticks do not replay the flip. Inspection reveals the original printed face and its unavailable-until status. Reduced motion settles instantly; interruption removes transient cards and reveals the committed state.

## Illustrated card holders — v0.9.3

The original mossy stone/candle artwork is fully visible at its native proportions. Added square socket overlays have been removed. Cards stand with their bottom edge aligned to each illustrated ledge and can project above the recess, like a card in a holder. Portrait shrines derive height from their artwork width; shorter portrait screens use a narrower proportionate holder to preserve board space. Desktop side shrines retain natural proportions with individual ledge alignment. Upright cooldown backs, flipping, inspection and dragging are unchanged.

## Illustrated cards and mist casting — v0.10

Card faces now follow the approved reference: layered color frames, tinted faces, larger pixel art, serif headings/effects and round bronze numbered cooldown badges. Blue supports defense/buff, green healing/recovery, purple damage/control/terrain and gold equipment. The medallion is the existing cooldown, not mana. Unit cards retain their role/combat information and numeric stats. The same original DOM node enlarges during inspection; no second reader card or Play button is added.

Ready shrine cards use two distinct gestures:

- Click: prepare an animal order. A temporary face-down ORDER back marks selection. Choose an animal, then drag its habitat to move or attack. Nothing is exhausted or spent until the legal order commits. Clicking again or Escape cancels.
- Drag: use the printed effect. The source card remains anchored on its illustrated holder, with a colored pixel-mist connector to the pointer and a highlighted valid target. A small caption identifies the effect/target and casting square when applicable. A valid release commits one burn immediately, without an Order/Effect chooser or confirmation. The source card breaks into mist and its existing board effect resolves. Invalid releases restore the ready card without opening the underlying unit inspector.

If several friendly sources can legally cast the same effect, the preview deterministically uses the closest source (squared board distance, stable ID tie-break). This changes only UI selection among engine-legal actions; target, damage, cooldown and turn rules are unchanged. Keyboard E and the inline targeting preview remain available as alternatives.

Hand cards still install into a shrine; reserve animals still deploy on legal home squares. Held pointer gestures block hover/focus reparenting before the drag threshold. Native HTML dragging is suppressed, release clicks are consumed, and shrine positioning overrides generic card-hover transforms. Mist uses a pointer-inert DPR-capped canvas, with a static connector under reduced motion and full cleanup on interruption.

## Direct pickup and refined card inspection — v0.11

After clicking a ready shrine card, any living friendly habitat can be picked up immediately. Pointer-down resolves the source square, selects that unit and reveals its legal destinations without rerendering or requiring a prior tap. Invalid releases spend nothing, and the next gesture can pick a different friendly unit. The prepared-order board establishes touch-action before the first touch so phone pans do not steal the drag. Keyboard and click-to-select alternatives remain.

The cooldown medallion now occupies the printed face’s top-right corner, with an explanatory tooltip. Shrine miniatures use a separate small inset pixel marker, rather than shrinking a large round coin awkwardly. Enlarged cards have stepped pixel frames and restrained type-specific edge detail: metal rivets, leafy cuts, angular runes and brass bars. Outer card dimensions and illustrated holder alignment are unchanged.

The visible instruction panel beneath the reader has been removed. A 24px external close control remains, and guidance is associated through aria-describedby for assistive technology. Short landscape readers use the card alone instead of a separate controls column. The optional Actions/Journal/Army match drawer remains accessible through the menu.

### v0.12 shrine sockets

Raised cards preserve their illustrated ledge baseline and wrap names over two lines. Cooldown on small shrine cards now belongs to a separate base socket (`.cm-shrine-medallion`, keyed with `data-medallion-card` so it cannot become a card drag source). Ready and newly installed locked cards show a category-colored leaf; exhausted cards show remaining own turns as crisp SVG digits. State changes animate once; rendering/reload does not. The full reading face still carries its printed cooldown. Card backs remain woodland artwork. Every slot has its own visible socket across horizontal and vertical arrangements.

### v0.13 card inspection

Card-reader X removed. Desktop hover uses a 120ms stable candidate dwell, 10px boundary tolerance and 180ms release. Moving outside closes even if moving toward the card; exiting the window also dismisses. Adjacent shrine cards remain exposed beside their enlarged reader. Tap outside or Escape dismisses pinned inspection. Portrait rails capped at 288px, leaving the board the primary viewport surface. Raw pointer tests target the actual visible card area, accounting for the clipped bottom fan.

### v0.14 compact shrine faces

Shrine cards shortened from 82 to 70px in portrait; titles still reserve two lines. Illustration flexes to fill the remaining face; removed duplicate inner frame and its decorative diagonal. Horizontal rails shrink from 126 to 114px, reclaiming 24px for the board. Desktop card cap112px and wings176px. Reading/hand card styling and interaction rules unchanged. Build plus ten focused hover, drag and cooldown checks passed; rendered four viewports.

### v0.15 delayed board-unit inspection

Mouse dwell500ms over an occupied projected square shows a pointer-transparent unit card with live effective HP/maxHP, ATK/DEF, role, side and movement/combat description. HP sits above artwork for quick scanning. Moving to another square starts a fresh delay; leaving, pressing, rendering, resizing or hiding the window dismisses it. Holding/dragging suppresses it. Keyboard square focus also supports delayed inspection; touch retains existing tap-to-inspect. No board layout changes. Five new unit-hover browser cases plus seven existing card-hover/direct-grab cases pass; production build and rendered desktop/narrow review pass.

### v0.16 — Card-Powered Chess (Version B)

New-game combat selector adds Capture alongside unchanged default engine HP rules. URL `?mode=checkmate&rules=capture&new=1` opens Capture setup; existing saves retain their rules. Full and reinforcement armies both supported. Capture uses standard role movement, melee captures for all variants, capture-the-king victory, no orthodox check/castling/en-passant. Last-rank rats automatically become Fox Queens. Unit cards/hover/ARIA/canvas omit HP/ATK/DEF; species and role give canonical names instead of numerical variants.

Installing a tactical card in Capture is one atomic install+move/capture action: hand→altar and chosen order resolve together, new card exhausts, turn advances once. Drag hand card to altar (or Space), then directly drag any friendly habitat; invalid drop or Escape spends nothing. Ready altar cards still click to order or drag to cast. Three slots preserved. Printed effects remap to Guard, Piercing, Root, Cleanse, Smoke, Snare and Log; Guard lasts until it blocks a capture, leaving attacker at source, and Piercing bypasses it on next attempt through next own turn. Root blocks both moves and captures through next controller turn. Snare is one-use. Smoke blocks slider attack rays including endpoint/source but allows movement; Log blocks movement/attacks. Card logistics alone do not reset Capture quiet clock; captures, Guard removal, pawn advance and reinforcement deployment do.

Engine saves v0.4 records combatRules plus full atomic payload; v0.1–0.3 restores as HP. Compound action identity validated in engine, AI and worker client. Capture-specific AI scores material, threats, unique physical captures and repetition; HP evaluation preserved. Ten fixed-seed self-play smoke matches replay-verified and reached king elimination (6 full/4 reinforcement; not a matched balance comparison). 136 unit checks pass. Full browser run covered102 cases with100 passing initially; two drag cases rechecked in16/16 passing after visible touch-target repair and preview reload settled. Desktop1280, narrow500 and phone390 rendered without overflow, and actual browser-worker Capture opening verified.

### v0.17 — Three authored encounters and instant Skirmish openings

Encounters are the default new-game choice. Break the Blockade teaches Piercing against a marked guarded turtle in two White actions; Rescue the King teaches cleansing Root and moving to c3 in two actions; Hold the Crossing teaches a curated reserve rat and two Guards to survive three Black replies while keeping the king on d1. White is the human side. Fixed hands/decks, ready altar cards, tiny curated armies and authored opponents remove opening draw luck. Enemy policies only select engine-legal actions and are shared by worker and fallback paths. Menu provides objective/hint, round-level undo, restart. Result supports retry, next encounter and encounter selection. Objective square and remaining action/reply count are shown without expanding board layout.

Encounter initial states are authored by id in encounters.ts. Omitted units are defeated, not reserves; Crossing has exactly one whitelisted reserve. Explicit encounterProgress is canonical, survives simulation's log-free path, and replays in v0.5 saves. King defeat precedes objective success; other objectives resolve before quiet draws. Ordinary v0.1–0.4 saves remain compatible and new non-encounter saves remain0.4. Skirmishes auto-populate the traditional starting formation before first render: no new-game placement or Auto-place step. Legacy reinforcement/manual saved positions remain supported. Classic chess and HP comparison remain.

Potential next terrain experiment (proposal, not implemented): a tower with a defined perch benefit and a castle refuge granting one Guard while immobilizing the king for two of its own turns. Avoid repeated castle entry granting unlimited shields. Keep occupancy readable before adding separate ground/perch layers.

## Watchtower experiment (v0.18)

The fourth authored encounter tests permanent board obstacles without changing ordinary skirmish decks. Walls block landing and rays; ordinary hare L-jumps pass over them. Towers can be occupied but cannot be traversed as an intermediate square. Each tower has one shared shot for its entire lifetime, not one per occupant. With a ready support selected, Fire chooses an enemy within two squares along a clear rank, file or diagonal; walls, intermediate towers, units and smoke block sight. It exhausts that support, leaves the shooter in place and Roots it through its next own turn. Guard absorbs the shot unless Piercing is active. The tower is spent either way.

Trailbreaker (capture-only, CD2) is a dual-use Terrain card. Burning it requires an actual pawn with an unoccupied obstacle immediately forward, removes that obstacle permanently, and leaves the pawn stationary. Dragging it onto either the pawn or obstacle selects the same compound legal action. Clearing a tower sacrifices its shot and perch. Ordinary twelve-card starter decks are unchanged; the encounter supplies Trailbreaker directly.

The Watchtower starts with three ready supports and no hand/deck randomness. Defeat sentinel d5, then reach e5 by White action4. Preserve route: hare b2-d3, tower shot d5, pawn d2xe3 during Root, hare d3-e5. Clear route: demolish d3, pawn d2xe3, rook d1xd5, rook d5-e5. Enemy sentinel and decoy are visibly Rooted; the enemy king moves using legal authored replies. Saves use project-checkmate-0.6 only for this encounter.

### Ownership and scenery presentation (v0.19)

Ownership plaques use explicit player-relative labels in AI games, side names in local games, and distinct gold/violet crests independent of tactical card colors. Board flips change placement, not owner identity. Old full-army setup saves complete their remaining deployment once, retaining placed units and a reproducible placement log.

New transparent wall/tower scenery occupies roughly a full square with small decorative spill. Visual overlap uses ground-baseline depth order; only the obstacle's original coordinate affects rules. Tower rooftop elevation is shared by resting animals, habitat nests and movement interpolation. Spent tower artwork dims, without removing the perch or blocking geometry. Larger artwork does not expand collision or attack range.

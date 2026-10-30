# Woodland Chess release

Live game: https://woodland-chess.jo-eckert96.workers.dev

Verified 2026-10-27. Cloudflare Worker `woodland-chess`, deployment version `551602d3-3b9a-46f9-b228-3ac5a7e1fea8`.

## Verification

- TypeScript check and Vite production build passed.
- 24 unit tests passed: rules, replay/history, worker cancellation/fallback, perspective geometry, capture staging, opponent-facing rest poses, flight and hopping continuity.
- 20 Chrome browser tests passed: legal/illegal moves, AI difficulties, animated castling and en passant, captures, all promotion choices, checkmate/draw and restart dialogs, settings cancellation, saved history, keyboard, board flip, polygon hit areas, reduced motion, portrait and landscape.
- Hosted HTTPS check returned 200, loaded the artwork as `image/webp`, completed an AI reply, played Fool's Mate through the victory/restart flow, and verified the 390px phone layout without horizontal overflow. No browser runtime errors were reported.
- Development position-injection hooks are absent in production.
- Runtime WebP artwork was checked RGBA-identical to the packed PNGs.

## Scope

Single-player against four local engine settings, or two players on the same device. Saves remain in the current browser; PGN export is available. Online multiplayer and cloud save sync are not implemented. Phone layout checks used Chrome emulation, not a physical iPhone. Deno tasks are supplied but were not executed because Deno was not installed. The visual world is dimensional pixel art, not editable 3D meshes.

## Downloads

`Woodland-Chess-Game.zip` contains the source, tests, runtime artwork, and ready-built `dist/`. `Woodland-Chess-Artwork.zip` contains the generated source sheets, packed PNG atlases, and prompts. Extract both archives into the same parent folder to restore the complete project including `art-sources/`.

Optional atlas rebuilding uses native uv: `uv run --with pillow --with numpy python scripts/pack_sprites.py`.

# v0.2 — Project Checkmate prototype alongside Classic

Published 2026-10-27 to the same Cloudflare Worker. Deployment version: `e2c26717-a984-4f2f-824e-588d3850601e`.

- Classic: https://woodland-chess.jo-eckert96.workers.dev/
- Checkmate: https://woodland-chess.jo-eckert96.workers.dev/?mode=checkmate

Classic's normal rules, AI settings, board-only interface and save key remain independent. Its New game dialog now selects the ruleset. Checkmate provides full-army variant selection, alternating legal deployment, deterministic HP combat, twelve dual-use effects, support cooldowns, terrain/traps, statuses, equipment, recovery, King defeat/draw, replay/undo/export and phone controls. It is local two-player, not online PvP or a new AI opponent.

## Verification

TypeScript and production build passed. All **57 unit tests** and **26 Chrome browser tests** passed, including the complete Install/Burn/Order flow, retained nonlethal defenders, King defeat/restart and switching rulesets without changing the saved classic position. Five seeded reducer simulations exercise burn/attack-heavy actions, HP/occupancy/turn invariants and replay equivalence.

Rendered desktop and 390×844 phone views were inspected. A real animated nonlethal queen attack left the King at 5/8 HP and the attacker on its legal approach square, with no runtime error. New effects/terrain/card-back runtime WebPs are RGBA-identical to packed PNGs. Production development hooks are stripped. Physical iPhone Safari testing remains for the user; automated phone checks use Chrome emulation.

Prototype choices and remaining production work are explicit in `docs/checkmate/`. Dedicated variant accessories, the full card transition polish pass, more ranged/recoil sprite frames, balance validation, deck editing, online multiplayer and other GDD modes are future work.

## New downloads

`Woodland-Chess-and-Checkmate-v0.2.zip` contains both modes, source, tests, docs, runtime artwork and built static assets. `Project-Checkmate-Design-and-Art-v0.1.zip` contains the design/rules documents and new generated/packed source artwork. Both use a `woodland-chess-game/` parent; extract into the same directory to add the new art sources. The earlier full classic artwork archive is still available separately.

# v0.3 — Woodland opponent and explicit hand/draw flow

Published 2026-10-27. Cloudflare version `3c94e344-2ebd-4e1d-aeb9-9484268d6866`.

Checkmate now offers a browser-worker opponent at Easy, Normal and Hard, with human side selection, alternating AI deployment and one legal action per turn. Opening setup offers balanced, exactly-five selected or seeded-shuffled cards. Both sides receive the same deal. The draw pile exposes remaining cards, next scheduled draw, new-card markers and announcements. Drawing remains automatic and free on own turns 3, 6, 9, etc.

The session stores AI preferences with the replay. Legacy saves remain local two-player; custom hands replay exactly. AI Undo removes a human decision plus its response. Menu/new-game/page-hide/reload paths prevent stale or duplicate AI actions. Classic remains independent.

Verification: **94 unit tests**, the **32-test full browser suite**, and an additional pending-AI-turn reload case passed (33 browser cases total). TypeScript and production build passed. Hosted HTTPS verification at 390×844 used a custom hand, observed two real AI workers, completed two human/AI exchanges and a scheduled draw, then restored Hard difficulty after reload. No runtime errors, horizontal overflow or production development hook were found. The levels are heuristic and unrated.

Source bundle: `Woodland-Chess-and-Checkmate-v0.3.zip`. New behavior and its implementation boundaries are documented in `docs/checkmate/OPPONENT-AND-DEALING.md`.

# v0.4 — Trading-card hand and support rows

Published 2026-10-27. Final Cloudflare version `f60ece3b-7f1b-4626-8d30-7fc86f18edbb`.

Original woodland trading-card faces now frame the existing illustrations, printed effects, cooldowns and creature statistics. The hand floats in a shallow fan. Tap or keyboard Enter opens the full reader. Dragging a hand card to its own support row or to the board explicitly installs it for one action. Ready support cards offer an effect/discard choice or an exhaust/order choice. Exhausted cards turn sideways; new installations remain upright and locked.

New games enforce three support slots per player, shown above and below the field. Legacy v0.1 matches retain five slots and resave with their immutable capacity; no cards are removed during migration. Classic remains unchanged.

Verification: **105 unit tests** and **38 browser tests** passed. Added real touch drag/tap, invalid/full/opposing/cancelled drop, bank flip, card reader, Order retention and effect discard checks. Hosted HTTPS testing confirmed a 280px reader with loaded artwork, a real drag install, a tapped Order card, six new-match slots, no horizontal overflow, no development hook and no runtime errors. A follow-up fast-tap regression passed after narrowing accidental-click suppression to the source hand card. Card artwork now preloads before the table becomes interactive.

Source bundle: `Woodland-Chess-and-Checkmate-v0.4.zip`. Interaction and migration details: `docs/checkmate/CARD-TABLE.md`. Physical Safari testing and a dedicated strict motion review remain optional follow-up checks.

## v0.4.1 — Card-top headroom

Published 2026-10-27, Cloudflare version `fce806b5-ac99-4366-ab11-74adb1407f31`. Reserved room above the hand for rotated card corners, outlines and the 10px hover lift. Unified the hand-card breakpoint with the phone/tablet layout and adjusted short portrait/landscape sizing. Confirmed every lifted card stays inside the fan at 1280×900, 390×844, 390×667, 667×844 and 844×390; the five card interaction browser tests and production build passed. Rules and starting army structure are unchanged.

## v0.5 — Reinforcement mode

Published 2026-10-27, Cloudflare version `74db8a1e-6da3-406b-96ef-27f6434f4073`. New Match now offers Full Army or Reinforcement. Reinforcement begins with kings at e1/e8 and fifteen reserve animal cards per side. Separate Animals and Effects hand tabs retain the original trading-card frame and inspection view. Drag an animal onto an empty home square, or read it and choose Deploy followed by a highlighted square. Deployment consumes the whole turn, uses no support card, and advances normal draws and cooldowns. Officers use the first two ranks; rats may use the first three. Invalid, cancelled, occupied and opposing drops spend nothing. The opponent can deploy reserves through the shared rules engine.

Replay format v0.3 records army mode; v0.1/v0.2 matches retain Full Army and their original support limits. Defeated animals cannot return as reserves. Classic chess is preserved. Verified production build, **111 unit tests**, **43 browser tests**, real emulated phone touch deployment, keyboard confirmation, reload/replay and desktop/phone/tablet/landscape layout inspection. Rules: `docs/checkmate/REINFORCEMENT.md`.

## v0.5.1 — Card-to-habitat deployment

Published 2026-10-27, Cloudflare version `110d3ffc-9057-4f4a-99e0-b6094e547621`. Deployment now runs a 1.6-second sequence: the played card travels from its actual hand or drag-release position, flattens toward the projected square and dissolves as the existing habitat atlas forms. The animal then appears on the ground, lands and settles using the original sprite poses. Ravens flap and fold their wings; hares have a small landing hop. Opponent deployments enter from their board edge. Flipped perspective uses the same projected coordinates and rear/front poses as normal movement.

Animation is presentation only: the legal action is committed and saved once. Resize, hidden-page, new-match and reduced-motion interruption clear the floating card and settle the final piece. Reduced motion places the piece immediately. Existing movement and attack sequences remain unchanged. Verification: production build, 115 unit tests and 47 browser tests passed; after the final raven folding refinement, all 23 relevant animation unit tests and four deployment browser tests passed again. Inspected intermediate desktop frames and phone/flipped placement.

## v0.6 — Pixel altar card table

Published 2026-10-27, Cloudflare version `224609bf-5b3a-4ce3-aedd-8239c3221923`. The support rows are now stepped, mossy pixel-stone altars with carved sockets and no outer border. Cards use flat colored frames, compact category runes, square corners and the existing woodland pixel illustrations. Expanded unit cards show readable HP/ATK/DEF.

Hover/focus enlarges a card in a nonmodal table panel; click/touch pins it. Ready supports offer only Order animal or Use effect. Orders infer movement versus attack from the selected destination. Target confirmation is an inline strip, leaving the board available. Escape, Close and outside press dismiss inspection and restore opponent progress. Dismissed hover cards remain closed under a stationary pointer until it moves away.

Installing an effect flies its card into the first free altar socket. Exhaustion turns it sideways. Using its effect lifts and consumes it with stepped pixel cuts; trails and distinct target cues show healing, shields, inspiration, damage, poison, vines, smoke, wood and equipment. Animation uses the already committed rules state and cannot spend an extra action. Resize, cancellation, visibility and reduced motion clean up flights and reveal landed cards. Unit deployment still morphs into habitat/animal, now preserving card proportions while flying.

Verified production build and **115 unit tests**. The full browser sweep passed all 52 checks other than a newly identified hover-dismissal issue; after fixing that issue, all 11 card/animation browser checks passed twice (22 repeated checks). Existing Classic, full-army, Reinforcement, AI, saves and movement/attack checks passed. Inspected desktop, small portrait phone and landscape layouts. See `docs/checkmate/CARD-TABLE.md` for interaction and compatibility details.

## v0.7 — Altar drag actions and projected stone altars

Published 2026-10-27, Cloudflare version `c643128f-1293-4578-92da-360c8364386b`. Ready altar cards can now be dragged onto a legal animal or square. Friendly drops offer Order / Effect only when both are legal; orders preselect the animal and await a move/attack destination, while effects retain the inline confirmation. Terrain and hostile effects request a casting animal when several sources are legal. Drops and choices spend nothing until confirmation; inactive, exhausted, opposing and invalid sources/targets cannot spend a turn. Touch support drags work in any direction, while hand gestures still allow horizontal scrolling. Post-drag clicks are intercepted before board hit handlers run.

The enlarged reader now uses hover intent while crossing neighboring cards toward its buttons, and locks its pending selection when pressed. It no longer replaces the intended card while the player approaches Play/Order/Effect. Tests reproduce both pinned and unpinned overlap paths.

Altars are larger and use projected top planes, carved sockets, side shading, thicker stepped masonry, moss and candles. Desktop/phone/landscape board sizing reserves room for both altar fronts. Verification: production build, **119 unit tests**, **62 browser tests**, unpinned hover-button regression, terrain source selection, invalid/inactive drops, real emulated touch after flipping, and desktop/phone layout inspection all passed. Rules and save/replay format are unchanged.

# v0.8 — Shrine wings, original-card enlargement and direct habitat orders

Published 2026-10-27. Cloudflare version `b784164c-30ed-4ece-867a-855492a89198`.

Desktop uses large vertical pixel-stone shrine wings around the centered board; tablet and phone use stacked horizontal shrines. The hand is centered below, with reserved height for card tops. New transparent generated artwork adds recessed sockets, moss, stone depth and candles. Cards remain live controls.

Hover/focus enlarges the actual original card node and preserves its hand footprint. Actions stay attached; no duplicate reader card is rendered. Pinning, Escape, keyboard focus, touch, and dragging the lifted original remain supported. Stationary pointers no longer reopen cards after table updates.

After selecting Order and an animal, drag its habitat onto a legal square to commit one move or attack without another confirmation. Invalid drops and cancellation spend nothing. The renderer keeps the animal at source during the drag, then preserves the established animal motion. Ranged units stay at source; nonlethal melee and lethal captures retain their rules. Click/keyboard targeting still offers the inline preview.

Verification: TypeScript and production build passed, **120 unit tests** and the **69-test browser suite** passed. Responsive layouts were inspected at phone portrait/landscape, tablet and desktop sizes. Hosted checks at 390×844 and 1440×900 loaded both shrine assets, preserved original-card identity, installed both players’ cards, then committed exactly one e2–e4 habitat order without a confirmation. Phone used real dispatched touch events. No runtime errors or horizontal overflow occurred. Phone testing used Chrome emulation, not a physical device.

# v0.9 — Board-first sizing and stable, drag-only card inspection

Published 2026-10-27. Cloudflare version `cf3b6817-597f-4a83-9633-0eaa42d741dc`.

Replaced the accumulated responsive overrides with one viewport budget. The board now uses 636px at the reported screenshot’s approximate 652×1004 CSS-pixel size, 374px at 390×844 and 708px at 1440×900. Removed narrow-layout 330/250px and desktop 600px caps. Compact support thumbnails and a shallow bottom-edge hand reserve play space; full card text appears during inspection. Portrait rails and landscape wings retain the woodland artwork.

Fixed the original-card hover loop: reparenting no longer closes inspection through pointerout. A 120ms dwell and source/reader corridor bounds keep one original card stable, with one entrance animation. Reader Play/Deploy/Order/Effect buttons were removed. Dragging performs play; the anchored Order/Effect chooser remains for genuinely ambiguous drops. Keyboard Space/E equivalents preserve non-pointer targeting and validate current-side ownership.

Verification: TypeScript and production build passed; all 120 unit tests passed. The 70-case browser run passed 68 cases; two portal-aware drag helpers were corrected, then all nine support-drag and all five reinforcement cases passed on rerun. The normal-motion stationary-hover case and seven viewport inspections passed. Manual mouse and real dispatched touch drags installed the intended card once. Screenshots and full details are in review/ and docs/checkmate/CARD-TABLE.md. Phone checks use Chrome emulation, not a physical iPhone.

Post-deploy verification passed at 390×844, 652×1004 and 1440×900: no horizontal overflow or runtime errors; shrine artwork loaded; original-card identity was preserved; a direct e2–e4 habitat order committed once without confirmation (touch on phone). Normal-motion hosted hover stayed open for 3.3 seconds with exactly one lift, one original node and zero reader action buttons; dragging that enlarged card installed its exact recorded ID once.

# v0.9.1 — Full-height altar sockets

Published 2026-10-28. Cloudflare version `ded082eb-e7e8-46c1-b257-d581b56e353c`.

Resting support cards now sit inside full-height inset stone sockets with padded wells, rather than overlapping a flattened strip. The existing shrine backdrop is proportionally cropped instead of stretched. Portrait rows reserve 128px, with a compact 112px variant for short portrait screens; the board budget includes the additional height. Wide and short landscape sockets use their existing side layout. Legacy five-slot saves scale faces into the same wells. Hover and drag code are unchanged.

Validation: production build passed. Five viewport geometry cases assert each resting card’s width and height fit inside its stone well; all nine support-drag cases also passed (14 browser checks total). Populated desktop, tablet, portrait and landscape layouts were visually inspected. Board dimensions remain 374px at 390×844 and 708px at 1440×900; 652×1004 reserves room for the taller altars and uses a 544px board.

# v0.9.2 — Numbered cooldown card backs

Published 2026-10-28. Cloudflare version `205cabe5-bcd7-49f9-bdfa-2caeeedd433f`.

Exhausted support cards flip face-down instead of rotating sideways. The existing woodland card-back artwork carries a large font-independent pixel numeral for the remaining own-turn starts until ready. Cards remain fitted upright in their sockets. Hover/keyboard/touch inspection reveals the original printed face; readiness restores its front. Locked new installations retain their front. Rules and replay state are unchanged.

Production build and all 120 unit tests passed. Eighteen browser cases were verified across card interactions, normal-motion effects, altar fitting and a new countdown/reload/inspection/readiness lifecycle case. An installation test helper now waits for the complete action to settle before sending the next keyboard action. Portrait and desktop appearance were inspected. Hosted verification confirmed the face-down back is visible after one direct habitat order.

# v0.9.3 — Original illustrated card holders

Published 2026-10-28. Cloudflare version `5312739f-54f9-456b-a2f7-00dd39da3282`.

Restored the complete mossy stone/candle shrine artwork at its natural proportions and removed the added CSS square frames. Upright cards now rest on the illustrated ledges and may project above their recesses. Horizontal holder height derives from image width; shorter portrait layouts use a narrower holder. Desktop side shrines also keep their proportions, with each card aligned to its own ledge. Cooldown backs/flips, inspection and drag interactions are preserved. Legacy five-card saves retain capacity.

Production build passed. Fifteen targeted browser cases passed: five responsive ledge-alignment/art-proportion cases, nine support-drag cases, and the full cooldown/reload/inspection/readiness lifecycle. Populated phone, tablet and desktop views were visually inspected. Hosted checks exercised the original holders with three installed cards and an exhausted numbered back.

# v0.10 — Reference-style cards and direct mist casting

Published 2026-10-28. Cloudflare version `66b6e570-e847-442e-97e4-21c45301e687`.

Restyled the actual live cards with colored beveled frames, tinted faces, larger pixel illustrations, serif titles/effects and round bronze cooldown medallions. The illustrated holders and numbered cooldown backs are preserved. Ready shrine cards now click to prepare an animal order and drag to directly cast their printed effect. A colored mist reaches from the anchored source card to the cursor/target, with legal target and caster/damage feedback. Valid release burns once and dissolves the card into its board effect; no ambiguity chooser or confirmation is needed. Invalid releases preserve the card and do not click the unit underneath. Keyboard targeting remains available.

Validation: production build and all 120 unit tests passed; the complete 80-case browser run passed. After visual refinements, 19 scoped interaction/effect cases passed, followed by four held-mouse/touch/visible-mist/anchored-source cases. The mist regression checks actual nontransparent canvas pixels, not only DOM presence. Desktop hosted verification confirmed click-order preparation spends no action and a valid effect drag commits one burn, removes its mist canvas and leaves the source position anchored. Phone touch verification and final appearance were also checked in an isolated browser context.

Final phone correction: a short release-focus guard prevents native touch focus from moving a ready shrine card into the reader before its click can prepare an order. Five held-pointer/visible-mist/anchored-source/phone-tap regressions passed after this correction; the complete phone touch install → tap-order → habitat move → mist-cast path passed with no horizontal overflow or runtime errors.

# v0.11 — Direct order pickup and pixel card details

Published 2026-10-28. Cloudflare version `f747170a-6d8f-4a94-a292-983e322d746d`.

Preparing a ready shrine card now allows immediate pickup of any living friendly habitat; no selection click/tap is required. The press chooses its source without rerendering, legal destinations update immediately, and prepared orders establish touch-action before the gesture begins. Invalid releases spend nothing and allow picking a different friendly unit. Existing click/keyboard targeting, attack choreography and rules remain.

Cooldown medallions moved to the printed face’s top-right, with an explanatory tooltip. Shrine miniatures use a compact inset pixel marker instead of an oversized round coin. Card frames now have stepped edges and restrained type-specific metal, leaf, rune and brass details. The visible instruction footer beneath enlarged cards is gone; a small external close control and screen-reader guidance remain. Short landscape inspection uses the card alone, without a controls sidebar. The Actions/Journal/Army match drawer stays optional.

Validation: production build and all 120 unit tests passed. Nine direct-input/combat cases and fifteen card/effect/cooldown/direct-pickup cases passed; the final two direct-pickup/reader-close cases passed after adding footer-height and touch-close assertions. Populated desktop, portrait phone and short landscape views were inspected, with no overflow. Hosted phone verification used immediate touch pickup followed by a legal move, mist casting and clean card inspection in an isolated browser context.

## v0.12 — Raised shrine cards and living base sockets

Published 2026-10-28. Worker version `21866df2-b7c2-420f-8736-3b787a2c7c34`.

Shrine cards stand taller with full two-line titles. Their miniature cooldown badge and back countdown move into circular stone sockets on the base. Category-colored pixel leaves dissolve into pixel countdown digits after a committed order, then reform when ready. Preparing/cancelling an order does not spend cooldown. Refresh/load does not replay the transition. Reduced-motion and the motion setting remain respected. Vertical holders reserve enough space to keep all three sockets visible; short landscape sockets sit beside each card's foot.

Validation: 120 unit tests, 15 focused browser checks, five repeated final layout/direct-grab checks, production build; phone/desktop/short-landscape visual inspection and normal-motion phone/desktop countdown verification.

## v0.13 — Board priority and forgiving card hover

Published 2026-10-28. Worker `09a9b6d9-e0e1-4ee1-af21-ce97199510dc`.

Removed card-reader X; Escape and outside press dismiss. Hover keeps a 10px edge buffer and bounded bridge to home, opens on a fixed 120ms dwell (pointer movement no longer restarts it), and closes after 180ms outside without indefinite directional retention. Shrine readers open beside vertical holders or inward from horizontal holders, leaving neighboring cards accessible. Starting another drag clears stale error overlays. Escape clears errors without replacing the original card when no selection needs resetting.

Compact portrait rails preserve taller two-line cards and base counters while prioritizing the board: 386px at 500×800, 374px at 390×844, 590px at 652×1004. Medium landscape uses narrow side holders. Validation: 120 unit tests, 21 integrated browser checks plus five direct-habitat/grab-order cases, production build and rendered phone/desktop review.

## v0.14 — Shorter shrine cards, cleaner interiors

Published 2026-10-28. Worker `423f6e48-ab7f-4280-b11b-d1f4ddb04c45`.

Portrait shrine cards shortened to70px; illustration fills the space beneath the two-line name with no empty nested lower panel. Rails114px reclaim24px for the board (410px at500×800;614px at652×1004). Phone390×844 board stays full374px. Desktop card height cap112px, holder wings176px. Ten focused browser checks and production build pass; visually reviewed portrait/phone/desktop.

## v0.15 — Hover to check unit health

Published 2026-10-28. Worker `3b9b94ec-6965-482d-8cb8-92b16750e5e1`.

Hover an occupied habitat for500ms to see its unit card. Current HP/maxHP is emphasized above the artwork alongside effective attack and defense. Tooltip follows square projection after flip, stays inside viewport, never intercepts pointer input, and cancels immediately on press/drag/leave or state changes. Keyboard square focus supports the same delay; touch keeps tap inspection. Verified five new unit-hover cases, seven existing card-hover/direct-grab cases, build and desktop/narrow visual inspection.

## v0.16 — Card-Powered Chess / Version B

Published 2026-10-29. Worker `96b5dea0-dd59-40d0-9dfc-9712b1bf98c6`.

Start B at `?mode=checkmate&rules=capture&new=1`. Adds instant chess-style captures, no combat numbers in unit cards/hover/ARIA or board bars, Guard/Piercing/control effects, and atomic Deploy-and-Drive installation. Hand card→altar prepares an order; dragging an animal commits installation + movement/capture as one turn, with new card exhausted. Both full-army and reinforcement supported. Kings are captured to win (not orthodox checkmate); last-rank rats promote automatically to Fox Queens. All animals capture by chess movement without remote ranged capture. Classic and HP rules remain available; old saves restore as HP, new saves record the combat rules.

Validation: 136 unit tests; 102 browser cases covered (100 passed in full run, then16/16 targeted passed including the two affected drag cases). New Capture browser cases test actual capture, Guard casting, atomic pending/cancel, phone touch, mode switching, stat-free unit inspection and persistence. Rendered1280/500/390 without overflow; actual worker opponent opening verified. Ten deterministic Capture self-play smoke games completed by king capture and replay-verified (not a balance verdict).

## v0.17 — Woodland encounters and fixed skirmish openings

Published 2026-10-29. Worker `19bd397c-9a85-4810-a585-88500922f8ab`.

Three introductory encounters are now the default new-game path: Break the Blockade (Piercing + guarded turtle), Rescue the King (Cleanse + exit), Hold the Crossing (one reserve rat + two Guards, three enemy replies). Each has fixed tools/positions, legal authored enemy replies, objective marking/progress, hints, round-level undo, restart, retry and next encounter. Objectives and progress are engine-authoritative, simulation-safe and replayed through v0.5 encounter saves. New skirmishes start with the standard formation immediately; the old manual placement/Auto-place phase remains only for legacy saved positions. Classic and HP comparison remain available.

Validation:142 unit tests pass;106 browser cases covered (105 passed in full run, remaining legacy Play Again fixture updated to choose Skirmish and passed targeted). Real-worker full encounter campaign completed; actual390px touch Blockade completed; all3 authored solutions replay-verified by engine tests;1280/500/390 picker/board/win views inspected with no overflow. Read-only architecture review found no release blockers. Towers/castles remain a proposed next terrain experiment, not implemented in this release.

## v0.18 — The Watchtower

Published 2026-10-29. Worker `417575d7-ec0b-4b13-a84e-f8246d368223`.

Fourth encounter at `?mode=checkmate&encounter=tower&new=1`: defeat the bound sentinel, then reach e5 within four actions. Two tested routes preserve the tower for a hare shot or sacrifice it with Trailbreaker to open the rook's file. Permanent walls block landing and sight; hares retain their ordinary L jumps. Towers allow landing but block traversal, and provide one stationary orthogonal/diagonal shot up to two squares, exhausting a ready support card and Rooting the shooter through its next turn. The explicit Fire control separates shots from ordinary captures. Guard/Piercing apply; a blocked shot still spends the tower. Pawn-only Trailbreaker permanently removes an unoccupied obstacle immediately ahead without moving the pawn. The card can be dragged onto pawn or obstacle.

Projected masonry has shaded top/side faces and moss; animal and habitat perch on the tower deck with interpolated elevation during movement. Tower rune dims after use; demolition produces rubble. Terrain descriptions are available on square labels and tower occupants' unit cards. v0.6 replay reconstructs tower state; earlier rulesets keep their existing save versions. Classic and HP modes are preserved. Castles, gates and other proposed obstacles remain future work.

Validation:151 unit tests and109 browser tests pass. Both four-action solutions completed against the authored worker opponent, including real390px touch; Fire Root timing, LOS blockers, malformed actions, tower reuse, demolition permanence, replay, reload and undo tested. Desktop1280 and phone390 rendered without horizontal overflow. Rules review caught and fixed pawn double-step traversal through an intermediate tower.

## v0.19 — Readable ownership and woodland scenery

Published 2026-10-29. Worker `7e195d5e-f579-4bfc-b686-fd00288fe6de`.

Shrines now carry persistent readable ownership plaques: Your cards / Opponent’s cards in AI games, Ivory / Charcoal in local play, with distinct gold/violet markers and a turn indicator. Plaques follow ownership after board flip and sit above the card names. Old full-army deployment saves finish remaining placements automatically on startup, preserve existing placements and replay history, and persist the completed formation so the obsolete manual placement panel does not recur.

Generated transparent pixel scenery replaces the small procedural wall/tower placeholders. The wall has thick blocked masonry, pillars, ivy, roots and rubble; the tower has a broad rooftop, doorway, rune and mossy ground. Both have approximately 1.1-tile footprints with small foliage spill, and are depth-ordered with animals. Tower occupants and nests sit on the rooftop; entry/exit interpolates the new height, shots begin at the roof, and spent towers dim. Procedural fallback remains for asset-load failures. No rules or deck changes.

Validation:151 unit tests and production build pass;23 focused browser cases pass across ownership, flip, legacy-save migration, shrine fit, direct combat, dragging and both Watchtower solutions. Ten ownership/tower/combat cases rerun after final rendering refinements. Desktop1280 and phone390 visually inspected without horizontal overflow or card-name obstruction.

## v0.20 — Explain special squares

Published 2026-10-30. Worker `a2c8ab51-0e87-446c-8ea1-9057f9e68416`.

Hover a goal, obstacle, terrain or trap square for500ms to read its purpose and rules. Encounter goal descriptions distinguish objectives from terrain bonuses; walls explain jump/demolition restrictions; towers distinguish available and spent shots; smoke/logs show removal timing; snares show ownership and triggers. Occupied special squares combine unit cards with field details. Keyboard focus uses the same dwell. Tapping an empty special square on a phone opens its explanation without a modal or game action. Moving off, pressing, dragging, Escape, blur, resize and state updates dismiss it. Tooltips remain pointer-transparent and within the viewport; native obstacle titles were replaced by the consistent delayed reader.

Validation:17 focused browser tests pass across new square-hover cases, existing unit hover/card hitboxes and both Watchtower routes, including390px real touch. Production build passes. Desktop1280 and phone390 tooltips visually inspected; no rules or save-schema changes.

## v0.21 — Physical card materials and a living board

Published 2026-10-30. Worker `cf76fceb-99ab-47ef-874c-eb4a55a28c7e`.

Added six generated nine-slice pixel frames: masonry terrain, riveted steel defense, woven cloth/walnut buffs, thorned root control, leafy recovery and paw-carved animal cards. Material semantics are separate from card color and card rules. Texture layers remain behind printed information; enlarged original cards reveal a wider sculpted rim without adding buttons or new hover nodes. Transparent frames are optimized to256px lossless WebP (about462KB total); the full source sheet is retained in art-sources/card-material-frames-v1.png.

Smoke cards have subtle art-window mist. Actual smoke terrain drifts within its projected square using a separate idle overlay loop. Board animals breathe in phased rest poses, turtle habitats ripple, rat/hare grass sways and a few motes drift on the rim. Existing atlas anatomy and facing remain intact. Board/terrain idle draw work is bounded to roughly12fps and pauses during actions, dragging, hidden/offscreen states, reduced motion, settings-off and teardown. Action and ambient overlay loops cannot run concurrently; effects remain presentation-only and do not alter state, replay or card timing. The setting is now labelled Animations & atmosphere. Live OS motion preference changes also resume both layers consistently.

Validation:155 unit tests pass;119 browser cases covered (118 passed in the full run; the remaining Watchtower reload test waited too early for its DEV inspection hook, corrected and passed in a10-case targeted rerun). New material/motion tests confirm assets and texture layers, state immutability while animating, static reduced-motion output, settings freeze and live preference resume. Main rendered desktop1280 and phone390 cards and scenes without overflow; normal-motion capture, drag, cooldown, reload and encounter flows were exercised. Read-only lifecycle audit found and prompted correction of the live motion-preference ordering edge case.

## v0.22 — One card frame

Published 2026-10-30. Worker `e560aaa6-998d-45f7-b9fd-87dd813fe511`.

Removed the old blue outer shell, its pseudo-background and inset decoration from material cards. The illustrated material border is now the single outer frame in hand, shrine and reader sizes. Keyboard focus has a separate dashed indicator only while focused. Card illustration windows and cooldown backs retain their own functional styling. Verified desktop/phone screenshots,10 focused material/hover/direct-grab browser checks and production build.

## v0.23 — Inset card paper

Published 2026-10-30. Worker `ab9fe60d-885f-40a3-ae2f-36565615ee67`.

Moved the paper fill from the full rectangular frame box onto an inset layer behind the illustrated border. Transparent outer corners no longer show a white paper outline. One material-rim variable now drives both border-image width and paper inset across hand, shrine, unit tooltip and enlarged reader sizes. Verified desktop/phone render,8 material/hover browser tests and build; no game-rule changes.

## v0.24 — Objects on the altar

Published 2026-10-30. Worker `a5721159-6d10-4051-9509-77ed77687a5a`.

Installed supports now show their transparent illustrated object on the stone ledge: shield, banner, herbs, smoke pot and the other card illustrations. The complete original card is still used in hand and when hovering/inspecting; no duplicate reader card or new action button was introduced. Source button geometry, accessible names, ownership and pointer capture are preserved. Per-illustration transparent bottom padding aligns objects to the ledge. Cooldown objects remain visible but dim, with the counter on the altar base; the old back-flip is replaced by a short object settle and a ready glint. Casting dissolves the object into the existing mist trail. Installation retains its full card flight, resolving into the altar object at landing.

Validation:155 unit tests and build pass. Six relic/cooldown/medallion cases pass, plus19 support-drag/hover/altar-fit checks across five screen sizes. Fourteen effect-motion/material/Watchtower cases passed before the old title-visibility fixture was updated to the new object design; the affected medallion suite then passed. Desktop1280 and phone390 inspected for object grounding and viewport fit. Rules, deck composition and replay schema are unchanged.

## v0.25 — Encounter checklist

Published 2026-10-30. Worker `7eef6d2f-cef4-4ab3-930e-6d62b112175e`.

Encounters now have a compact quest checklist with explicit goals, current/next step styling, automatic completion ticks, action budget or enemy-turn survival progress, and a direct Hint link. Goals are derived from actual engine state, not mandatory solution sequences: the Watchtower accepts either tower route, and Blockade does not insist on a particular Guard strategy. Undo, reload, failure and victory project the matching checklist state. Wide desktops place the note beside the board; tall narrow phones reserve a small top region; shorter/medium views start with an expandable current-task summary. Opening or closing the note does not spend an action. Skirmish and Classic retain their existing status UI.

Validation:159 unit tests pass, including four new pure projection cases;9 encounter/checklist/Watchtower browser cases pass. Real actions advance and undo the two-step tower checklist; keyboard expansion and Hint access checked;390×844,500×800 and844×390 inspected for layout/overflow. The tall phone checklist does not overlap the opponent altar label. Production build passes; no game rules or save schema changed.

## v0.26 — Flowing spell mist

Published 2026-10-30. Worker `70818696-6502-4caf-a797-896f5c69a513`.

Dragging a ready altar object now evaporates its artwork into broad, flowing blue-violet mist. Layered curved streams, soft stepped puffs and sparks connect the altar to the cursor. On a valid release the stream gathers at the target over550ms, then surrounds the animal for450ms; the board reveals the effect at arrival. The already dissolved object does not flash back into view. Keyboard casts dissolve in place before the same arrival sequence. Invalid drops and Escape retract the mist and restore the source without spending a turn. Pointer hitboxes remain stable and the effect canvas is pointer-transparent. Hidden-page, resize, cancellation and teardown clear animation ownership; reduced motion and disabled animation use immediate/static feedback. No rules, cooldowns, deck or replay changes.

Validation:159 unit tests and production build pass. Full128-case browser run passed127 cases; an isolated Classic en-passant case failed during live source editing, then passed with all25 Classic and mist cases in a clean rerun. Five dedicated mist cases cover moving particles, source-to-cursor coverage, one committed burn, return/cancel and390px normal/reduced-motion touch. Desktop and phone rendered screenshots inspected. Published desktop and phone casts checked for arrival, surrounding mist, cleanup, one burn and no overflow or browser errors.

## v0.27 — Grey stone courtyard and living square habitats

Published 2026-10-30. Worker `185d97e4-3c48-413e-acff-e77139674e6f`.

Replaced cream/teal squares with projected pale-grey limestone and charcoal stone paving, preserving the original warm rim and deep mossy masonry base. Original animated animals now occupy full-square pond, roots, meadow, savanna, autumn leaves and earthy ground. A cached pixel alpha fringe blends terrain into paving while leaving square identity visible. Existing habitat-first movement, dragging, capture crowding and deployment operate on the new ground layer. Tower occupants retain a compact rooftop nest. Selection/focus paints above static habitats. New frontal wall/tower art follows board rows and has a1.25-tile visual footprint with small rubble/ivy spill; rules and hitboxes remain one square. Authored tower roof aligns with the existing animal/shot baseline, guarded by an invariant test. Optional art failures retain procedural fallback; cached textures avoid repeated ground painting during ambient redraws.

Validation: production build and160 unit tests pass. All43 focused browser checks pass across new courtyard rendering, neutral light/dark surface samples, occupied colored terrain,64 polygons, board flip, desktop/390px fit, direct movement/combat, full-motion spells, both Watchtower routes, reload/undo, Classic special moves and AI difficulties. Desktop/phone board and occupied tower screenshots visually inspected. Published Watchtower route completed at1280 and390 with no overflow or browser errors. Original animal atlases, game rules, decks and save/replay schema preserved.

## v0.28 — Restore dimensional scenery

Published 2026-10-30. Worker `0255fe63-7e8b-4c0b-bd22-0f7a31c75cfe`.

Restored the earlier wall and tower artwork and exact original footprint, anchors and roof elevation. Full-square habitats now composite cached contact shadows and shallow ragged side faces underneath their top texture, then overlay the original dimensional pond stones, roots, soil and grass at92% size. Bottom anchoring preserves existing animal foot positions and animations. Grey courtyard, square terrain identity, movement-first ground choreography and roof nests remain. Updated scenery anchor invariant and vacated-square regression.

Validation: production build and160 unit tests pass;12 focused courtyard, drag, combat and Watchtower browser checks pass, including both phone touch solutions and board flipping. Desktop and390px rendered views inspected. Live Watchtower route completed at1280/390 with no browser errors or overflow. No engine, deck or replay changes.

## v0.29 — Larger structures with complete foundations

Published 2026-10-30. Worker `684d516c-3fa4-4602-942b-38d536b8e830`.

Enlarged the existing wall/tower artwork by roughly16%, preserving the restored designs. Full-square projected stone-and-moss foundations and broken approach paving connect the original illustrated ground to every edge of the occupied field. Foundations render below highlights and animals. Tower roof elevation scales with the authored art, keeping animal feet, nests, movement and shots aligned. Visual spill does not change one-square collision or selection.

Validation: production build and160 unit tests pass;5 courtyard/Watchtower browser checks pass, including both desktop and390px touch solutions, flip, reload and demolition. Desktop/phone imagery inspected. Published tower route completed on both sizes without browser errors or overflow.

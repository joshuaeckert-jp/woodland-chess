# Project Checkmate — development GDD v0.1

Based on Joshua's supplied Game Design Document v0.1. This is its implementation companion and decision register, not a replacement of the original vision. The exact playable rules are in [RULES-v0.1.md](RULES-v0.1.md); design and complete motion targets are in [DESIGN-ANIMATION-SPEC.md](DESIGN-ANIMATION-SPEC.md).

## Vision and protected principles

Browser-first, two-player tactical chess/card/RPG game on an 8×8 board. Sixteen maximum units per side with traditional role limits. A mandatory King has HP. Deterministic damage replaces automatic capture. Recognizable chess geometry, meaningful melee/ranged differences, persistent health, fair explanations and positional skill remain the foundation.

The central loop is **one card, two competing uses**: install a tactical card as a persistent resource, then on a later turn either exhaust it for one unit order or burn it for its printed effect and discard it. Every placement, move, attack and special effect competes for the same single action per turn. There are no free movement actions stapled onto card plays.

Classic Woodland Chess remains independently playable. Its AI, special moves, ordinary victory rules, save key and PGN history do not use the Checkmate reducer.

## Rules architecture

The TypeScript reducer is independent of the interface and animation. It validates deployment, geometry and obstruction; computes effective combat stats and legal target previews; resolves one command, resource cost, triggers and turn switch; records a deterministic command log; and evaluates King defeat and draws. JSON-like content definitions supply twelve unit variants and twelve tactical effects. Persistence stores seed, rosters, commands and local opponent settings with a ruleset version, then reconstructs via validation. A shared `simulateLegalAction` transition applies the same legal action semantics in AI search nodes without command-history cloning.

The UI never invents attack landing, damage or cooldown. Canvas sprite animation consumes reducer events. The local Woodland AI runs in a browser Web Worker and selects legal deployment or one legal battle action using bounded deterministic search at Easy, Normal and Hard. It is not a server, Stockfish integration, rating system or claim of optimal minimax play. This leaves a path to server-authoritative WebSocket matches and replay clients, but neither is claimed by the local prototype.

## Army and battlefield

Each role offers two initial variants. Lion Kings differ in durability/attack. Fox Queens offer melee/ranged. Turtle Rooks offer guardian/siege. Raven Bishops offer melee flight/ranged diagonal bolts. Hare Knights trade HP for attack. Rat Pawns trade HP for tail-strike power. Starter armies include both variants where role counts permit. Initial stats are scaled to single-digit HP for legibility; the GDD's 50-HP examples remain illustrative, not a required balance scale.

Layer units, persistent terrain, ground traps and unit statuses separately. Keep one unit and one terrain per square. Show public stats and cooldowns. Flexible home-zone deployment creates formations; mid-match reinforcement is a separate future mode.

## Prototype decision register

All entries below are provisional experiments unless explicitly marked as a protected principle above.

| GDD open question | v0.1 implementation choice | What testing must establish |
|---|---|---|
| 1. Deployment timing | Alternate full pre-battle armies, King first; no battle deployment. | Whether openings become excessively defensive or slow. |
| 2. Supports in play | Three per side. | Whether the cap preserves cooldown pressure without wasting turns. |
| 3. Card location | Separate support row; terrain/traps project onto board squares. | Phone readability and targeting clarity. |
| 4. New cards | Five-card mirrored opening: balanced default (`banner`, `brace`, `smoke`, `field-dressing`, `aimed-shot`), exactly-five custom selection, or seeded shuffle; Install costs a turn and is unavailable until next own turn. Draw free on own turns 3, 6, 9, etc. | Whether the opening choice, setup time and draw cadence create meaningful decisions without downtime. |
| 5. Activation exceptions | Every ordinary Move/Attack requires a ready installed support. | Whether board tempo remains engaging. |
| 6. Recovery | Only at total resource depletion, create one non-burnable Reserve Order; otherwise Forced Rest only with no legal action. | Resource safety without making normal cards disposable for free. |
| 7. Cooldown length | Skip c complete future owner turns; ready on T+c+1. | Exact timing understandable and tactically relevant. |
| 8. Different cooldowns | Three tiers: 1, 2, 3. | Whether strong effects actually justify slower reusable cards. |
| 9. Surviving jumping target | Knight/Pawn return/stay at origin; sliders stop immediately before target. | Whether the attack feels fair and legible. |
| 10. Hybrid characters | No hybrids; combat style fixed per variant. | Balance melee and ranged before combining them. |
| 11. Friendly ranged blockers | Yes, units block line of sight. Smoke blocks endpoints too. | Whether protecting firing lanes provides enough positional cost. |
| 12. Defensive effects | Guard is Burn-triggered temporary DEF; one automatic Guardian passive. | Whether tank/healing loops stall King pressure. |
| 13. Chess special moves | No castling/EP; Veteran Pawn upgrade retains role. Classic unchanged. | Whether a dedicated castle card is worth its complexity. |
| 14. Trigger order | Direct action → defeat/landing → trap/promotion → owner poison/expiry → switch/start expiry/draw → draws. | Replay consistency and clear edge cases. |
| 15. Draw/anti-stall | Full logical-state threefold; 100 actions without irreversible progress. | Actual frequency and false-positive frustration. |
| 16. Deck size | Twelve distinct mirrored cards; mirrored hand five; draw each third own turn; no reshuffle. | Burn pressure, draw pace and repeatability. |
| Hidden deployment | Open alternating deployment, familiar auto-place convenience. | Whether hidden reveal is useful after core balance. |
| Equipment/drop rules | One weapon, one armor; direct equip via Burn; destroyed on defeat. | Whether ground loot adds enough to justify another interaction. |
| Hidden information | Public hands, ordered decks and traps for testing. | Introduce concealed information only after deterministic core is understood. |
| Full armies | Require exactly sixteen units per side in this version. | Test optional small armies separately, with limits intact. |

## Playtest questions and measurements

The scarce resource is turn tempo, not a second mana system. A fifth support has an installation cost and may have diminishing value because only one card can be used per turn. Compare the opportunity cost of Install, Order and Burn with real match logs. Do not assume “more supports means more actions per turn”; it means fewer forced pauses and more tactical choices.

Track first-player win rate across mirrored seeds/armies, support count over time, forced rest rate, card-burn rate, source of King damage, melee/ranged damage and territory gain, healing-to-damage ratio, and decisive turns. Watch for ranges that make firing superior to territorial advance; control cards that remove all meaningful responses; card depletion that makes late play tedious; and formations that create unavoidable opening damage.

The GDD target is two to three comparable hits and 20–40-minute matches. These are goals requiring observed games, not proven outcomes. No collection power, card rarity bonuses, critical-hit randomness or monetization rules are introduced by the prototype.

## Delivery stages

| Stage | Current delivery | Further work |
|---|---|---|
| 1. Deterministic combat | Deployment, geometry, melee/ranged HP combat, King defeat. | Broad strategy playtests, stat tuning. |
| 2. Card activation | Install, Order, Burn, cooldown, mirrored opening hand, draw and recovery; local three-level AI. | Controlled support/cooldown experiments and playtesting. |
| 3. Terrain/equipment | Smoke, Log, public Snare, four statuses, direct weapon/armor. | Additional ground effects, dropped items and explicit interaction cards. |
| 4. Diversity | Two variants per role and fixed starter tactical deck. | Deck editor, more characters, draft, bespoke variant art/accessories. |
| 5. Online competition | Deterministic replay foundations only. | Server validation, transport, lobby/matchmaking, reconnect, clocks, ranking. |
| 6. Content/polish | Reused rich species/habitats, card/terrain art, basic battle feedback. | Full motion production matrix, tutorial, dedicated ranged/recoil poses and sound design. |

Future modes remain Standard Competitive, Reinforcement, Draft, Territory and Casual Chaos. The current local prototype exercises the Standard rules loop; it does not claim to ship all five modes.

## Prototype success gate

A playable prototype must allow legal army construction/deployment, reject illegal orders, preserve HP and exact melee/ranged locations, enforce every card lifecycle transition, switch once per committed action, avoid permanent resource deadlock, show deterministic previews, finish on King defeat/draw and reconstruct its state from the initial seed and action history. Preserve the normal chess regression suite alongside these checks. Browser layout, touch, keyboard and reduced motion require rendered verification in addition to reducer tests.


Trading-card table update: new matches have three support slots per player in rows above and below the board. Saved v0.1 matches retain five slots to preserve their replay and resources. The resolved immutable `supportLimit` is saved by ruleset v0.2. Cards use the existing original woodland illustrations with a native trading-card frame. Tap a card for its full readable effect or unit statistics. Drag a hand card to its own support row (or the board, explicitly installing it in support) to spend one Install action. Opposing/full/invalid/cancelled drops spend nothing. A ready installed card offers Exhaust to move/attack, retaining the card in cooldown, or Use effect, permanently discarding it. New installations are locked upright; spent cooldown cards turn sideways. Pointer/touch/keyboard controls and reduced motion are supported; classic chess is unchanged.

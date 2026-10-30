# Project Checkmate — playable rules v0.1

Experimental local ruleset `project-checkmate-0.2`. A match may be local two-player or one human against the local Woodland AI at Easy, Normal or Hard. The AI follows the same legal deployment and one-action battle rules and has no extra cards, statistics or actions. Its browser Web Worker uses bounded deterministic search; the levels are unrated, are not Stockfish and do not claim optimal play. These choices resolve open questions for playtesting; they are not claims of competitive balance. Classic chess remains a separate mode with its own saved game and normal chess rules.

## The match

Build two full 16-unit armies: 1 King, 1 Queen, 2 Rooks, 2 Bishops, 2 Knights, 8 Pawns. Choose either supplied variant for each slot. Choose the human side when playing the AI. Both sides receive the same seeded tactical-card order. Odd seeds give Ivory initiative, even seeds Charcoal. This is reproducible setup, not random combat.

Deployment alternates, with each side's King first. Officers and Kings deploy in their own first two ranks; Pawns may deploy in their own first three ranks. One unit per square. Auto-place completes legal deployment using mirrored familiar chess squares where available. Deployment is a separate phase; units cannot be reinforced during battle in this prototype.

Reduce the enemy King's HP to zero to win. There is no check, checkmate, pinned-piece legality, castling or en passant in Checkmate. Classic retains all of those rules. An exposed King is a tactical risk, not an illegal move.

## Exactly one action

A battle turn has exactly one committed action. Selection, inspection and confirmation previews are free UI steps. Each of these costs the entire turn:

| Action | Cost and result |
|---|---|
| Install | Move one hand card into an empty support slot. Maximum three support cards. It cannot be used until your next turn. |
| Order move | Exhaust one ready installed card, then move one unit. |
| Order attack | Exhaust one ready installed card, then attack once. Melee approach belongs to this attack, not an additional move. |
| Burn | Resolve one ready installed card's printed ability, then permanently discard that card. Hand cards cannot Burn. |
| Recover | Only with no cards in hand, deck or support: create one permanent, non-burnable Reserve Order, available next turn. Once per player. |
| Forced rest | Available only if no other legal action exists. Advance the turn so cooldowns and timed effects can resolve. |

More support cards provide more choices and a larger buffer against cooldowns; they never grant extra actions in a turn. The tradeoff is time spent installing them versus immediate board pressure.

A card with cooldown **c**, exhausted on your turn **T**, becomes ready on **T + c + 1**. Cooldown 2 skips your next two turns and is ready on the third. A freshly installed card is also unavailable until the next own turn. Burn is unavailable during either lock.

Each deck contains 12 distinct cards; starting hand five. The opening can use the mirrored balanced default (`banner`, `brace`, `smoke`, `field-dressing`, `aimed-shot`), exactly five unique chosen known cards, or a seeded shuffle. The same opening selection is applied to both sides; the seeded remainder preserves a reproducible deck order. Draw one automatically at the start of own turns 3, 6, 9, etc. Drawing does not consume another action. The interface exposes deck remaining, a new-card marker and an announcement for a draw. No mana, reshuffle or fatigue damage. Hands and ordered decks are public for the prototype, so testers can attribute outcomes to decisions. Concealed traps are postponed.

## Movement, attacks and damage

Movement follows the underlying chess role. Sliding units cannot pass units or Fallen Logs. Hares jump in an L. Pawns move one forward; an unmoved Pawn on its usual second rank may move two if both squares are clear. Smoke is passable. Pawns attack one forward diagonal; movement never automatically attacks.

Damage is deterministic: **max(1, effective ATK − effective DEF)**. No retaliation or random criticals. Equipment, active statuses and passives are included in the preview. Health persists between turns. Defeat removes the unit, statuses and equipment.

- **Melee lethal:** defeat the target, then occupy its square.
- **Melee nonlethal, slider:** defender stays; attacker ends at the last empty square immediately before it along the legal path. Adjacent attackers remain at origin.
- **Melee nonlethal, Knight or Pawn:** attacker stays at origin. The animation returns it there; two units never share a final square.
- **Ranged:** source and habitat stay at origin, including on a kill. Limited by printed range, role geometry and line of sight. Units, Smoke and Logs block sight; Smoke on source or target also blocks. No shooting through allies.
- **Rooted:** prevents a Move order. Attack orders remain possible, including their defined melee approach.

On reaching the last rank, a Pawn becomes a **Veteran** once: +1 maximum HP, current HP, ATK and DEF, with one-square movement/attack in any direction. It remains a Pawn slot. It never becomes a new Queen and never upgrades twice.

## Cards

Every ordinary card may instead be exhausted for one Move or Attack order. The cooldown below applies only to that reusable path. Burning discards the card rather than starting a cooldown.

| Card | CD | Burn ability |
|---|---:|---|
| Rallying Banner | 1 | Friendly unit gains +1 ATK for its next attack; expires after its next own turn if unused. |
| Iron Shield | 1 | Friendly unit gains +1 DEF through the end of its next own turn. |
| Smoke Pot | 1 | Passable Smoke blocks ranged line of sight. |
| Spring Water | 2 | Heal a damaged friendly unit by 2, capped at maximum HP. |
| Aimed Shot | 2 | Deal 1 damage ignoring DEF to a legal enemy target. |
| Tangle Vines | 2 | Root an enemy through the end of its next own turn. |
| Bramble Snare | 2 | Public ground trap roots an enemy that ends movement here, then disappears. |
| Purifying Herbs | 2 | Remove Poison and Rooted from a friendly unit and heal 1. |
| Venom Dart | 3 | Poison: 1 damage at the end of the target owner's next two turns. |
| Fallen Log | 3 | Impassable terrain blocks movement and line of sight; Knights can jump over it. |
| Weapon Cache | 3 | Equip a friendly unit's empty weapon slot for permanent +1 ATK. |
| Armor Cache | 3 | Equip a friendly unit's empty armor slot for permanent +1 DEF. |

Friendly effects target any eligible living friendly unit. Healing at full HP is not a legal target; Purifying Herbs may still cure a full-HP afflicted unit. Duplicate active buffs/poison/root cannot be stacked by reapplying the same status.

Hostile card effects require a selected friendly source and an enemy on a clear rank, file or diagonal within three squares. Terrain and Snare placement require an empty unit square within Chebyshev distance two of a friendly source. Terrain uses one layer and Snare another; Smoke may coexist with a Snare, a Log may not. One persistent terrain and one ground item per square. There are no additional ground equipment pickups in v0.1; the caches equip directly.

Smoke and Log expire at the start of their creator's next own turn, after the opponent has had one action. Snares persist until triggered. Equipment has no duration, cannot stack within its one weapon/one armor slot, and is destroyed with its owner.

## Trigger order

1. Validate the entire action against the current authoritative state.
2. Resolve the chosen action and resource cost; deal direct attack/effect damage.
3. Remove defeated units. A directly defeated enemy King ends the match immediately.
4. Apply any movement landing, then Snare entry and Veteran promotion.
5. At end of the acting owner's turn, apply all of that owner's poison ticks; resolve all affected units even if its King dies. Remove expired statuses.
6. If the match continues, switch owner, advance its own-turn counter, expire its terrain and draw if due.
7. Record the full-state repetition signature and evaluate draws.

A poison tick bypasses DEF. Poison intensity is one with two ticks; it never multiplies by repeated application. Temporary shield/inspiration/root expire at the end of the affected owner's next turn. Guardian Stance gives the melee turtle +1 DEF adjacent to its living King. Reef Siege ignores one DEF on attacks from distance three or four.

## Draws, saves and visibility

Three repeated complete logical states draw, including HP, statuses, equipment, card readiness, card zones, deck order, terrain/items and draw-cycle timing. Absolute clock counters and action-log text are excluded. A second limit draws after 100 actions without irreversible progress; HP changes, pawn forward progress, draws and card/resource changes reset it. Traditional stalemate and insufficient-material draws do not apply.

Autosaves are separate from classic and stay in this browser. The Checkmate session retains local/AI mode, human side, difficulty and optional opening-hand choice; older seeded saves restore as local two-player. Export is a versioned seed, roster, optional exact opening selection and validated command log. Replaying it reconstructs the state; arbitrary serialized board snapshots are not trusted. In an AI game Undo removes the human command and the following AI reply together. Online play, cloud saves and ranked matchmaking remain future work.

## What to measure before changing these rules

Record total actions, match duration, first-player wins, number of active supports, rest turns, cards burned and why, number of attacks to defeat comparable units, and King-death turn. Target two to three comparable hits and roughly 20–40 minutes, then test those targets rather than calling these initial values balanced. Compare 3/4/5 support slots and cooldown schedules as separate controlled variants. Do not add random criticals to solve an economy problem.


Trading-card table update: new matches have three support slots per player in rows above and below the board. Saved v0.1 matches retain five slots to preserve their replay and resources. The resolved immutable `supportLimit` is saved by ruleset v0.2. Cards use the existing original woodland illustrations with a native trading-card frame. Tap a card for its full readable effect or unit statistics. Drag a hand card to its own support row (or the board, explicitly installing it in support) to spend one Install action. Opposing/full/invalid/cancelled drops spend nothing. A ready installed card offers Exhaust to move/attack, retaining the card in cooldown, or Use effect, permanently discarding it. New installations are locked upright; spent cooldown cards turn sideways. Pointer/touch/keyboard controls and reduced motion are supported; classic chess is unchanged.

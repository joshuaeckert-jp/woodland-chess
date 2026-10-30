# Woodland opponent and hand dealing

Released with the Checkmate v0.3 update. Classic chess keeps its original engine and four settings.

## Playing the opponent

Choose **Play the woodland** in New Game, choose your side and Easy, Normal or Hard. The opponent places one legal unit during alternating deployment, then commits one ordinary legal battle action per turn. Auto-place may complete both formations for a quick match. Its stats, cards, draw cadence and action allowance are identical to the human's. Public hands/decks/traps are visible to both.

| Level | Maximum completed search | Beam widths | Node allowance | Search deadline |
|---|---|---|---:|---:|
| Easy | One action ahead; seeded variety among top evaluated choices | 32 | 32 | 100 ms |
| Normal | Two actions ahead | 20 / 10 | 260 | 400 ms |
| Hard | Three actions ahead | 16 / 8 / 4 | 900 | 1,200 ms |

Search runs in a browser module Web Worker. It returns the best completed depth if time or nodes run out. A 2.5-second client timeout terminates it and selects a deterministic legal fallback. These are unrated heuristic levels, not a promise of optimal play or a chess Elo.

The evaluation weighs King health/survival most heavily, then other unit health/stats, position and reusable support readiness. Candidate selection removes redundant card/source variants and reserves physical movement candidates so numerous terrain targets do not fill the whole search. Immediate lethal King attacks are recognized directly. Root safety is checked against legal opponent actions after the actual resulting transition, including cooldowns, terrain, poison and draws. Beam pruning can still miss longer tactics; further tuning should use human matches and AI-versus-AI logs.

`simulateLegalAction` shares the real reducer transition. It assumes a previously enumerated legal action and skips history copying/revalidation while retaining rule triggers, repetition and victory. Real UI commits always use `applyAction` and validate again. Search never writes the actual match.

Undo, New Game, menu pause, page hide and mode changes cancel old requests. The client terminates workers and rejects stale replies. Reload resumes the saved AI side/difficulty and the correct next turn. In AI mode Undo removes the last human decision and its reply together. No server search or additional service is needed.

## Opening hand

The twelve-card tactical deck contains each starter card once. Deal five into the hand and leave seven in the draw pile. Setup offers:

- **Balanced five:** Rallying Banner, Iron Shield, Smoke Pot, Spring Water and Aimed Shot. This includes three cooldown-1 supports.
- **Choose five:** select exactly five distinct cards from the twelve. The interface counts and validates the selection.
- **Shuffled five:** use the reproducible seeded shuffle. Shuffle a new deal changes the seed and previews its five cards.

Both sides receive the same opening definitions for fair testing. Their physical card IDs remain distinct. The selected opening is stored exactly; the remaining seven preserve their seeded relative order. Older saves retain their original shuffled opening and restore as local two-player games.

## Draw timing

One card draws automatically at the start of each owner's turns **3, 6, 9…**, until the deck is empty. This adds no command or action and never plays/installs the drawn card. The deck panel shows cards remaining, hand/discard counts and turns until the next draw. A newly drawn card receives a New label and an announcement. Replaying/reloading does not draw again.

No mana, reshuffle, fatigue or paid random packs are introduced. Installing, ordering and burning still compete for the one battle action. The existing Reserve Order recovery protects total resource depletion.

## Verification

Unit coverage includes all opening/deck partitions, invalid selections, periodic/empty-deck draws, legacy/session replay, transition equivalence, legal AI choices, actual lethal threats with enemy activation cards, last-support decisions, search budgets and worker failure/cancellation. Browser coverage exercises all three levels, both sides, custom hands, draws, undo, pending-turn reload and restart cancellation, alongside classic regressions. Phone checks use Chrome viewport emulation; physical Safari testing is still useful.


Trading-card table update: new matches have three support slots per player in rows above and below the board. Saved v0.1 matches retain five slots to preserve their replay and resources. The resolved immutable `supportLimit` is saved by ruleset v0.2. Cards use the existing original woodland illustrations with a native trading-card frame. Tap a card for its full readable effect or unit statistics. Drag a hand card to its own support row (or the board, explicitly installing it in support) to spend one Install action. Opposing/full/invalid/cancelled drops spend nothing. A ready installed card offers Exhaust to move/attack, retaining the card in cooldown, or Use effect, permanently discarding it. New installations are locked upright; spent cooldown cards turn sideways. Pointer/touch/keyboard controls and reduced motion are supported; classic chess is unchanged.

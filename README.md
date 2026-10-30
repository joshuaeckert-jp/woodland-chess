# Woodland Chess

Woodland Chess is a phone-first dimensional pixel game. Classic chess keeps the board-only interface and four AI settings. Project Checkmate adds card-powered movement and captures, reinforcement draws, authored encounters, obstacles and a browser AI opponent. The earlier experimental HP-combat ruleset is also retained. Saves are separate and stay on this device.

The current visual build uses a grey stone courtyard, full-square animal habitats, animated woodland pieces, three-slot card altars and magical effect targeting. See [RELEASE.md](RELEASE.md) for the latest behavior and [DESIGN.md](DESIGN.md) for the rendering conventions; older prototype descriptions below document the retained HP mode.

## Repository contents

- `src/`: browser interface, deterministic rules, AI workers and canvas rendering.
- `public/`: all assets required to run and deploy the game.
- `art-sources/`: original artwork, generation notes and source atlases.
- `tests/` and `e2e/`: rules and browser interaction tests.
- `scripts/` and `docs/`: development tools and game design notes.

Generated review screenshots, dependencies, build output and local Cloudflare state are excluded from Git. No environment file is required to run the game locally.

Play [Classic chess](https://woodland-chess.jo-eckert96.workers.dev/) or [Project Checkmate](https://woodland-chess.jo-eckert96.workers.dev/?mode=checkmate). The classic New game dialog also offers the new ruleset.

## Run it

```sh
npm ci
npm run dev
```

Build and run unit tests:

```sh
npm run build
npm test
```

For browser end-to-end tests, start `npm run dev` in one terminal, then run the following in another. The Playwright configuration uses the local Chrome channel, so Chrome must be installed locally.

```sh
npm run test:e2e
```

`deno.json` provides optional Deno task wrappers for development, build, preview, and tests. Deno was not verified in this project and is not a backend requirement. Node.js and npm are sufficient; PHP, Lua, and Docker are not needed.

## Deploy to Cloudflare

The app is a Cloudflare static-assets deployment with no backend, secrets, bindings, or resources to configure.

```sh
npm run deploy
```

Deployment uses the authenticated Cloudflare account and the existing `woodland-chess` Worker. The current game is published at the links above. No PHP, Docker, database or dedicated server is required for these local modes.

## Classic chess

The board is the entire play surface; the burger menu holds controls, the move journal, save/export, and the New game flow. New game opens a styled modal where you choose AI or local two-player, AI difficulty, and Ivory & gold or Charcoal & silver.

- `chess.js` validates legal chess. Castling, en passant, all four promotion choices, checkmate, stalemate, and standard draws are supported.
- `js-chess-engine` runs the opponent: easy is random, normal searches level 1, hard level 2, and expert level 3. The highest visible label is **Challenging**. These are not rated or Elo-based levels.
- New game, undo, flip board, PGN export, and game history are available. History and preferences are saved in browser `localStorage` only, not cloud-synced.
- Optional synthesized move/attack/win audio is off by default.
- A finished game shows the winner celebration and offers Play again or View board.

Movement is habitat-first: the habitat travels, the animal rises and turns, the species follows, then it settles. Captures stage both habitats in the destination cell before the defeated habitat is reclaimed. Rear resting poses reflect a flipped board.

Each species sheet has 40 frames per species (20 per team), laid out in four columns by ten rows with 192 px cells. Six species and twelve alpha-transparent natural habitats make the board. `art-sources/` contains the full generated PNG source set, including anatomy repairs and generation prompts. The resulting art is 2.5D pixel art, not 3D models.

The first asset load needs a network connection. There is no service worker, so do not assume full offline play after a reload. See [third-party notices](public/credits.txt).

Runtime artwork uses lossless WebP, verified RGBA-identical to the packed PNGs. Original and packed PNG artwork remains in `art-sources/`; it is deliberately excluded from the static production build. The app has no external fonts or audio downloads.

## Project Checkmate prototype

Open `/?mode=checkmate`, choose local two-player or the Woodland AI, select the human side and (for AI) Easy, Normal or Hard, then build both armies. The AI uses legal deployment and exactly one legal battle action; it has no extra cards, actions or combat statistics. Auto-place completes deployment if you want a quick test. Every battle turn commits exactly one action:

1. Install a hand card into one of three support slots; it becomes usable next own turn.
2. Exhaust a ready support to Move or Attack with one unit.
3. Burn a ready support for its printed effect and discard it permanently.

Cards skip their next 1/2/3 owner turns after an Order. The 12-card mirrored decks start with five cards in hand and draw every third own turn (3, 6, 9, ...). Opening cards may use the balanced default `banner`, `brace`, `smoke`, `field-dressing`, `aimed-shot`; alternatively choose exactly five unique cards or use a seeded shuffle. Both sides receive the same opening selection, so the choice is fair. The tactics surface shows deck remaining and announces each newly drawn card. Draws are free. All information is public for testing. The depletion fallback creates one non-burnable Reserve Order; Forced Rest is available only with no other action.

Combat uses deterministic HP, ATK and DEF. Nonlethal melee stops before the surviving target; hares and rats remain at origin. Ranged units remain on their source habitat. Defeat the enemy King. Checkmate mode has no check/castling/en passant, and last-rank Pawns become Veterans. Those changes never affect classic rules.

Twelve variants (two per chess role), twelve tactical abilities, Smoke/Log/Snare, statuses, direct equipment, action previews, replay autosaves, undo and JSON export are included. AI decisions run in a browser Web Worker with bounded, deterministic search at three unrated levels; this is not Stockfish, a rating claim or a promise of optimal play. A Checkmate AI undo removes the human command and its reply together. The selected opponent, side, difficulty and opening-hand choice are restored with the local session; older seeded saves restore as local two-player. The same six animal sprite families and original habitats are reused, with new generated card/terrain illustrations. Dedicated variant accessories, the complete card-motion polish pass, online PvP, deck editor, draft/territory/reinforcement modes and fuller variant art remain future work. This is a rules prototype, not validated competitive balance.

- [Playable rules and trigger order](docs/checkmate/RULES-v0.1.md)
- [GDD companion and provisional decision register](docs/checkmate/GDD-v0.1.md)
- [Complete design and animation production specification](docs/checkmate/DESIGN-ANIMATION-SPEC.md)

`src/checkmate/engine.ts` is a UI-independent deterministic reducer. `content.ts` defines units and cards. `persistence.ts` validates a versioned seed/roster/action log. `visuals.ts` maps events onto the existing renderer; the normal chess engine remains separate. Production strips development-only inspection hooks.

Rebuild the new card/terrain art from its source archive with `uv run --with pillow python scripts/pack_checkmate_art.py`. The script only extracts/packs the generated sprites; it does not generate replacement art.

See [opponent search, opening hands and draw behavior](docs/checkmate/OPPONENT-AND-DEALING.md) for this update.


Trading-card table update: new matches have three support slots per player in rows above and below the board. Saved v0.1 matches retain five slots to preserve their replay and resources. The resolved immutable `supportLimit` is saved by ruleset v0.2. Cards use the existing original woodland illustrations with a native trading-card frame. Tap a card for its full readable effect or unit statistics. Drag a hand card to its own support row (or the board, explicitly installing it in support) to spend one Install action. Opposing/full/invalid/cancelled drops spend nothing. A ready installed card offers Exhaust to move/attack, retaining the card in cooldown, or Use effect, permanently discarding it. New installations are locked upright; spent cooldown cards turn sideways. Pointer/touch/keyboard controls and reduced motion are supported; classic chess is unchanged.

See [trading-card table controls and three-slot migration](docs/checkmate/CARD-TABLE.md).

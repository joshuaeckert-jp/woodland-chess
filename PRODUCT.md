# Woodland Chess

## Register
product

## Platform
web

## Purpose
A complete animal chess game for Joshua on desktop and phone, hosted on Cloudflare. Four local AI settings or two players on one device. Saves stay in the browser.

## Accepted interface
During play show ONLY the large board and a small burger menu. No header, sidebar, footer, or permanent settings panel. New Game opens a compact board-styled modal for mode, difficulty and side; commit settings only on Start game. The menu holds undo, flip, PGN export, history, instructions, animation and sound controls. Checkmate triggers a winning celebration and result modal with Play again and View board; draws get a quieter result.

## Character and movement rules
Lion king, fox queen, raven bishop, hare knight, turtle rook, rat pawn. Both armies face each other at rest, with three-quarter rear poses for the near side. Flipping changes facing and coordinates. Preserve rich dimensional pixel art, large animals, legible species habitats, and coherent limbs. Forepaws must stay distinct from body, cape and tail.

Select a habitat, choose a legal square. Ground travels first; animal rises, frees tail/wings, turns, follows, turns and settles. Raven flies with wing poses, hare hops and lands, turtle lumbers, rat scurries. Captures temporarily fit two habitats into the destination: defender shifts to a corner, attacker reaches its own ground, strikes, then claims the full space. Attacks are roar, fox swipe, tail whip, shell roll, claw lift/drop, and hare kick. Castling moves both pairs; en passant strikes the adjacent rat; promotion offers all four roles.

## States and inclusion
Handle loading/retry, selection, AI thinking/bounded fallback, check, mate/draw, promotion/cancel, victory/restart, interrupted actions, storage failure, restored full history, keyboard, reduced motion, portrait and landscape. Game logic is authoritative. Sounds are optional and initially off. Selection, focus, legal markers and hit areas must follow the board projection. Board transparency/shadow blends into the page.

## Scope
TypeScript browser game with optional Deno tooling; no PHP, Docker or Lua dependency. Classic supports its existing local AI and same-device play. Checkmate supports local two-player play or a local browser AI at three unrated difficulties; neither mode is online multiplayer. Dimensional pixel artwork, not editable 3D meshes. No cloud-save sync.

## Separate Project Checkmate mode

Classic retains the accepted board-only interface above. Checkmate is a separate explicit ruleset at `?mode=checkmate`, with separate save/replay and no classic bot. Its New Game flow selects local two-player or local AI, human side, AI difficulty and an opening-hand mode. The AI deploys and takes one legal battle action under the same rules; it receives no stat, hand or action advantage. Its screen needs the board, small turn indicator and a narrow tactics surface for hand/support/inspection. Phone layout keeps the board visible while this surface scrolls. Every committed battle action is Install, Order, Burn or a permitted recovery/rest; selection and confirmation do not spend turns. The default balanced opening is five mirrored cards (`banner`, `brace`, `smoke`, `field-dressing`, `aimed-shot`); exact-five custom and seeded-shuffle openings are also mirrored to both sides. Draws occur for free on turns 3, 6, 9 and onward, with deck count, new-card feedback and an announcement.

Preserve the existing six animals, habitats, orientation and anatomy. Add HP, deterministic previews and nonlethal/ranged choreography. Unfinalized GDD choices are recorded as prototype decisions in `docs/checkmate/`. No implication that online multiplayer or competitive balance is complete.


Trading-card table update: new matches have three support slots per player in rows above and below the board. Saved v0.1 matches retain five slots to preserve their replay and resources. The resolved immutable `supportLimit` is saved by ruleset v0.2. Cards use the existing original woodland illustrations with a native trading-card frame. Tap a card for its full readable effect or unit statistics. Drag a hand card to its own support row (or the board, explicitly installing it in support) to spend one Install action. Opposing/full/invalid/cancelled drops spend nothing. A ready installed card offers Exhaust to move/attack, retaining the card in cooldown, or Use effect, permanently discarding it. New installations are locked upright; spent cooldown cards turn sideways. Pointer/touch/keyboard controls and reduced motion are supported; classic chess is unchanged.

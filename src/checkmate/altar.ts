import type { Side } from './types'

/** Original transparent pixel-stone artwork; the card sockets remain live DOM. */
export function altarArt(_side:Side):string {
 return '<img class="cm-altar-art cm-altar-horizontal" src="/assets/checkmate/shrine-horizontal.webp" alt="" aria-hidden="true" draggable="false"><img class="cm-altar-art cm-altar-vertical" src="/assets/checkmate/shrine-vertical.webp" alt="" aria-hidden="true" draggable="false">'
}

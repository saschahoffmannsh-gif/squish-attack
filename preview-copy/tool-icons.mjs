// Comic-Symbole für die Hilfsmittel (launch-12): flache Farben, dicke dunkle
// Kontur, weißer Glanz – passend zu den Menü-Kacheln. Eigene Pfade.
const INK='#1b1030';
export const TOOL_ICONS={
  rocket:`<svg viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(42 24 24)" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round">
<path d="M19 32.5h10l-1.6 5.5L24 45l-3.4-7z" fill="#ffb21f"/><path d="M21.8 33.5h4.4L24 40z" fill="#fff3a0" stroke="none"/>
<path d="M16.5 25.5 10 32.5v5l6.5-3.5z" fill="#ff4a3a"/><path d="M31.5 25.5 38 32.5v5l-6.5-3.5z" fill="#ff4a3a"/>
<path d="M24 3.5c6 5 8 13 8 20.5v9H16v-9c0-7.5 2-15.5 8-20.5z" fill="#eef1fb"/>
<path d="M24 3.5c3 2.5 5 5.6 6.3 9.2H17.7C19 9.1 21 6 24 3.5z" fill="#ff4a3a"/>
<circle cx="24" cy="20.5" r="4.2" fill="#3fb6ff"/><path d="M22.2 19.4a2.2 2.2 0 0 1 1.6-1.4" stroke="#fff" stroke-width="1.6"/>
<path d="M19.6 16.5c-.8 3-1.1 7-1.1 12" stroke="#fff" stroke-width="1.8" opacity=".85"/></g></svg>`,
  extraMoves:`<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="${INK}" stroke-width="2.3" stroke-linejoin="round">
<path d="M10 23.5h8v-8h6.5v8h8v6.5h-8v8H18v-8h-8z" fill="#7be24a"/>
<path d="M33 13.5c3.6-2.4 9.2-1.4 9.8 2.8.5 3.3-2.2 5-4.6 5.6 3 .5 5.6 2.4 5 5.9-.8 4.6-7.4 5.6-11.3 2.6l2.2-3.6c2 1.4 5 1.3 5.2-.6.2-1.7-1.7-2.4-4.6-2.3v-3.8c2.6 0 4.2-.7 4-2.2-.2-1.7-3-1.7-4.7-.6z" fill="#7be24a"/></g>
<path d="M13 25.5h4.5M20 18v4" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/></svg>`,
};
// Geschenk-Paket (Comic): rote Schleife, gelbes Papier.
export const GIFT_SVG=`<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
<path d="M8 21h32v20a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" fill="#ffc93a"/><path d="M5.5 14.5h37v7.5h-37z" fill="#ffdc5e"/>
<path d="M20.5 14.5h7V44h-7z" fill="#ff4a3a"/>
<path d="M24 14c-3-6.5-11-8.5-12-4s6.5 4.4 12 4zM24 14c3-6.5 11-8.5 12-4s-6.5 4.4-12 4z" fill="#ff4a3a"/></g>
<path d="M11 24.5v12" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".8"/><path d="M9 17h7" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/></svg>`;
// Deckel separat (fliegt beim Öffnen weg) und Unterteil.
export const GIFT_LID_SVG=`<svg viewBox="0 0 48 20" aria-hidden="true"><g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" transform="translate(0 -4)">
<path d="M5.5 14.5h37v7.5h-37z" fill="#ffdc5e"/><path d="M20.5 14.5h7v7.5h-7z" fill="#ff4a3a"/>
<path d="M24 14c-3-6.5-11-8.5-12-4s6.5 4.4 12 4zM24 14c3-6.5 11-8.5 12-4s-6.5 4.4-12 4z" fill="#ff4a3a"/></g></svg>`;
export const GIFT_BOX_SVG=`<svg viewBox="0 0 48 26" aria-hidden="true"><g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" transform="translate(0 -19)">
<path d="M8 21h32v20a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" fill="#ffc93a"/><path d="M20.5 21h7V44h-7z" fill="#ff4a3a"/></g>
<path d="M11 6v12" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".8"/></svg>`;
// Shop: Einkaufstüte mit Stern.
export const SHOP_SVG=`<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
<path d="M17 17v-4a7 7 0 0 1 14 0v4" fill="none"/>
<path d="M8.5 15h31l-2.2 26.5a3 3 0 0 1-3 2.7H13.7a3 3 0 0 1-3-2.7z" fill="#3fb6ff"/>
<path d="M24 21.5l2.4 5 5.4.6-4 3.7 1.1 5.4-4.9-2.7-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" fill="#ffd84a"/></g>
<path d="M13 19l1.2 15" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".8"/></svg>`;
// Comic-Explosion „BOOM“: gezackter Stern mit Kontur und Schrift.
export function boomSvg(){
  const pts=[];for(let i=0;i<28;i++){const a=i/28*Math.PI*2-Math.PI/2,r=i%2?30+((i*7)%5):46+((i*13)%7);pts.push(`${(50+r*Math.cos(a)).toFixed(1)} ${(50+r*Math.sin(a)).toFixed(1)}`);}
  const inner=[];for(let i=0;i<22;i++){const a=i/22*Math.PI*2-Math.PI/2+.1,r=i%2?20:31+((i*5)%4);inner.push(`${(50+r*Math.cos(a)).toFixed(1)} ${(50+r*Math.sin(a)).toFixed(1)}`);}
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M${pts.join('L')}z" fill="#ff5a2a" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
<path d="M${inner.join('L')}z" fill="#ffd84a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
<text x="50" y="58" text-anchor="middle" font-family="AW Comic, Fredoka, sans-serif" font-weight="700" font-size="22" fill="#fff" stroke="${INK}" stroke-width="4.2" paint-order="stroke" letter-spacing="-.5">BOOM!</text></svg>`;
}
export const SPARK_SVG=`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1 12 8 19 10 12 12 10 19 8 12 1 10 8 8z" fill="#fff6a8" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
export const ARROW_SVG=`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M4 15h17V6l15 14-15 14v-9H4z" fill="#ffd84a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M7 18h16" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".8"/></svg>`;

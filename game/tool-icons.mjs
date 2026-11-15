// Comic-Symbole für die Hilfsmittel (launch-10): flache Farben, dicke dunkle
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
  hint:`<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="${INK}" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round">
<path d="M24 4.5a12.5 12.5 0 0 0-7.3 22.6c1.4 1 2.1 2.5 2.1 4.1v2.3h10.4v-2.3c0-1.6.7-3.1 2.1-4.1A12.5 12.5 0 0 0 24 4.5z" fill="#ffe14d"/>
<path d="M18.8 33.5h10.4v3.7a3.3 3.3 0 0 1-3.3 3.3h-3.8a3.3 3.3 0 0 1-3.3-3.3z" fill="#9aa1d6"/><path d="M19.4 37h9.2" />
<path d="M21 43.5h6" /><path d="M24 26v-6.5l-3 3m3-3 3 3" fill="none"/>
<path d="M16.8 15.2a8 8 0 0 1 5-5.3" stroke="#fff" stroke-width="2.1"/></g>
<g stroke="${INK}" stroke-width="2" stroke-linecap="round"><path d="M5 17h3.5M39.5 17H43M9 6.5l2.4 2.4M39 6.5l-2.4 2.4"/></g></svg>`,
  wand:`<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke-linecap="round">
<path d="M9 41 29.5 20.5" stroke="${INK}" stroke-width="8"/><path d="M9 41 29.5 20.5" stroke="#4a4380" stroke-width="4"/>
<path d="M25.5 24.5 29.5 20.5" stroke="#fff" stroke-width="4"/></g>
<g stroke="${INK}" stroke-width="2.1" stroke-linejoin="round">
<path d="M35.0 3.0L37.6 9.4L44.5 9.9L39.2 14.4L40.9 21.1L35.0 17.4L29.1 21.1L30.8 14.4L25.5 9.9L32.4 9.4z" fill="#ffd84a"/>
<path d="M13.0 8.5L14.1 11.9L17.5 13.0L14.1 14.1L13.0 17.5L11.9 14.1L8.5 13.0L11.9 11.9z" fill="#fff"/>
<path d="M41.0 27.4L41.9 30.1L44.6 31.0L41.9 31.9L41.0 34.6L40.1 31.9L37.4 31.0L40.1 30.1z" fill="#fff"/></g>
<path d="M33.2 8.8l1.2-2.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`,
};
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

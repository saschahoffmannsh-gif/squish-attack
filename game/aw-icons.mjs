// SVG-Symbole für das Herbst-Design (eigene Pfade, keine fremden Assets).
const s=(body,{fill=false,w=2.8}={})=>`<svg viewBox="0 0 24 24" aria-hidden="true" ${fill?'fill="currentColor"':`fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`}>${body}</svg>`;
export const GEAR_PATH='M20.02 9.52 L22.98 9.77 L22.98 14.23 L20.02 14.48 L19.43 15.92 L21.34 18.19 L18.19 21.34 L15.92 19.43 L14.48 20.02 L14.23 22.98 L9.77 22.98 L9.52 20.02 L8.08 19.43 L5.81 21.34 L2.66 18.19 L4.57 15.92 L3.98 14.48 L1.02 14.23 L1.02 9.77 L3.98 9.52 L4.57 8.08 L2.66 5.81 L5.81 2.66 L8.08 4.57 L9.52 3.98 L9.77 1.02 L14.23 1.02 L14.48 3.98 L15.92 4.57 L18.19 2.66 L21.34 5.81 L19.43 8.08Z M12 8.2a3.8 3.8 0 1 0 0.001 0Z';
export const STAR_PATH='M12.00 1.80 L14.82 8.92 L22.46 9.40 L16.57 14.28 L18.47 21.70 L12.00 17.60 L5.53 21.70 L7.43 14.28 L1.54 9.40 L9.18 8.92Z';
export const LEAF_PATH='M12 1.6 13.7 6 16.4 4.6 15.8 9.1 20 7.4 18.8 10.5 22.6 11.2 19 14.1 20.1 16.6 14.8 15.7 13.1 18.2 12.7 22.6h-1.4L10.9 18.2 9.2 15.7 3.9 16.6 5 14.1 1.4 11.2 5.2 10.5 4 7.4 8.2 9.1 7.6 4.6 10.3 6Z';
export const ICONS={
  play:s('<path d="M8 5.5v13l10.5-6.5z"/>',{fill:true}),
  flag:s('<path d="M6 21.5V3.5"/><path d="M6 4.5h11.5l-2.6 4.2 2.6 4.3H6" fill="currentColor"/>'),
  infinity:s('<path d="M7.2 8.4C5 8.4 3.4 10 3.4 12s1.6 3.6 3.8 3.6c3.8 0 5.8-7.2 9.6-7.2 2.2 0 3.8 1.6 3.8 3.6s-1.6 3.6-3.8 3.6c-3.8 0-5.8-7.2-9.6-7.2z"/>',{w:3}),
  duo:s('<circle cx="8.3" cy="8" r="3.4"/><circle cx="16.6" cy="9" r="2.9"/><path d="M2.2 20.5c0-3.6 2.7-6.2 6.1-6.2s6.1 2.6 6.1 6.2z"/><path d="M15.2 20.5c0-2.2-.6-3.9-1.7-5.2.9-.6 1.9-.9 3.1-.9 2.9 0 5.2 2.3 5.2 5.4v.7z"/>',{fill:true}),
  gear:`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${GEAR_PATH}"/></svg>`,
  home:s('<path d="M12 3.2 2.6 11.4h2.7V20h5v-5.2h3.4V20h5v-8.6h2.7z"/>',{fill:true}),
  retry:s('<path d="M19 12.5a7 7 0 1 1-2.2-5.1"/><path d="M19.5 3.8v4.6h-4.6"/>',{w:3}),
  grid:s('<rect x="3.5" y="3.5" width="7.2" height="7.2" rx="2"/><rect x="13.3" y="3.5" width="7.2" height="7.2" rx="2"/><rect x="3.5" y="13.3" width="7.2" height="7.2" rx="2"/><rect x="13.3" y="13.3" width="7.2" height="7.2" rx="2"/>',{fill:true}),
  trophy:s('<path d="M7 3.5h10v5.2a5 5 0 0 1-10 0z"/><path d="M7 5H3.8c0 3 1.4 4.8 3.6 5.2M17 5h3.2c0 3-1.4 4.8-3.6 5.2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M10.6 13.4h2.8v3.4h2.8l.8 3.7H7l.8-3.7h2.8z"/>',{fill:true}),
  back:s('<path d="M14.8 5.2 8 12l6.8 6.8"/>',{w:3.6}),
  plus:s('<path d="M12 5v14M5 12h14"/>',{w:3.6}),
  gift:s('<rect x="3.5" y="9" width="17" height="11.5" rx="2"/><path d="M2.8 7h18.4v3.4H2.8z"/><path d="M12 7c-1.6-3.4-5.8-3.8-5.8-1.5S9.6 7 12 7c2.4 0 5.8-.8 5.8-1.5S13.6 3.6 12 7z"/>',{fill:true}),
};
export const leafSvg=(veins=true)=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${LEAF_PATH}"/>${veins?'<path d="M12 22V7M12 13l-5-3.5M12 13l5-3.5M12 17l-4.5-1.2M12 17l4.5-1.2" fill="none" stroke="#0000003a" stroke-width=".9" stroke-linecap="round"/>':''}</svg>`;

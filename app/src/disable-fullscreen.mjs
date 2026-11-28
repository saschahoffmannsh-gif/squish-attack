// Blockt die Fullscreen-API in der nativen App (nur App-Paket, nicht Web /game/).
// requestFullscreen im WKWebView erzeugt den iOS-Banner
// „… ist im Vollbildmodus. Zum Beenden nach unten streichen.“,
// verzögert Touches (Systemgeste zum Verlassen, oft ~1 s) und lässt
// CSS- und WebGL-Animationen stocken oder überspringen.
function noop() {
  return Promise.resolve();
}

function defineGetter(obj, key, value) {
  if (!obj) return;
  try {
    Object.defineProperty(obj, key, { configurable: true, enumerable: true, get: () => value });
  } catch {
    try { obj[key] = value; } catch { /* ignore */ }
  }
}

function stubMethods(obj, names) {
  if (!obj) return;
  for (const name of names) {
    try { obj[name] = noop; } catch { /* ignore */ }
  }
}

export function disableNativeFullscreen({
  page = globalThis.document,
  ElementCtor = globalThis.Element,
  DocumentCtor = globalThis.Document,
} = {}) {
  stubMethods(ElementCtor?.prototype, ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen']);
  stubMethods(page?.documentElement, ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen']);
  stubMethods(DocumentCtor?.prototype, ['exitFullscreen', 'webkitExitFullscreen', 'webkitCancelFullScreen']);
  stubMethods(page, ['exitFullscreen', 'webkitExitFullscreen', 'webkitCancelFullScreen']);
  for (const target of [DocumentCtor?.prototype, page]) {
    defineGetter(target, 'fullscreenEnabled', false);
    defineGetter(target, 'webkitFullscreenEnabled', false);
    defineGetter(target, 'fullscreenElement', null);
    defineGetter(target, 'webkitFullscreenElement', null);
  }
  const hide = () => {
    const button = page?.getElementById?.('fullscreen-toggle');
    if (button) button.hidden = true;
  };
  hide();
  if (page && page.readyState === 'loading') {
    page.addEventListener?.('DOMContentLoaded', hide, { once: true });
  }
}

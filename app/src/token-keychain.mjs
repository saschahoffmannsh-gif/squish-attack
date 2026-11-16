// Spieler-Token im iOS-Schlüsselbund. Der localStorage der WebView ist nach einer Neuinstallation leer,
// der Schlüsselbund nicht. Regel: localStorage gewinnt, wenn er einen gültigen Token hat (und wird in
// den Schlüsselbund geschrieben); ist er leer, wird der Token aus dem Schlüsselbund zurückgeschrieben.
// Ohne Plugin oder bei Fehlern bleibt alles beim localStorage (wie im Browser).
const VALID = /^[a-f0-9]{64}$/;
const withTimeout = (p, ms) => Promise.race([Promise.resolve(p), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export async function readKeychain(secure, key, timeoutMs = 1500) {
  if (!secure) return null;
  try { const r = await withTimeout(secure.get({ key }), timeoutMs); return VALID.test(r?.value || '') ? r.value : null; }
  catch { return null; }   // "Item with given key does not exist" → null
}

/** Vor dem Spielstart. → {token, source: 'local'|'keychain'|'none', wrote} */
export async function restoreToken({ secure, storage = globalThis.localStorage, key, timeoutMs = 1500 } = {}) {
  let local = null;
  try { local = storage?.getItem(key) || null; } catch {}
  if (!VALID.test(local || '')) local = null;
  const kc = await readKeychain(secure, key, timeoutMs);
  if (local) {
    let wrote = false;
    if (secure && kc !== local) { try { await withTimeout(secure.set({ key, value: local }), timeoutMs); wrote = true; } catch {} }
    return { token: local, source: 'local', wrote };
  }
  if (kc) { try { storage?.setItem(key, kc); } catch {} return { token: kc, source: 'keychain', wrote: false }; }
  return { token: null, source: 'none', wrote: false };
}

/** Nach dem Start (das Spiel erzeugt einen neuen Token erst bei Bedarf) und bei App-Pause aufrufen. */
export async function persistToken({ secure, storage = globalThis.localStorage, key, timeoutMs = 1500, last = null } = {}) {
  if (!secure) return last;
  let local = null;
  try { local = storage?.getItem(key) || null; } catch {}
  if (!VALID.test(local || '') || local === last) return last;
  try { await withTimeout(secure.set({ key, value: local }), timeoutMs); return local; } catch { return last; }
}

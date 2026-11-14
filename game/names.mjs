// Nickname rules, shared verbatim by client (game/names.mjs) and server.
// No personal data: just a free-form nickname, not unique.
export const NAME_MIN = 3;
export const NAME_MAX = 16;
// Letters incl. German umlauts/ß and common Latin accents, digits, space, . _ -
const ALLOWED = /^[A-Za-z0-9ÄÖÜäöüßÀ-ÖØ-öø-ÿ ._-]+$/;

// Basic list, matched on a normalised form (lower case, leetspeak undone,
// separators removed, repeated letters collapsed). Deliberately short; it
// catches the obvious cases, not every creative spelling.
const BLOCKED = [
  // German
  "arschloch", "arsch", "fotze", "fick", "ficken", "wichser", "hurensohn", "hure", "schlampe", "nutte",
  "missgeburt", "spast", "spasti", "behindert", "schwuchtel", "kanake", "neger", "nigger", "nigga",
  "hitler", "nazi", "heilhitler", "siegheil", "judensau", "kz", "ss-", "adolf",
  "penis", "vagina", "muschi", "titten", "pimmel", "schwanz", "porno", "sex",
  // English
  "fuck", "fuk", "shit", "bitch", "cunt", "dick", "cock", "pussy", "whore", "slut", "rape", "faggot", "fag",
  "retard", "asshole", "bastard", "porn",
];
// Short words only as whole name parts (to avoid "Kzinti"-style false hits).
const WHOLE_WORD = new Set(["kz", "ss-", "sex", "fag", "fuk", "dick", "cock", "arsch", "hure", "spast", "adolf"]);
const LEET = { "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "8": "b", "9": "g" };

export function normaliseName(raw) {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

function squash(text) {
  return text.toLowerCase()
    .replace(/[0-9!@$]/g, (c) => LEET[c] ?? c)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** @returns {{ok: true, name: string} | {ok: false, reason: string, message: string}} */
export function checkName(raw) {
  const name = normaliseName(raw);
  const no = (reason, message) => ({ ok: false, reason, message });
  if (name.length < NAME_MIN) return no("short", `Mindestens ${NAME_MIN} Zeichen.`);
  if (name.length > NAME_MAX) return no("long", `Höchstens ${NAME_MAX} Zeichen.`);
  if (!ALLOWED.test(name)) return no("chars", "Nur Buchstaben, Ziffern, Leerzeichen, Punkt, Minus und Unterstrich.");
  if ((name.match(/[A-Za-z0-9ÄÖÜäöüßÀ-ÖØ-öø-ÿ]/g) ?? []).length < 2) return no("chars", "Bitte mindestens zwei Buchstaben oder Ziffern.");
  if (/(1488|88$|^88|\b18\b)/.test(name)) return no("blocked", "Dieser Name ist nicht erlaubt.");
  const flat = squash(name).replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1");
  const words = squash(name).split(/[ ._-]+/).map((w) => w.replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1"));
  for (const bad of BLOCKED) {
    const b = bad.replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1");
    if (WHOLE_WORD.has(bad) ? words.includes(b) : flat.includes(b)) return no("blocked", "Dieser Name ist nicht erlaubt.");
  }
  return { ok: true, name };
}

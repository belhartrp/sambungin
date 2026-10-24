import { foldKey } from '../normalize';
import type { Language, LookupMatch } from '../types';

/**
 * Menerjemahkan transkrip suara menjadi maksud pengguna.
 *
 * Dua maksud harus dipisah dengan tegas:
 *   - prefix: huruf atau rangkaian huruf yang harus disambungkan (mode Cari awalan)
 *   - mark  : kata utuh yang baru dimainkan (mode Tandai kata)
 * Transkrip tidak pernah otomatis dianggap kata terpakai kecuali pengguna berada di mode
 * Tandai kata atau memakai perintah "tandai ...".
 */

export type InputMode = 'prefix' | 'mark';

export type VoiceCommand = 'undo' | 'clear' | 'mode-search' | 'mode-mark';

export type VoiceIntent =
  | { type: 'empty' }
  | { type: 'command'; command: VoiceCommand }
  | { type: 'prefix'; prefix: string }
  | { type: 'mark'; text: string };

export interface IntentContext {
  mode: InputMode;
  voiceCommands: boolean;
  /** Ubah nama huruf (be, ce, bee, see ...) menjadi huruf. */
  spelling: boolean;
}

/** Nama huruf bahasa Indonesia. */
const ID_NAMES: Record<string, string> = {
  be: 'b', ce: 'c', de: 'd', ef: 'f', ge: 'g', ha: 'h', je: 'j', ka: 'k', el: 'l', em: 'm', en: 'n',
  pe: 'p', ki: 'q', qi: 'q', er: 'r', es: 's', te: 't', ve: 'v', fe: 'v', we: 'w', eks: 'x',
  ye: 'y', zet: 'z',
};

/** Nama huruf bahasa Inggris. */
const EN_NAMES: Record<string, string> = {
  ay: 'a', ey: 'a', bee: 'b', cee: 'c', see: 'c', sea: 'c', dee: 'd', ee: 'e', eff: 'f', gee: 'g',
  aitch: 'h', eye: 'i', jay: 'j', kay: 'k', ell: 'l', oh: 'o', pee: 'p', cue: 'q', queue: 'q',
  are: 'r', ess: 's', tee: 't', tea: 't', you: 'u', vee: 'v', ex: 'x', why: 'y', zee: 'z', zed: 'z',
  doubleu: 'w', doubleyou: 'w',
};

const LETTER_NAMES: Record<string, string> = { ...EN_NAMES, ...ID_NAMES };

const MARK_PREFIXES = [
  'tandai kata', 'tandai', 'sudah dipakai', 'sudah pernah', 'sudah dipake',
  'mark as used', 'mark used', 'mark word', 'mark',
];
const SEARCH_PREFIXES = [
  'cari awalan', 'cari', 'berawalan', 'awalan', 'diawali', 'dimulai dengan', 'mulai dengan',
  'search for', 'search', 'starting with', 'starts with', 'begins with', 'prefix',
];
const UNDO_PHRASES = new Set(['batalkan', 'batal', 'urungkan', 'undo', 'cancel']);
const CLEAR_PHRASES = new Set(['hapus', 'hapus input', 'bersihkan', 'kosongkan', 'clear', 'clear input']);
const FILLER_LEADING = new Set(['kata', 'word', 'the']);

/** Huruf kecil, buang tanda baca, rapikan spasi. Tanda hubung menjadi spasi. */
export function cleanTranscript(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/double[\s-]+(u|you)\b/g, 'doubleu')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mengubah ucapan berejaan ("a be es", "a b s", "ab") menjadi awalan huruf a-z. */
export function spellToPrefix(text: string, spelling: boolean): string {
  const tokens = cleanTranscript(text).split(' ').filter(Boolean);
  let out = '';
  for (const t of tokens) {
    if (t.length === 1) out += foldKey(t);
    else if (spelling && LETTER_NAMES[t]) out += LETTER_NAMES[t];
    else out += foldKey(t);
  }
  return out;
}

/** Membersihkan ucapan kata utuh (mode Tandai kata). */
export function cleanMarkText(raw: string): string {
  const tokens = cleanTranscript(raw).split(' ').filter(Boolean);
  while (tokens.length > 1 && FILLER_LEADING.has(tokens[0]!)) tokens.shift();
  return tokens.join(' ');
}

function stripPhrase(text: string, phrases: string[]): { matched: boolean; rest: string } {
  for (const p of phrases) {
    if (text === p) return { matched: true, rest: '' };
    if (text.startsWith(p + ' ')) return { matched: true, rest: text.slice(p.length + 1).trim() };
  }
  return { matched: false, rest: '' };
}

export function parseTranscript(raw: string, ctx: IntentContext): VoiceIntent {
  const text = cleanTranscript(raw);
  if (!text) return { type: 'empty' };

  if (ctx.voiceCommands) {
    if (UNDO_PHRASES.has(text)) return { type: 'command', command: 'undo' };
    if (CLEAR_PHRASES.has(text)) return { type: 'command', command: 'clear' };

    const mark = stripPhrase(text, MARK_PREFIXES);
    if (mark.matched) {
      return mark.rest
        ? { type: 'mark', text: cleanMarkText(mark.rest) }
        : { type: 'command', command: 'mode-mark' };
    }
    const search = stripPhrase(text, SEARCH_PREFIXES);
    if (search.matched) {
      if (!search.rest) return { type: 'command', command: 'mode-search' };
      const prefix = spellToPrefix(search.rest, ctx.spelling);
      return prefix ? { type: 'prefix', prefix } : { type: 'empty' };
    }
  }

  if (ctx.mode === 'mark') {
    const cleaned = cleanMarkText(raw);
    return cleaned ? { type: 'mark', text: cleaned } : { type: 'empty' };
  }
  const prefix = spellToPrefix(text, ctx.spelling);
  return prefix ? { type: 'prefix', prefix } : { type: 'empty' };
}

/* --------------------------------------------------------------- Resolusi penandaan */

export interface Alternative {
  transcript: string;
  confidence: number;
}

export type MarkResolution =
  | { status: 'confident'; match: LookupMatch; heard: string }
  | { status: 'confirm'; choices: LookupMatch[]; heard: string }
  | { status: 'unknown'; heard: string; key: string };

export interface ResolveMarkOptions {
  /** Di bawah ambang ini (dan > 0) pengguna diminta mengonfirmasi. */
  threshold?: number;
  /** Bahasa pengenalan suara; dipakai bila kata ada di dua bahasa. */
  preferLang: Language;
  /**
   * Bila kata ada di dua bahasa: 'prefer' memilih bahasa pengenalan suara, 'ask' meminta
   * pengguna memilih (dipakai untuk input ketikan, yang tidak punya bahasa ucapan).
   */
  ambiguous?: 'prefer' | 'ask';
}

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;

/**
 * Menentukan kata yang dimaksud dari alternatif hasil pengenalan.
 *
 * - confident: alternatif teratas ada di dataset dan keyakinan memadai -> tandai langsung.
 * - confirm  : keyakinan rendah, atau hanya alternatif lain yang cocok -> minta konfirmasi.
 * - unknown  : tidak ada alternatif yang ada di dataset -> tawarkan kata khusus.
 * Keyakinan 0 berarti browser tidak melaporkannya, bukan "tidak yakin".
 */
export function resolveMark(
  alternatives: Alternative[],
  lookup: (key: string) => LookupMatch[],
  opts: ResolveMarkOptions,
): MarkResolution {
  const threshold = opts.threshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const parsed = alternatives
    .map((a) => {
      const text = cleanMarkText(a.transcript);
      return { text, key: foldKey(text), confidence: a.confidence };
    })
    .filter((a) => a.key.length > 0);
  if (parsed.length === 0) return { status: 'unknown', heard: '', key: '' };

  const top = parsed[0]!;
  const pick = (entries: LookupMatch[]): LookupMatch =>
    entries.find((e) => e.lang === opts.preferLang) ?? entries[0]!;

  const topEntries = lookup(top.key);
  if (topEntries.length > 1 && opts.ambiguous === 'ask') {
    return { status: 'confirm', choices: topEntries.slice(0, 4), heard: top.text };
  }
  if (topEntries.length > 0) {
    const chosen = pick(topEntries);
    const unsure = top.confidence > 0 && top.confidence < threshold;
    if (!unsure) return { status: 'confident', match: chosen, heard: top.text };
    const others = collectOthers(parsed.slice(1), lookup, chosen.key);
    return { status: 'confirm', choices: [chosen, ...others].slice(0, 4), heard: top.text };
  }

  const alt = collectOthers(parsed.slice(1), lookup, top.key);
  if (alt.length > 0) return { status: 'confirm', choices: alt.slice(0, 4), heard: top.text };
  return { status: 'unknown', heard: top.text, key: top.key };
}

function collectOthers(
  rest: Array<{ key: string }>,
  lookup: (key: string) => LookupMatch[],
  excludeKey: string,
): LookupMatch[] {
  const out: LookupMatch[] = [];
  const seen = new Set<string>([excludeKey]);
  for (const r of rest) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    const entries = lookup(r.key);
    if (entries.length > 0) out.push(entries[0]!);
  }
  return out;
}

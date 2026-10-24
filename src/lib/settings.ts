import type { EngineConfig } from './engine';
import { DEFAULT_RULE, clampFixedLength } from './rules';
import { DEFAULT_STRATEGY, type StrategyOptions } from './strategy';
import type { Language, LanguageMode, RuleConfig, Tier, UsedRef } from './types';

export const SETTINGS_KEY = 'sambungin:settings';
export const SETTINGS_VERSION = 1;

export type ViewMode = 'single' | 'split';
export type Persistence = 'session' | 'local';

export interface Settings {
  version: number;

  /* Bahasa dan pencarian */
  language: LanguageMode;
  voiceInput: boolean;
  manualInput: boolean;
  /** Bahasa pengenalan suara saat mode campuran. */
  voiceLangMixed: Language;
  voiceContinuous: boolean;
  voiceCommands: boolean;
  /** Mengubah nama huruf (be, ce, de / bee, see, dee) menjadi huruf. */
  voiceSpelling: boolean;
  rule: RuleConfig;
  searchTier: Tier;
  includeInformal: boolean;
  includeNames: boolean;

  /* Tampilan */
  view: ViewMode;
  showLanguageLabel: boolean;
  showEnding: boolean;
  showScore: boolean;
  showStrategyColumn: boolean;

  /* Strategi */
  strategy: StrategyOptions;
  opponentTier: Tier;
  /** Filter kata yang sudah digunakan. */
  excludeUsed: boolean;

  /* Riwayat */
  historyEnabled: boolean;
  persistence: Persistence;
  usedAcrossLanguages: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  language: 'mixed',
  voiceInput: true,
  manualInput: true,
  voiceLangMixed: 'id',
  voiceContinuous: false,
  voiceCommands: true,
  voiceSpelling: true,
  rule: DEFAULT_RULE,
  searchTier: 3,
  includeInformal: true,
  includeNames: true,

  view: 'single',
  showLanguageLabel: true,
  showEnding: true,
  showScore: true,
  showStrategyColumn: true,

  strategy: DEFAULT_STRATEGY,
  opponentTier: 2,
  excludeUsed: true,

  historyEnabled: true,
  persistence: 'session',
  usedAcrossLanguages: true,
};

const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : d;
const tier = (v: unknown, d: Tier): Tier => (v === 1 || v === 2 || v === 3 ? v : d);

/**
 * Membersihkan data hasil baca dari penyimpanan. Nilai yang tidak valid atau hilang diganti
 * nilai bawaan, sehingga data lama, rusak, atau diedit manual tidak merusak aplikasi.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return structuredCloneSettings(d);
  const r = raw as Record<string, unknown>;
  const rr = (r.rule && typeof r.rule === 'object' ? r.rule : {}) as Record<string, unknown>;
  const ss = (r.strategy && typeof r.strategy === 'object' ? r.strategy : {}) as Record<string, unknown>;

  const settings: Settings = {
    version: SETTINGS_VERSION,
    language: oneOf<LanguageMode>(r.language, ['id', 'en', 'mixed'], d.language),
    voiceInput: bool(r.voiceInput, d.voiceInput),
    manualInput: bool(r.manualInput, d.manualInput),
    voiceLangMixed: oneOf<Language>(r.voiceLangMixed, ['id', 'en'], d.voiceLangMixed),
    voiceContinuous: bool(r.voiceContinuous, d.voiceContinuous),
    voiceCommands: bool(r.voiceCommands, d.voiceCommands),
    voiceSpelling: bool(r.voiceSpelling, d.voiceSpelling),
    rule: {
      mode: oneOf<RuleConfig['mode']>(rr.mode, ['auto', 'fixed'], d.rule.mode),
      fixedLength: clampFixedLength(typeof rr.fixedLength === 'number' ? rr.fixedLength : d.rule.fixedLength),
    },
    searchTier: tier(r.searchTier, d.searchTier),
    includeInformal: bool(r.includeInformal, d.includeInformal),
    includeNames: bool(r.includeNames, d.includeNames),

    view: oneOf<ViewMode>(r.view, ['single', 'split'], d.view),
    showLanguageLabel: bool(r.showLanguageLabel, d.showLanguageLabel),
    showEnding: bool(r.showEnding, d.showEnding),
    showScore: bool(r.showScore, d.showScore),
    showStrategyColumn: bool(r.showStrategyColumn, d.showStrategyColumn),

    strategy: {
      enabled: bool(ss.enabled, d.strategy.enabled),
      prioritizeHardEndings: bool(ss.prioritizeHardEndings, d.strategy.prioritizeHardEndings),
      considerLength: bool(ss.considerLength, d.strategy.considerLength),
      lengthPreference: oneOf(ss.lengthPreference, ['longer', 'shorter'] as const, d.strategy.lengthPreference),
      preferValidWords: bool(ss.preferValidWords, d.strategy.preferValidWords),
      showContinuation: bool(ss.showContinuation, d.strategy.showContinuation),
    },
    opponentTier: tier(r.opponentTier, d.opponentTier),
    excludeUsed: bool(r.excludeUsed, d.excludeUsed),

    historyEnabled: bool(r.historyEnabled, d.historyEnabled),
    persistence: oneOf<Persistence>(r.persistence, ['session', 'local'], d.persistence),
    usedAcrossLanguages: bool(r.usedAcrossLanguages, d.usedAcrossLanguages),
  };

  // Input manual tidak boleh mati bila suara dimatikan: harus selalu ada cara memasukkan data.
  if (!settings.voiceInput && !settings.manualInput) settings.manualInput = true;
  return settings;
}

export function structuredCloneSettings(s: Settings): Settings {
  return JSON.parse(JSON.stringify(s)) as Settings;
}

export function languagesOf(mode: LanguageMode): Language[] {
  return mode === 'mixed' ? ['id', 'en'] : [mode];
}

/** Konfigurasi mesin yang diturunkan dari pengaturan dan riwayat. */
export function engineConfigFrom(settings: Settings, used: UsedRef[]): EngineConfig {
  return {
    languages: languagesOf(settings.language),
    searchTier: settings.searchTier,
    opponentTier: settings.opponentTier,
    includeInformal: settings.includeInformal,
    includeNames: settings.includeNames,
    excludeUsed: settings.excludeUsed,
    usedAcrossLanguages: settings.usedAcrossLanguages,
    used,
  };
}

/** Bahasa pengenalan suara (BCP 47) untuk Web Speech API. */
export function recognitionLang(settings: Settings): string {
  const lang: Language = settings.language === 'mixed' ? settings.voiceLangMixed : settings.language;
  return lang === 'id' ? 'id-ID' : 'en-US';
}

export function recognitionLanguage(settings: Settings): Language {
  return settings.language === 'mixed' ? settings.voiceLangMixed : settings.language;
}

/**
 * Ketersediaan metode input. Input manual selalu tersedia sebagai cadangan: bila suara mati
 * atau tidak didukung browser, input manual tetap aktif walau pengaturannya dimatikan.
 */
export function effectiveInputs(
  settings: Pick<Settings, 'voiceInput' | 'manualInput'>,
  speechSupported: boolean,
): { voice: boolean; manual: boolean } {
  const voice = settings.voiceInput && speechSupported;
  return { voice, manual: settings.manualInput || !voice };
}

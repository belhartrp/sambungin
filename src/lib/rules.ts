import { foldKey, tailOf } from './normalize';
import type { RuleConfig } from './types';

export const MAX_FIXED_LENGTH = 6;

export const DEFAULT_RULE: RuleConfig = { mode: 'auto', fixedLength: 1 };

export interface ResolvedRule {
  /** Awalan yang wajib dipenuhi kata kandidat (huruf a-z). */
  prefix: string;
  /** Jumlah huruf terakhir kandidat yang harus disambungkan lawan. */
  tailLength: number;
  /** true bila input lebih pendek dari panjang tetap sehingga seluruh input dipakai. */
  short: boolean;
}

export function clampFixedLength(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_FIXED_LENGTH, Math.max(1, Math.round(n)));
}

/**
 * Menurunkan awalan wajib dan panjang akhiran dari input pengguna.
 *
 * auto : awalan = seluruh input; lawan harus menyambung sepanjang itu juga.
 * fixed: aturan permainan menetapkan N huruf. Awalan = N huruf terakhir dari input, sehingga
 *        pengguna boleh langsung mengetik atau mengucapkan kata lawan utuh.
 *
 * Logika penghitungan kelanjutan memakai tailLength yang sama, jadi pencarian dan strategi
 * selalu mengikuti aturan permainan yang sama.
 */
export function resolveRule(input: string, rule: RuleConfig): ResolvedRule {
  const key = foldKey(input);
  if (rule.mode === 'fixed') {
    const n = clampFixedLength(rule.fixedLength);
    return { prefix: tailOf(key, n), tailLength: n, short: key.length > 0 && key.length < n };
  }
  return { prefix: key, tailLength: key.length, short: false };
}

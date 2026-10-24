import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ENGINE_CONFIG, EngineCore, type EngineConfig } from '@/lib/engine';
import { foldKey } from '@/lib/normalize';
import { DEFAULT_STRATEGY, type StrategyOptions } from '@/lib/strategy';

/** Spesifikasi kata uji: "kata" atau "kata:p2" (kategori p, tingkat 2). */
export function toLines(specs: string[]): string {
  const rows = specs.map((s) => {
    const [word, meta = 'd1'] = s.split(':');
    const kind = meta[0] ?? 'd';
    const tier = meta[1] ?? '1';
    return { word: word!, key: foldKey(word!), line: `${word}|${kind}${tier}1` };
  });
  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return rows.map((r) => r.line).join('\n') + '\n';
}

export function makeEngine(
  id: string[],
  en: string[],
  cfg: Partial<EngineConfig> = {},
): EngineCore {
  const engine = new EngineCore();
  engine.load({ id: toLines(id), en: toLines(en) });
  engine.configure({ ...DEFAULT_ENGINE_CONFIG, opponentTier: 3, ...cfg });
  return engine;
}

export const strategy = (o: Partial<StrategyOptions> = {}): StrategyOptions => ({
  ...DEFAULT_STRATEGY,
  ...o,
});

const dataDir = path.resolve(__dirname, '../public/data');
export const readData = (name: string): string => fs.readFileSync(path.join(dataDir, name), 'utf8');

let real: EngineCore | null = null;
/** Engine dengan dataset asli (dibangun sekali dan dipakai bersama). */
export function realEngine(): EngineCore {
  if (!real) {
    real = new EngineCore();
    real.load({ id: readData('id.txt'), en: readData('en.txt') });
  }
  return real;
}

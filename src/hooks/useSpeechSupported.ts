'use client';
import { useSyncExternalStore } from 'react';
import { isSpeechSupported } from '@/lib/speech/controller';

const subscribe = (): (() => void) => () => {};

/**
 * Dukungan pengenalan suara. Di server nilainya false; di klien nilai sebenarnya dipakai
 * tanpa memicu hydration mismatch dan tanpa setState di dalam effect.
 */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(subscribe, () => isSpeechSupported(), () => false);
}

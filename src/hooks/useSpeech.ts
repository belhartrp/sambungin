'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { recognitionLang } from '@/lib/settings';
import {
  SpeechController,
  browserRecognitionFactory,
  type SpeechError,
  type SpeechState,
} from '@/lib/speech/controller';
import { useApp } from '@/store/app';
import { useSpeechSupported } from './useSpeechSupported';

/**
 * Menghubungkan SpeechController ke store. Dukungan baru dideteksi setelah mount agar
 * tampilan server dan klien sama (tidak ada hydration mismatch).
 */
export function useSpeech() {
  const supported = useSpeechSupported();
  const [state, setState] = useState<SpeechState>('idle');
  const [error, setError] = useState<SpeechError | null>(null);
  const ctrl = useRef<SpeechController | null>(null);
  const lang = useApp((s) => recognitionLang(s.settings));

  useEffect(() => {
    if (!supported) return;
    const c = new SpeechController(browserRecognitionFactory(), {
      onState: (s, e) => {
        setState(s);
        if (e) setError(e);
        else if (s === 'starting' || s === 'listening') setError(null);
      },
      onInterim: (t) => useApp.getState().voiceInterim(t),
      onFinal: (alts) => void useApp.getState().voiceFinal(alts),
    });
    ctrl.current = c;
    return () => {
      c.dispose();
      ctrl.current = null;
    };
  }, [supported]);

  // Bahasa berubah saat mikrofon aktif: mulai ulang dengan bahasa baru.
  useEffect(() => {
    const c = ctrl.current;
    if (c?.active) {
      const { voiceContinuous } = useApp.getState().settings;
      c.start({ lang, continuous: voiceContinuous });
    }
  }, [lang]);

  const toggle = useCallback(() => {
    const c = ctrl.current;
    if (!c) return;
    if (c.active) {
      c.stop();
      return;
    }
    const { settings } = useApp.getState();
    c.start({ lang: recognitionLang(settings), continuous: settings.voiceContinuous });
  }, []);

  const effective: SpeechState = supported ? state : 'unsupported';
  return {
    supported,
    state: effective,
    error: supported ? error : null,
    toggle,
    active: effective === 'starting' || effective === 'listening',
  };
}

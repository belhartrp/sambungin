'use client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { LANGUAGE_LABEL, type Language } from '@/lib/types';
import { useApp } from '@/store/app';

/** Konfirmasi penandaan: pengenalan suara tidak yakin, kata ada di dua bahasa, atau tidak ada di dataset. */
export function ConfirmMarkDialog() {
  const pending = useApp((s) => s.pendingConfirm);
  const language = useApp((s) => s.settings.language);
  const confirmChoice = useApp((s) => s.confirmChoice);
  const confirmUnknown = useApp((s) => s.confirmUnknown);
  const dismiss = useApp((s) => s.dismissConfirm);

  const unknownLangs: Language[] = language === 'mixed' ? ['id', 'en'] : [language];

  return (
    <Modal
      open={pending !== null}
      onOpenChange={(o) => !o && dismiss()}
      title={pending?.type === 'unknown' ? 'Kata tidak ada di dataset' : 'Pastikan kata yang dimaksud'}
      description={
        pending?.type === 'unknown'
          ? `“${pending.word}” tidak ditemukan di kosakata bawaan. Catat sebagai kata khusus yang sudah dipakai?`
          : pending
            ? `Terdengar “${pending.heard}”. Pilih kata yang benar agar riwayat tidak salah catat.`
            : undefined
      }
      footer={
        <div className="flex justify-end">
          <Button onClick={dismiss}>Batal</Button>
        </div>
      }
    >
      {pending?.type === 'choices' ? (
        <ul className="space-y-2">
          {pending.choices.map((c) => (
            <li key={`${c.key}-${c.lang}`}>
              <Button className="h-auto w-full justify-between py-3 text-left" onClick={() => confirmChoice(c)}>
                <span className="text-lg font-bold">{c.word}</span>
                <span className="text-sm font-normal text-muted">{LANGUAGE_LABEL[c.lang]}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : pending?.type === 'unknown' ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            Kata khusus ini hanya dicatat sebagai terpakai. Untuk memasukkannya ke kosakata pencarian, tambahkan di
            panel Dataset.
          </p>
          {unknownLangs.map((l) => (
            <Button key={l} variant="primary" className="w-full" onClick={() => confirmUnknown(l)}>
              Catat sebagai kata {LANGUAGE_LABEL[l]}
            </Button>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}

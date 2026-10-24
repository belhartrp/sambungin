'use client';
import { useState } from 'react';
import { Trash2, Undo2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LANGUAGE_LABEL } from '@/lib/types';
import { useApp } from '@/store/app';
import { ConfirmDialog } from './ConfirmDialog';

const timeFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });

export function HistoryPanel() {
  const used = useApp((s) => s.used);
  const enabled = useApp((s) => s.settings.historyEnabled);
  const persistence = useApp((s) => s.settings.persistence);
  const language = useApp((s) => s.settings.language);
  const undo = useApp((s) => s.undo);
  const remove = useApp((s) => s.removeUsed);
  const clear = useApp((s) => s.clearUsed);
  const [all, setAll] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const recent = [...used].reverse();
  const shown = all ? recent : recent.slice(0, 8);

  return (
    <section aria-labelledby="hist-title" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="hist-title" className="text-base font-bold">
            Sudah pernah
          </h2>
          <p className="tabular text-sm text-muted">{used.length} kata terpakai</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={undo} disabled={used.length === 0} aria-label="Batalkan penandaan terakhir">
            <Undo2 size={15} aria-hidden /> Urungkan
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setConfirm(true)} disabled={used.length === 0} aria-label="Hapus semua riwayat">
            <Trash2 size={16} aria-hidden />
          </Button>
        </div>
      </div>

      {!enabled ? (
        <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm text-muted">
          Pencatatan kata dimatikan. Kata baru tidak dicatat, riwayat yang ada tetap berlaku.
        </p>
      ) : null}

      {used.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Belum ada kata terpakai. Tandai kata yang baru dimainkan agar tidak direkomendasikan lagi.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {shown.map((u) => (
            <li key={u.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.word}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span className="tabular">{timeFmt.format(u.at)}</span>
                  {language === 'mixed' ? <Badge>{LANGUAGE_LABEL[u.lang]}</Badge> : null}
                  {!u.inDataset ? <Badge tone="outline">Kata khusus</Badge> : null}
                  {u.via === 'voice' ? <span>suara</span> : null}
                </p>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(u.id)} aria-label={`Hapus ${u.word} dari riwayat`}>
                <X size={16} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {used.length > 8 ? (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setAll((v) => !v)}>
          {all ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${used.length})`}
        </Button>
      ) : null}

      <p className="mt-3 text-xs text-muted">
        {persistence === 'local'
          ? 'Tersimpan di browser dan perangkat ini sampai Anda menghapusnya.'
          : 'Hanya untuk sesi ini. Riwayat hilang saat tab ditutup.'}
      </p>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Hapus seluruh riwayat?"
        description={`${used.length} kata terpakai akan dihapus dan kembali muncul di rekomendasi.`}
        confirmLabel="Hapus riwayat"
        onConfirm={clear}
      />
    </section>
  );
}

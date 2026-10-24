'use client';
import { useId, useState } from 'react';
import { RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { useSpeechSupported } from '@/hooks/useSpeechSupported';
import type { Persistence, ViewMode } from '@/lib/settings';
import type { LanguageMode, Language, Tier } from '@/lib/types';
import { useApp } from '@/store/app';
import { ConfirmDialog } from './ConfirmDialog';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-4 first:pt-0 last:border-b-0">
      <h3 className="mb-1 text-base font-bold">{title}</h3>
      <div className="divide-y divide-line/70">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
  stack,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  stack?: boolean;
}) {
  const id = useId();
  return (
    <div className={stack ? 'space-y-2 py-3' : 'flex items-center justify-between gap-4 py-3'}>
      <div className="min-w-0">
        <p id={id} className="text-[15px] font-medium">
          {label}
        </p>
        {hint ? <p className="mt-0.5 text-sm text-muted">{hint}</p> : null}
      </div>
      <div className="shrink-0" role="group" aria-labelledby={id}>
        {children}
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <label htmlFor={id} className={disabled ? 'min-w-0 opacity-60' : 'min-w-0 cursor-pointer'}>
        <span className="block text-[15px] font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-sm text-muted">{hint}</span> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

const TIER_OPTIONS = [
  { value: '1', label: 'Dasar' },
  { value: '2', label: 'Umum' },
  { value: '3', label: 'Luas' },
] as const;

export function SettingsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const s = useApp((st) => st.settings);
  const used = useApp((st) => st.used.length);
  const patch = useApp((st) => st.patchSettings);
  const patchStrategy = useApp((st) => st.patchStrategy);
  const patchRule = useApp((st) => st.patchRule);
  const reset = useApp((st) => st.resetSettings);
  const undo = useApp((st) => st.undo);
  const clearUsed = useApp((st) => st.clearUsed);

  const supported = useSpeechSupported();
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const st = s.strategy;
  const voiceOn = s.voiceInput && supported;

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title="Pengaturan"
        description="Setiap pilihan langsung berlaku dan tersimpan di browser ini."
        footer={
          <Button variant="ghost" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={16} aria-hidden /> Pulihkan pengaturan bawaan
          </Button>
        }
      >
        <Section title="Bahasa dan pencarian">
          <Row label="Bahasa kosakata" hint="Memengaruhi pencarian, jumlah hasil, strategi, dan penandaan kata." stack>
            <Segmented<LanguageMode>
              label="Bahasa kosakata"
              value={s.language}
              onChange={(v) => patch({ language: v })}
              options={[
                { value: 'id', label: 'Indonesia' },
                { value: 'en', label: 'English' },
                { value: 'mixed', label: 'Campuran' },
              ]}
            />
          </Row>
          <Toggle
            label="Input suara"
            checked={s.voiceInput}
            onChange={(v) => patch({ voiceInput: v })}
            disabled={!supported}
            hint={
              supported
                ? 'Memakai pengenalan suara bawaan browser. Layanan suara browser punya kebijakan privasinya sendiri; Sambungin tidak merekam atau menyimpan suara.'
                : 'Browser ini tidak mendukung pengenalan suara. Gunakan Chrome atau Edge untuk fitur ini.'
            }
          />
          <Toggle
            label="Input manual"
            checked={s.manualInput || !voiceOn}
            onChange={(v) => patch({ manualInput: v })}
            disabled={!voiceOn}
            hint="Selalu aktif bila suara mati atau tidak tersedia, agar Anda tetap bisa mengetik."
          />
          {s.language === 'mixed' ? (
            <Row
              label="Bahasa pengenalan suara"
              hint="Browser hanya mengenali satu bahasa per sesi suara, jadi pilih bahasa yang akan Anda ucapkan."
              stack
            >
              <Segmented<Language>
                label="Bahasa pengenalan suara"
                value={s.voiceLangMixed}
                onChange={(v) => patch({ voiceLangMixed: v })}
                options={[
                  { value: 'id', label: 'Indonesia' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </Row>
          ) : null}
          <Toggle
            label="Dengarkan terus-menerus"
            checked={s.voiceContinuous}
            onChange={(v) => patch({ voiceContinuous: v })}
            disabled={!voiceOn}
            hint="Mikrofon tetap aktif untuk beberapa ucapan. Browser dapat menghentikannya sendiri bila sunyi."
          />
          <Toggle
            label="Perintah suara"
            checked={s.voiceCommands}
            onChange={(v) => patch({ voiceCommands: v })}
            disabled={!voiceOn}
            hint="Ucapkan “tandai [kata]”, “cari [huruf]”, “batalkan”, atau “hapus”. Matikan bila Anda mencari awalan yang sama dengan kata perintah."
          />
          <Toggle
            label="Kenali nama huruf"
            checked={s.voiceSpelling}
            onChange={(v) => patch({ voiceSpelling: v })}
            disabled={!voiceOn}
            hint="“be”, “ce”, “bee”, “see” dibaca sebagai b dan c. Matikan bila Anda mengucapkan awalan utuh seperti “es”."
          />
          <Row
            label="Aturan sambungan"
            hint={
              s.rule.mode === 'auto'
                ? 'Awalan mengikuti huruf yang Anda masukkan, dan lawan menyambung sepanjang itu juga.'
                : 'Selalu menyambung N huruf terakhir. Anda boleh memasukkan kata lawan utuh.'
            }
            stack
          >
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<'auto' | 'fixed'>
                label="Aturan sambungan"
                value={s.rule.mode}
                onChange={(v) => patchRule({ mode: v })}
                options={[
                  { value: 'auto', label: 'Otomatis' },
                  { value: 'fixed', label: 'Tetap' },
                ]}
              />
              {s.rule.mode === 'fixed' ? (
                <Segmented<'1' | '2' | '3' | '4'>
                  label="Jumlah huruf yang disambung"
                  value={String(Math.min(4, s.rule.fixedLength)) as '1' | '2' | '3' | '4'}
                  onChange={(v) => patchRule({ fixedLength: Number(v) })}
                  options={[
                    { value: '1', label: '1 huruf' },
                    { value: '2', label: '2' },
                    { value: '3', label: '3' },
                    { value: '4', label: '4' },
                  ]}
                />
              ) : null}
            </div>
          </Row>
          <Row label="Cakupan kata" hint="Tingkat kata yang boleh muncul sebagai kandidat. “Luas” memuat kata jarang." stack>
            <Segmented<'1' | '2' | '3'>
              label="Cakupan kata"
              value={String(s.searchTier) as '1' | '2' | '3'}
              onChange={(v) => patch({ searchTier: Number(v) as Tier })}
              options={[...TIER_OPTIONS]}
            />
          </Row>
          <Toggle
            label="Kata populer dan tidak baku"
            hint="Percakapan sehari-hari, istilah populer, dan singkatan dari daftar kurasi."
            checked={s.includeInformal}
            onChange={(v) => patch({ includeInformal: v })}
          />
          <Toggle
            label="Nama tempat"
            hint="Negara, kota, dan wilayah dari daftar kurasi."
            checked={s.includeNames}
            onChange={(v) => patch({ includeNames: v })}
          />
        </Section>

        <Section title="Tampilan">
          <Row label="Penyajian hasil" hint="Hanya mengubah tampilan, bukan hasil algoritma." stack>
            <Segmented<ViewMode>
              label="Penyajian hasil"
              value={s.view}
              onChange={(v) => patch({ view: v })}
              options={[
                { value: 'single', label: 'Satu tabel' },
                { value: 'split', label: 'Tabel terpisah' },
              ]}
            />
          </Row>
          <Toggle
            label="Label bahasa"
            hint="Kolom bahasa pada satu tabel, dan label pada rekomendasi."
            checked={s.showLanguageLabel}
            onChange={(v) => patch({ showLanguageLabel: v })}
          />
          <Toggle
            label="Akhiran"
            hint="Kolom akhiran dan sorotan huruf yang harus disambung lawan."
            checked={s.showEnding}
            onChange={(v) => patch({ showEnding: v })}
          />
          <Toggle label="Skor strategi" checked={s.showScore} onChange={(v) => patch({ showScore: v })} />
          <Toggle
            label="Kolom tingkat kesulitan"
            hint="Buntu, sangat sulit, sulit, sedang, atau mudah."
            checked={s.showStrategyColumn}
            onChange={(v) => patch({ showStrategyColumn: v })}
          />
        </Section>

        <Section title="Strategi">
          <Toggle
            label="Rekomendasi menyulitkan lawan"
            hint="Mengurutkan kata menurut skor heuristik. Bila dimatikan, hasil diurutkan alfabetis tanpa skor."
            checked={st.enabled}
            onChange={(v) => patchStrategy({ enabled: v })}
          />
          <Toggle
            label="Filter kata yang sudah digunakan"
            hint="Kata terpakai disembunyikan dan tidak dihitung sebagai pilihan lanjutan lawan."
            checked={s.excludeUsed}
            onChange={(v) => patch({ excludeUsed: v })}
          />
          <Toggle
            label="Prioritas akhiran sulit"
            hint="Akhiran dengan sedikit kata lanjutan mendapat skor lebih tinggi."
            checked={st.prioritizeHardEndings}
            onChange={(v) => patchStrategy({ prioritizeHardEndings: v })}
            disabled={!st.enabled}
          />
          <Toggle
            label="Utamakan kata yang pasti valid"
            hint="Kata umum diutamakan dibanding kata jarang, tidak baku, atau singkatan."
            checked={st.preferValidWords}
            onChange={(v) => patchStrategy({ preferValidWords: v })}
            disabled={!st.enabled}
          />
          <Toggle
            label="Pertimbangkan panjang kata"
            checked={st.considerLength}
            onChange={(v) => patchStrategy({ considerLength: v })}
            disabled={!st.enabled}
          />
          {st.enabled && st.considerLength ? (
            <Row label="Preferensi panjang" stack>
              <Segmented<'longer' | 'shorter'>
                label="Preferensi panjang kata"
                value={st.lengthPreference}
                onChange={(v) => patchStrategy({ lengthPreference: v })}
                options={[
                  { value: 'longer', label: 'Lebih panjang' },
                  { value: 'shorter', label: 'Lebih pendek' },
                ]}
              />
            </Row>
          ) : null}
          <Toggle
            label="Tampilkan jumlah kemungkinan kelanjutan"
            hint="Jumlah kata yang masih bisa dipakai lawan untuk menyambung."
            checked={st.showContinuation}
            onChange={(v) => patchStrategy({ showContinuation: v })}
          />
          <Row
            label="Perkiraan kosakata lawan"
            hint="Kata yang dihitung sebagai pilihan lawan. “Umum” cocok untuk pemain biasa; “Luas” mengandaikan lawan hafal kata jarang."
            stack
          >
            <Segmented<'1' | '2' | '3'>
              label="Perkiraan kosakata lawan"
              value={String(s.opponentTier) as '1' | '2' | '3'}
              onChange={(v) => patch({ opponentTier: Number(v) as Tier })}
              options={[...TIER_OPTIONS]}
            />
          </Row>
        </Section>

        <Section title="Riwayat">
          <Toggle
            label="Aktifkan pencatatan kata"
            hint="Bila mati, kata baru tidak dicatat. Riwayat yang sudah ada tidak dihapus."
            checked={s.historyEnabled}
            onChange={(v) => patch({ historyEnabled: v })}
          />
          <Row
            label="Penyimpanan riwayat"
            hint={
              s.persistence === 'local'
                ? 'Tersimpan di IndexedDB browser dan perangkat ini sampai Anda menghapusnya. Tidak tersinkron ke perangkat lain.'
                : 'Hanya selama tab ini terbuka (bertahan saat dimuat ulang). Berpindah ke penyimpanan lokal menyalin riwayat saat ini.'
            }
            stack
          >
            <Segmented<Persistence>
              label="Penyimpanan riwayat"
              value={s.persistence}
              onChange={(v) => patch({ persistence: v })}
              options={[
                { value: 'session', label: 'Sesi ini saja' },
                { value: 'local', label: 'Simpan lokal' },
              ]}
            />
          </Row>
          <Toggle
            label="Kata terpakai berlaku lintas bahasa"
            hint="Kata yang sama di dua bahasa (mis. “hotel”) dianggap satu kata terpakai."
            checked={s.usedAcrossLanguages}
            onChange={(v) => patch({ usedAcrossLanguages: v })}
          />
          <Row label="Kelola riwayat" hint={`${used} kata tercatat.`}>
            <div className="flex gap-2">
              <Button size="sm" onClick={undo} disabled={used === 0}>
                <Undo2 size={15} aria-hidden /> Urungkan
              </Button>
              <Button size="sm" variant="danger" onClick={() => setConfirmClear(true)} disabled={used === 0}>
                <Trash2 size={15} aria-hidden /> Reset
              </Button>
            </div>
          </Row>
        </Section>
      </Drawer>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Hapus seluruh riwayat?"
        description={`${used} kata terpakai akan dihapus.`}
        confirmLabel="Hapus riwayat"
        onConfirm={clearUsed}
      />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Pulihkan pengaturan bawaan?"
        description="Semua pengaturan kembali ke nilai awal. Riwayat dan kata khusus tidak terpengaruh."
        confirmLabel="Pulihkan"
        onConfirm={reset}
      />
    </>
  );
}

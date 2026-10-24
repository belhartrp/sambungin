'use client';
import { useEffect, useRef, useState } from 'react';
import { FileUp, Plus, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import type { BrowseResult, DatasetStats } from '@/lib/engine';
import { formatCount } from '@/lib/strategy';
import {
  KIND_LABEL,
  LANGUAGE_LABEL,
  TIER_LABEL,
  type KindCode,
  type Language,
  type Tier,
} from '@/lib/types';
import { checkFileMeta, parseWordFile, type ImportReport } from '@/lib/wordImport';
import { useApp, type ImportSummary } from '@/store/app';
import { ConfirmDialog } from './ConfirmDialog';

type Tab = 'summary' | 'browse' | 'custom';

const SOURCE_SHORT: Record<Language, Record<number, string>> = {
  id: { 1: 'Hunspell', 2: 'Korpus', 4: 'Kurasi' },
  en: { 1: 'SCOWL', 2: 'dwyl', 4: 'word-list', 8: 'Kurasi' },
};

function sourceText(lang: Language, bits: number): string {
  return Object.entries(SOURCE_SHORT[lang])
    .filter(([bit]) => bits & Number(bit))
    .map(([, name]) => name)
    .join(', ');
}

export function DatasetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>('summary');
  const customCount = useApp((s) => s.custom.length);

  return (
    <Modal
      wide
      open={open}
      onOpenChange={onOpenChange}
      title="Dataset kosakata"
      description="Sumber, cakupan, dan kata khusus milik Anda."
    >
      <div className="mb-4">
        <Segmented<Tab>
          label="Bagian dataset"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'summary', label: 'Ringkasan' },
            { value: 'browse', label: 'Jelajah' },
            { value: 'custom', label: `Kata khusus${customCount ? ` (${customCount})` : ''}` },
          ]}
        />
      </div>
      {tab === 'summary' ? <Summary active={open} /> : null}
      {tab === 'browse' ? <Browse /> : null}
      {tab === 'custom' ? <Custom /> : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------ Ringkasan */

function Summary({ active }: { active: boolean }) {
  const dataset = useApp((s) => s.dataset);
  const manifest = useApp((s) => s.manifest);
  const customCount = useApp((s) => s.custom.length);
  const datasetStats = useApp((s) => s.datasetStats);
  const retry = useApp((s) => s.retryDataset);
  const [stats, setStats] = useState<DatasetStats | null>(null);

  useEffect(() => {
    if (!active || dataset.status !== 'ready') return;
    let live = true;
    void datasetStats().then((s) => live && setStats(s));
    return () => {
      live = false;
    };
  }, [active, dataset.status, customCount, datasetStats]);

  return (
    <div className="space-y-5 text-[15px]">
      <div className="flex flex-wrap items-center gap-3">
        {dataset.status === 'ready' ? (
          <Badge tone="ok">Siap</Badge>
        ) : dataset.status === 'error' ? (
          <Badge tone="bad">Gagal dimuat</Badge>
        ) : (
          <Badge tone="accent">Memuat {Math.round(dataset.fraction * 100)}%</Badge>
        )}
        <span className="text-sm text-muted">
          Mesin berjalan di {dataset.engineMode === 'worker' ? 'Web Worker (UI tidak terblokir)' : 'thread utama (Worker tidak tersedia)'}.
          {manifest ? ` Versi dataset ${manifest.version}.` : ''}
        </span>
        {dataset.status === 'error' ? (
          <Button size="sm" variant="danger" onClick={retry}>
            Coba lagi
          </Button>
        ) : null}
      </div>
      {dataset.status === 'error' ? <p className="text-bad">{dataset.message}</p> : null}

      {stats ? (
        <div className="grid gap-3 md:grid-cols-2">
          {(['id', 'en'] as Language[]).map((l) => {
            const s = stats.byLang[l];
            return (
              <div key={l} className="rounded-xl border border-line p-4">
                <p className="font-bold">Kosakata {LANGUAGE_LABEL[l]}</p>
                <p className="tabular text-2xl font-bold">{formatCount(s.total)}</p>
                <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                  {(Object.keys(s.byKind) as KindCode[])
                    .filter((k) => s.byKind[k] > 0)
                    .map((k) => (
                      <div key={k} className="contents">
                        <dt className="text-muted">{KIND_LABEL[k]}</dt>
                        <dd className="tabular text-right">{formatCount(s.byKind[k])}</dd>
                      </div>
                    ))}
                  {([1, 2, 3] as Tier[]).map((t) => (
                    <div key={`t${t}`} className="contents">
                      <dt className="text-muted">Tingkat {TIER_LABEL[t].toLowerCase()}</dt>
                      <dd className="tabular text-right">{formatCount(s.byTier[t])}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 font-bold">Sumber dan lisensi</h3>
        {manifest ? (
          <ul className="space-y-2">
            {manifest.sources.map((src) => (
              <li key={`${src.lang}-${src.bit}`} className="rounded-xl border border-line p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge>{LANGUAGE_LABEL[src.lang]}</Badge>
                  <span className="font-medium">{src.name}</span>
                </p>
                <p className="mt-1 text-muted">{src.usage}</p>
                <p className="mt-1">
                  Lisensi: <span className="font-medium">{src.license}</span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Manifest dataset belum dimuat.</p>
        )}
      </div>

      <div className="space-y-2 rounded-xl bg-canvas p-4 text-sm text-muted">
        <p className="font-bold text-ink">Cakupan bergantung pada sumber</p>
        <p>
          Kosakata Indonesia lebih kecil daripada Inggris: kamus dasarnya ditambah bentuk berimbuhan yang terbukti
          muncul di teks nyata. Bentuk berimbuhan langka dan nama orang dapat belum tercakup. Gunakan tab “Kata
          khusus” untuk menambah atau mengimpor daftar sendiri.
        </p>
        <p>
          Dataset bawaan tidak dapat diubah dari aplikasi. Kata khusus disimpan terpisah di browser ini dan tidak
          mengubah dataset bawaan.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- Jelajah */

function Browse() {
  const dataset = useApp((s) => s.dataset);
  const browse = useApp((s) => s.browseDataset);
  const customCount = useApp((s) => s.custom.length);
  const [lang, setLang] = useState<'all' | Language>('all');
  const [mode, setMode] = useState<'prefix' | 'contains'>('prefix');
  const [query, setQuery] = useState('');
  const [customOnly, setCustomOnly] = useState(false);
  const [res, setRes] = useState<BrowseResult | null>(null);

  useEffect(() => {
    if (dataset.status !== 'ready') return;
    let live = true;
    const t = setTimeout(() => {
      void browse({ lang, query, mode, limit: 200, customOnly }).then((r) => live && setRes(r));
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [dataset.status, browse, lang, mode, query, customOnly, customCount]);

  if (dataset.status !== 'ready') {
    return <p className="text-sm text-muted">Dataset belum siap. Pratinjau tersedia setelah dataset dimuat.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={mode === 'prefix' ? 'Awalan, mis. ab' : 'Bagian kata, mis. sol'}
          aria-label="Cari di dataset"
          autoCapitalize="none"
          spellCheck={false}
          className="h-10 min-w-0 flex-1 rounded-xl border border-line-strong px-3 text-[15px] outline-none focus:border-accent"
        />
        <Segmented<'prefix' | 'contains'>
          label="Jenis pencarian"
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'prefix', label: 'Awalan' },
            { value: 'contains', label: 'Mengandung' },
          ]}
        />
        <Segmented<'all' | Language>
          label="Bahasa"
          size="sm"
          value={lang}
          onChange={setLang}
          options={[
            { value: 'all', label: 'Semua' },
            { value: 'id', label: 'ID' },
            { value: 'en', label: 'EN' },
          ]}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={customOnly} onChange={(e) => setCustomOnly(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
        Hanya kata khusus
      </label>

      {res ? (
        <>
          <p className="tabular text-sm text-muted">
            {formatCount(res.total)}
            {res.capped ? '+' : ''} kata cocok{res.total > res.rows.length ? `, menampilkan ${res.rows.length} pertama` : ''}.
          </p>
          {res.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
              Tidak ada kata yang cocok.
            </p>
          ) : (
            <ul className="scroll-thin max-h-[22rem] divide-y divide-line overflow-auto rounded-xl border border-line">
              {res.rows.map((r) => (
                <li key={`${r.lang}-${r.word}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="min-w-[8rem] font-medium">{r.word}</span>
                  <Badge>{LANGUAGE_LABEL[r.lang]}</Badge>
                  <Badge tone="outline">{KIND_LABEL[r.kind]}</Badge>
                  {r.kind !== 'c' ? <Badge tone="outline">Tingkat {TIER_LABEL[r.tier].toLowerCase()}</Badge> : null}
                  {r.kind !== 'c' ? <span className="text-xs text-muted">Sumber: {sourceText(r.lang, r.src) || '-'}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Kata khusus */

function Custom() {
  const custom = useApp((s) => s.custom);
  const language = useApp((s) => s.settings.language);
  const ready = useApp((s) => s.dataset.status === 'ready');
  const addCustomWord = useApp((s) => s.addCustomWord);
  const removeCustomWord = useApp((s) => s.removeCustomWord);
  const importCustomWords = useApp((s) => s.importCustomWords);
  const clearCustomWords = useApp((s) => s.clearCustomWords);

  const defaultLang: Language = language === 'en' ? 'en' : 'id';
  const [word, setWord] = useState('');
  const [lang, setLang] = useState<Language>(defaultLang);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [report, setReport] = useState<(ImportReport & { fileName: string }) | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importLang, setImportLang] = useState<Language>(defaultLang);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rawText = useRef<{ text: string; name: string } | null>(null);

  const add = async (): Promise<void> => {
    const r = await addCustomWord(word, lang);
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok) setWord('');
  };

  const readFile = async (file: File): Promise<void> => {
    setSummary(null);
    setReport(null);
    const err = checkFileMeta(file);
    setFileError(err);
    if (err) return;
    const text = await file.text();
    rawText.current = { text, name: file.name };
    setReport({ ...parseWordFile(text, importLang), fileName: file.name });
  };

  // Mengganti bahasa bawaan impor menguraikan ulang file yang sama.
  useEffect(() => {
    if (!rawText.current) return;
    setReport({ ...parseWordFile(rawText.current.text, importLang), fileName: rawText.current.name });
  }, [importLang]);

  const doImport = async (): Promise<void> => {
    if (!report || report.valid.length === 0) return;
    setSummary(await importCustomWords(report.valid));
    setReport(null);
    rawText.current = null;
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="font-bold">Tambah kata</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={word}
            onChange={(e) => {
              setWord(e.target.value);
              setMessage(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            placeholder="Kata baru, mis. cuan"
            aria-label="Kata khusus baru"
            autoCapitalize="none"
            spellCheck={false}
            className="h-10 min-w-0 flex-1 rounded-xl border border-line-strong px-3 text-[15px] outline-none focus:border-accent"
          />
          <Segmented<Language>
            label="Bahasa kata"
            size="sm"
            value={lang}
            onChange={setLang}
            options={[
              { value: 'id', label: 'Indonesia' },
              { value: 'en', label: 'English' },
            ]}
          />
          <Button variant="primary" disabled={!word.trim() || !ready} onClick={() => void add()}>
            <Plus size={16} aria-hidden /> Tambah
          </Button>
        </div>
        {message ? (
          <p role="status" className={message.ok ? 'text-sm text-ok' : 'text-sm text-bad'}>
            {message.text}
          </p>
        ) : null}
        <p className="text-sm text-muted">
          Satu kata saja; huruf, tanda hubung, dan apostrof diperbolehkan. Kata yang sudah ada di dataset bawaan ditolak
          agar tidak terhitung dua kali.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">Impor daftar kata</h3>
        <p className="text-sm text-muted">
          File .txt, .csv, atau .tsv (maksimal 5 MB). Satu kata per baris, atau “kata,bahasa” (id atau en). Baris
          berawalan # diabaikan. File diproses di browser Anda dan tidak dikirim ke server.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Language>
            label="Bahasa bawaan impor"
            size="sm"
            value={importLang}
            onChange={setImportLang}
            options={[
              { value: 'id', label: 'Bawaan: Indonesia' },
              { value: 'en', label: 'Bawaan: English' },
            ]}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,.tsv,text/plain,text/csv"
            aria-label="Pilih file daftar kata"
            className="sr-only"
            id="import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={!ready}>
            <FileUp size={16} aria-hidden /> Pilih file
          </Button>
        </div>
        {fileError ? <p role="alert" className="text-sm text-bad">{fileError}</p> : null}
        {report ? (
          <div className="space-y-2 rounded-xl border border-line p-3 text-sm">
            <p className="font-medium">{report.fileName}</p>
            <p>
              <span className="font-bold text-ok">{formatCount(report.valid.length)}</span> kata valid
              {report.duplicatesInFile > 0 ? `, ${formatCount(report.duplicatesInFile)} duplikat dalam file` : ''}
              {report.invalidCount > 0 ? `, ${formatCount(report.invalidCount)} tidak valid` : ''}
              {report.truncated ? '. Dibatasi 100.000 kata pertama' : ''}.
            </p>
            {report.invalid.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-muted">Lihat baris tidak valid</summary>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-muted">
                  {report.invalid.slice(0, 30).map((i) => (
                    <li key={`${i.line}-${i.value}`}>
                      Baris {i.line}: “{i.value}” ({i.reason})
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <Button variant="primary" disabled={report.valid.length === 0} onClick={() => void doImport()}>
              Impor {formatCount(report.valid.length)} kata
            </Button>
          </div>
        ) : null}
        {summary ? (
          <p role="status" className="text-sm">
            Diimpor: <strong>{formatCount(summary.added)}</strong> baru
            {summary.alreadyInDataset > 0 ? `, ${formatCount(summary.alreadyInDataset)} sudah ada di dataset bawaan` : ''}
            {summary.alreadyCustom > 0 ? `, ${formatCount(summary.alreadyCustom)} sudah ada di kata khusus` : ''}.
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Daftar kata khusus ({custom.length})</h3>
          <Button size="sm" variant="danger" disabled={custom.length === 0} onClick={() => setConfirmClear(true)}>
            <Trash2 size={15} aria-hidden /> Hapus semua
          </Button>
        </div>
        {custom.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">
            Belum ada kata khusus. Tambahkan nama, istilah, atau slang yang sering dipakai di permainan Anda.
          </p>
        ) : (
          <ul className="scroll-thin max-h-64 divide-y divide-line overflow-auto rounded-xl border border-line">
            {[...custom].reverse().slice(0, 300).map((c) => (
              <li key={`${c.lang}-${c.word}`} className="flex items-center gap-3 px-3 py-1.5">
                <span className="flex-1 font-medium">{c.word}</span>
                <Badge>{LANGUAGE_LABEL[c.lang]}</Badge>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Hapus ${c.word}`} onClick={() => removeCustomWord(c.word, c.lang)}>
                  <X size={16} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {custom.length > 300 ? <p className="text-sm text-muted">Menampilkan 300 terbaru dari {formatCount(custom.length)}.</p> : null}
        <p className="text-sm text-muted">
          Tersimpan di IndexedDB browser dan perangkat ini, tidak tersinkron ke perangkat lain.
        </p>
      </section>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Hapus semua kata khusus?"
        description={`${custom.length} kata khusus akan dihapus dari browser ini.`}
        confirmLabel="Hapus semua"
        onConfirm={clearCustomWords}
      />
    </div>
  );
}

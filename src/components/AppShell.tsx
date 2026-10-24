'use client';
import { useEffect, useState } from 'react';
import { useApp } from '@/store/app';
import { ConfirmMarkDialog } from './ConfirmMarkDialog';
import { DatasetDialog } from './DatasetDialog';
import { Header } from './Header';
import { HistoryPanel } from './HistoryPanel';
import { InputPanel } from './InputPanel';
import { Recommendations } from './Recommendations';
import { ResultsSection } from './ResultsSection';
import { SettingsDrawer } from './SettingsDrawer';
import { SummaryBar } from './SummaryBar';
import { Toaster } from './Toaster';

export function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [datasetOpen, setDatasetOpen] = useState(false);

  useEffect(() => {
    void useApp.getState().bootstrap();
  }, []);

  return (
    <div className="min-h-dvh">
      <Header onSettings={() => setSettingsOpen(true)} onDataset={() => setDatasetOpen(true)} />

      <main className="mx-auto grid max-w-[78rem] gap-5 px-3 pb-6 pt-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Ponsel: panel input menempel di bawah layar agar mikrofon dan kolom ketik mudah dijangkau. */}
          <div className="order-last sticky bottom-0 z-20 -mx-3 border-t border-line bg-canvas px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:static md:order-first md:mx-0 md:border-0 md:bg-transparent md:p-0">
            <InputPanel />
          </div>
          <SummaryBar />
          <Recommendations />
          <ResultsSection />
        </div>

        <aside className="lg:sticky lg:top-[4.5rem] lg:self-start">
          <HistoryPanel />
        </aside>
      </main>

      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />
      <DatasetDialog open={datasetOpen} onOpenChange={setDatasetOpen} />
      <ConfirmMarkDialog />
      <Toaster />
    </div>
  );
}

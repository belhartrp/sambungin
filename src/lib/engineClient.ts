import {
  EngineHost,
  type EngineRequest,
  type EngineResponseMap,
  type WorkerMessage,
} from './engineHost';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/**
 * Klien mesin. Jalur utama adalah Web Worker. Bila Worker tidak tersedia atau gagal dibuat
 * (mis. lingkungan yang membatasinya), mesin yang sama dijalankan di thread utama dan
 * pengguna diberi tahu lewat `mode`.
 */
export class EngineClient {
  private worker: Worker | null = null;
  private inline: EngineHost | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private progressListeners = new Set<(fraction: number, stage: 'download' | 'parse') => void>();

  /** 'worker' bila berjalan di Web Worker, 'inline' bila di thread utama. */
  mode: 'worker' | 'inline' = 'worker';

  constructor() {
    this.start();
  }

  private start(): void {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('../workers/engine.worker.ts', import.meta.url), {
          type: 'module',
        });
        this.worker.onmessage = (ev: MessageEvent<WorkerMessage>) => this.onMessage(ev.data);
        this.worker.onerror = () => this.fallbackToInline();
        return;
      } catch {
        /* jatuh ke inline */
      }
    }
    this.fallbackToInline();
  }

  private fallbackToInline(): void {
    this.worker?.terminate();
    this.worker = null;
    this.inline = new EngineHost();
    this.mode = 'inline';
    // Permintaan yang menggantung pada worker yang gagal tidak dapat dipulihkan.
    for (const [, p] of this.pending) p.reject(new Error('Worker mesin gagal; beralih ke mode inline.'));
    this.pending.clear();
  }

  private onMessage(msg: WorkerMessage): void {
    if (msg.kind === 'progress') {
      this.progressListeners.forEach((fn) => fn(msg.fraction, msg.stage));
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.payload);
    else p.reject(new Error(msg.error));
  }

  onProgress(fn: (fraction: number, stage: 'download' | 'parse') => void): () => void {
    this.progressListeners.add(fn);
    return () => this.progressListeners.delete(fn);
  }

  request<T extends EngineRequest['type']>(req: Extract<EngineRequest, { type: T }>): Promise<EngineResponseMap[T]> {
    if (this.inline) {
      const host = this.inline;
      return host
        .handle(req, (f, s) => this.progressListeners.forEach((fn) => fn(f, s)))
        .then((r) => r.payload as EngineResponseMap[T]);
    }
    const id = ++this.seq;
    return new Promise<EngineResponseMap[T]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker!.postMessage({ id, req });
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}

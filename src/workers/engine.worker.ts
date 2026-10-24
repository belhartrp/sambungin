/// <reference lib="webworker" />
import { EngineHost, type EngineRequest, type WorkerMessage } from '../lib/engineHost';

/**
 * Worker mesin pencarian. Seluruh dataset dimuat, diindeks, dan dihitung di sini sehingga
 * thread UI tidak pernah terblokir saat pencarian atau penghitungan strategi.
 */

const host = new EngineHost();
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (ev: MessageEvent<{ id: number; req: EngineRequest }>) => {
  const { id, req } = ev.data;
  try {
    const { payload, transfer } = await host.handle(req, (fraction, stage) => {
      const msg: WorkerMessage = { kind: 'progress', fraction, stage };
      scope.postMessage(msg);
    });
    const msg: WorkerMessage = { kind: 'response', id, ok: true, payload };
    scope.postMessage(msg, transfer);
  } catch (err) {
    const msg: WorkerMessage = {
      kind: 'response',
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    scope.postMessage(msg);
  }
};

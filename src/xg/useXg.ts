import { useEffect, useRef, useState } from 'react';
import type { Request, Response, Snapshot } from './analysis';

/** One in-flight job, one latest snapshot; no unbounded queue during playback. */
export function useXg(snapshot: Snapshot, heatmap: boolean, enabled: boolean) {
  const [result, setResult] = useState<Response | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([snapshot, heatmap]);
  const latest = useRef<Request>({ key, snapshot, heatmap });
  latest.current = { key, snapshot, heatmap };
  useEffect(() => {
    setResult(null); setError('');
    if (!enabled) return;
    let worker: Worker;
    try { worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }); }
    catch { setError('解析Workerを開始できません。ブラウザの設定を確認してください。'); return; }
    let busy = false, failed = false, sent = '', active = true;
    const base = new URL(`${import.meta.env.BASE_URL}models/adamsaidane/`, document.baseURI).href;
    const pump = () => {
      if (!active || failed || busy || sent === latest.current.key) return;
      busy = true; sent = latest.current.key;
      worker.postMessage({ ...latest.current, base });
    };
    worker.onmessage = (event: MessageEvent<{ result?: Response; error?: string }>) => {
      if (!active) return;
      busy = false;
      if (event.data.error) { failed = true; setError(event.data.error); setResult(null); }
      else if (event.data.result) setResult(event.data.result);
    };
    worker.onerror = () => { if (active) { failed = true; busy = false; setError('xG解析Workerでエラーが発生しました。再試行してください。'); setResult(null); } };
    pump();
    const timer = window.setInterval(pump, 120);
    return () => { active = false; window.clearInterval(timer); worker.terminate(); };
  }, [enabled, attempt]);
  // Never display a score for the opposite attack direction. Other stale results
  // are explicitly labelled with their analysed time while the next job runs.
  const visible = enabled && result?.team === snapshot.team ? result : null;
  return { result: visible, error, updating: enabled && !error && visible?.key !== key, retry: () => setAttempt(n => n + 1) };
}

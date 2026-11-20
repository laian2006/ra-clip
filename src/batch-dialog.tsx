import { useEffect, useRef, useState } from 'react';
import { CircleAlert, ScanLine } from 'lucide-react';
import { fold } from './claims';
import type { Clip } from './domain';
import { scanLabels } from './domain';
import type { ScanOptions } from './media';
import { lastScanDetail, lastScanLabel, needsScan, type BatchEvent } from './batch';
import { Modal } from './ui';

const labels = { ...scanLabels, running: 'Đang quét', stopped: 'Đã dừng' };
const limit = 20;

function elapsedLabel(seconds: number) {
  return seconds < 60 ? `${seconds} giây` : `${Math.floor(seconds / 60)} phút ${seconds % 60} giây`;
}

export function BatchDialog({ clips, initialClipId, onRun, onClose }: {
  clips: Clip[]; initialClipId?: string;
  onRun: (ids: string[], options: ScanOptions, signal: AbortSignal, onEvent: (event: BatchEvent) => void) => Promise<void>;
  onClose: () => void;
}) {
  const videos = clips.filter(clip => clip.localMedia || clip.demoMedia);
  const [selected, setSelected] = useState(() => new Set(initialClipId
    ? videos.filter(clip => clip.id === initialClipId).map(clip => clip.id)
    : videos.filter(clip => needsScan(clip)).slice(0, limit).map(clip => clip.id)));
  const [events, setEvents] = useState<Record<string, BatchEvent>>({});
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'both' | 'audio' | 'frame'>('both');
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [announced, setAnnounced] = useState('');
  const [average, setAverage] = useState<number>();
  const [elapsed, setElapsed] = useState(0);
  const [clipElapsed, setClipElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const started = useRef(0);
  const clipStarted = useRef(0);
  const stopButton = useRef<HTMLButtonElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const options = { audio: mode !== 'frame', frame: mode !== 'audio' };
  const filtered = videos.filter(clip => fold(`${clip.title} ${clip.sku}`).includes(fold(query.trim())));
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((performance.now() - started.current) / 1000));
      setClipElapsed(Math.floor((performance.now() - clipStarted.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  function select(id: string, enabled: boolean) {
    setSelected(values => {
      const next = new Set(values);
      if (!enabled) next.delete(id);
      else if (next.size < limit) next.add(id);
      return next;
    });
  }

  async function run() {
    if (!selected.size || controller.current) return;
    const task = new AbortController();
    controller.current = task;
    const ids = videos.map(clip => clip.id).filter(id => selected.has(id));
    const finished = new Set<string>();
    let start = performance.now();
    let measured = 0;
    let measuredTime = 0;
    let currentId = '';
    started.current = start;
    clipStarted.current = start;
    setAverage(undefined);
    setElapsed(0);
    setClipElapsed(0);
    setRunning(true); setError(''); setEvents({}); setTotal(ids.length); setAnnounced(`Bắt đầu quét ${ids.length} video.`);
    requestAnimationFrame(() => stopButton.current?.focus());
    try {
      await onRun(ids, options, task.signal, event => {
        setEvents(values => ({ ...values, [event.id]: event }));
        if (event.state === 'running' && currentId !== event.id) {
          currentId = event.id;
          start = performance.now();
          clipStarted.current = start;
          setClipElapsed(0);
        }
        if (event.state !== 'running') {
          if (event.state !== 'stopped') {
            finished.add(event.id);
            if (event.state !== 'failed') {
              measured++;
              measuredTime += performance.now() - start;
            }
            if (measured) setAverage(Math.max(1, Math.ceil(measuredTime / measured / 1000)));
          }
          setAnnounced(`${videos.find(clip => clip.id === event.id)?.title ?? 'Video'} · ${labels[event.state]}`);
        }
      });
      if (task.signal.aborted) setSelected(new Set(ids.filter(id => !finished.has(id))));
      setAnnounced(task.signal.aborted ? 'Đã dừng. Các video hoàn tất đã được lưu.' : 'Đã hoàn tất lượt quét.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setRunning(false);
      controller.current = null;
      requestAnimationFrame(() => {
        if (startButton.current && !startButton.current.disabled) startButton.current.focus();
        else closeButton.current?.focus();
      });
    }
  }

  const done = Object.values(events).filter(event => event.state !== 'running' && event.state !== 'stopped').length;
  const runningVideo = Object.values(events).find(event => event.state === 'running');
  const remaining = average === undefined ? undefined
    : average * Math.max(0, total - done - Number(Boolean(runningVideo))) +
      (runningVideo ? Math.max(0, average - clipElapsed) : 0);
  return <Modal title="Quét video hàng loạt" detail="Chọn tối đa 20 file. App lưu kết quả từng video khi hoàn tất." busy={running} onClose={onClose}>
    <div className="dialog-form">
      <p className="hint-text">Dùng với video đã có file trong kho và các clip mẫu. Khi dừng, các video còn lại sẽ được giữ trong lựa chọn.</p>
      <div className="batch-options">
        <label className="stack-field">Nguồn phân tích<select value={mode} disabled={running} onChange={event => setMode(event.target.value as typeof mode)}>
          <option value="both">Lời thoại và chữ trong hình</option><option value="frame">Chỉ chữ trong hình</option><option value="audio">Chỉ lời thoại</option>
        </select></label>
        <label className="stack-field">Lọc video<input type="search" placeholder="Tên hoặc SKU" value={query} disabled={running}
          onChange={event => setQuery(event.target.value)} /></label>
      </div>
      <div className="batch-pick">
        <span>Đã chọn <strong>{selected.size}/{limit}</strong></span>
        <button className="text-button" type="button" disabled={running} onClick={() =>
          setSelected(new Set(videos.filter(clip => needsScan(clip, options)).slice(0, limit).map(clip => clip.id)))}>Chọn video cần quét</button>
        <button className="text-button" type="button" disabled={running} onClick={() =>
          setSelected(new Set(filtered.slice(0, limit).map(clip => clip.id)))}>Chọn video đang lọc</button>
        <button className="text-button" type="button" disabled={running || !selected.size} onClick={() => setSelected(new Set())}>Bỏ chọn</button>
      </div>
      {(running || done > 0) && <div className="batch-progress">
        <label htmlFor="batch-progress">Đã hoàn tất {done}/{total} video trong lượt này</label>
        <progress id="batch-progress" max={Math.max(1, total)} value={done} />
        {running && <>
          <p>Đã chạy {elapsedLabel(elapsed)}{average !== undefined && ` · Trung bình ${elapsedLabel(average)}/video`}</p>
          {runningVideo && <p className="batch-current"><strong>{videos.find(clip => clip.id === runningVideo.id)?.title}</strong> · {runningVideo.detail}</p>}
          {done < total && <p>{remaining === undefined ? 'Đang đo tốc độ từ video đầu tiên. Lần đầu có thể mất thêm thời gian tải mô hình.'
            : remaining > 0 ? `Còn khoảng ${elapsedLabel(remaining)} theo tốc độ đã đo.` : 'Video hiện tại cần thêm thời gian so với mức trung bình.'}</p>}
        </>}
      </div>}
      <ul className="batch-list">{filtered.map(clip => {
        const event = events[clip.id];
        return <li key={clip.id}>
          <label><input type="checkbox" checked={selected.has(clip.id)} disabled={running || (!selected.has(clip.id) && selected.size >= limit)}
            onChange={value => select(clip.id, value.target.checked)} /><span><strong>{clip.title}</strong><small>{clip.sku || 'Chưa gán SKU'}</small></span></label>
          <div><span className={`import-tag ${event?.state ?? clip.lastScan?.state ?? 'same'}`}>{event ? labels[event.state] : lastScanLabel(clip)}</span>
            {(event?.detail || lastScanDetail(clip)) && <small>{event?.detail || lastScanDetail(clip)}</small>}</div>
        </li>;
      })}</ul>
      {!filtered.length && <p className="empty-inline">Chưa có file video khớp bộ lọc.</p>}
      <span className="sr-only" role="status" aria-atomic="true">{announced}</span>
      {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}
      <div className="dialog-actions">
        {running ? <button ref={stopButton} className="button secondary" type="button" onClick={() => controller.current?.abort()}>Dừng lượt quét</button>
          : <><button ref={closeButton} className="button secondary" type="button" onClick={onClose}>Đóng</button>
            <button ref={startButton} className="button primary" type="button" disabled={!selected.size} onClick={() => void run()}><ScanLine size={16} /> Quét {selected.size} video</button></>}
      </div>
    </div>
  </Modal>;
}

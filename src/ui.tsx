import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, Check, CircleHelp, Clock4, FileVideo, ScanLine, X } from 'lucide-react';
import { kindLabels, timestamp, verdictLabels } from './domain';
import type { Clip, Finding, Verdict } from './domain';
import { demoAsset } from './demo';

export const verdictIcons = { action: AlertCircle, review: CircleHelp, dated: Clock4, clear: Check };

export function Brand() {
  return <div className="brand"><div className="brand-mark"><ScanLine size={23} strokeWidth={2.15} /></div><span>Rà Clip</span></div>;
}

export function Tag({ verdict }: { verdict: Verdict }) {
  const Icon = verdictIcons[verdict];
  return <span className={`tag ${verdict}`}><Icon size={13} /> {verdictLabels[verdict]}</span>;
}

export function Empty({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><FileVideo size={24} /></span>
    <strong>{title}</strong><p>{detail}</p>{children}
  </div>;
}

export function Modal({ title, detail, children, busy = false, onClose }: {
  title: string; detail?: string; children: ReactNode; busy?: boolean; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog
    className="dialog" ref={ref} aria-labelledby="dialog-heading"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (event.target === ref.current && !busy) onClose(); }}
  >
    <div className="dialog-inner">
      <div className="dialog-title">
        <div><h2 id="dialog-heading">{title}</h2>{detail && <p>{detail}</p>}</div>
        <button className="icon-button" type="button" title="Đóng" aria-label="Đóng" disabled={busy} onClick={onClose}><X size={19} /></button>
      </div>
      {children}
    </div>
  </dialog>;
}

export function ClipGlyph({ clip }: { clip: Clip }) {
  return <span className={`clip-glyph ${clip.demoMedia ? 'photo' : ''}`}>
    {clip.demoMedia ?
      <img alt="" src={`${demoAsset(clip)}.webp`} loading="lazy" /> :
      <FileVideo size={19} />}
  </span>;
}

export function FindingReason({ row }: { row: Finding }) {
  return <><span className="detail-kind">{kindLabels[row.kind]}</span>
    <span className="detail-value">{row.claim}</span>
    {row.evidence && <span className="small-time">{timestamp(row.evidence.start)}</span>}</>;
}

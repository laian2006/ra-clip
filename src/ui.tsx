import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AlertCircle, Check, CircleHelp, Clock4, FileVideo, ScanLine, X } from 'lucide-react';
import { version } from '../package.json';
import { kindLabels, timestamp, verdictLabels } from './domain';
import type { Clip, Finding, Verdict } from './domain';
import { demoAsset } from './demo';

export const verdictIcons = { action: AlertCircle, review: CircleHelp, dated: Clock4, clear: Check };

export function Brand() {
  return <div className="brand"><div className="brand-mark"><ScanLine size={23} strokeWidth={2.15} /></div>
    <span>Rà Clip<small className="brand-version">v{version}</small></span></div>;
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const detailId = useId();
  useEffect(() => {
    const element = ref.current!;
    const opener = document.activeElement;
    element.showModal();
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      requestAnimationFrame(() => {
        if (document.querySelector('dialog[open]')) return;
        if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
        else document.getElementById('page-heading')?.focus({ preventScroll: true });
      });
    };
  }, []);
  return <dialog
    className="dialog" ref={ref} aria-labelledby={headingId} aria-describedby={detail ? detailId : undefined}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (event.target === ref.current && !busy) onClose(); }}
  >
    <div className="dialog-inner">
      <div className="dialog-title">
        <div><h2 id={headingId} ref={titleRef} tabIndex={-1}>{title}</h2>{detail && <p id={detailId}>{detail}</p>}</div>
        <button className="icon-button" type="button" title="Đóng" aria-label="Đóng" disabled={busy} onClick={onClose}><X size={19} /></button>
      </div>
      {children}
    </div>
  </dialog>;
}

export function TableRegion({ label, children }: { label: string; children: ReactNode }) {
  return <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>{children}</div>;
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

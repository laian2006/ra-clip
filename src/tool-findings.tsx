import { CirclePlay } from 'lucide-react';
import { kindLabels, sourceLabels, timestamp } from './domain';
import type { Finding } from './domain';
import { Tag } from './ui';

export function ToolFindings({ findings, onEvidence }: {
  findings: Finding[]; onEvidence?: (finding: Finding) => void;
}) {
  return <ul className="tool-findings">
    {findings.map(row => <li key={row.id}>
      <div className="tool-finding-title"><Tag verdict={row.verdict} />
        <strong>{kindLabels[row.kind]} · {row.claim}</strong>
      </div>
      <p>{row.reason}</p>
      {row.reference && <p className="hint-text">Theo ưu đãi · {row.reference}</p>}
      {row.evidence && <blockquote>
        <div>
          {!row.evidence.untimed && (onEvidence ? <button type="button" className="text-button" onClick={() => onEvidence(row)}>
            <CirclePlay size={15} aria-hidden="true" /> Xem đoạn {timestamp(row.evidence.start)}
          </button> : <strong>{timestamp(row.evidence.start)}</strong>)}
          <small>{row.evidence.untimed ? 'Kịch bản' : sourceLabels[row.evidence.source]}</small>
        </div>
        <p>{row.evidence.text}</p>
      </blockquote>}
    </li>)}
  </ul>;
}

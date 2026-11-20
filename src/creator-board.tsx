import { ArrowRight, MessageSquare, UserRound, UsersRound } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { fold } from './claims';
import { creatorWork, type CreatorGroup } from './creators';
import { displayDateTime } from './domain';
import type { Workspace } from './domain';
import { HandoffDialog } from './handoff';
import { Empty, Modal } from './ui';

export function CreatorBoard({ workspace, busy, pendingDate, onLibrary, onQueue, onAssign }: {
  workspace: Workspace; busy: boolean; pendingDate: boolean;
  onLibrary: () => void; onQueue: (creator: string) => void;
  onAssign: (ids: string[], creator: string | undefined) => Promise<void>;
}) {
  const groups = useMemo(() => creatorWork(workspace), [workspace]);
  const [query, setQuery] = useState('');
  const [assign, setAssign] = useState<string>();
  const [handoff, setHandoff] = useState<string>();
  const selected = groups.find(group => group.name === assign);
  const shared = groups.find(group => group.name === handoff);
  const search = fold(query.trim());
  const shown = groups.filter(group => fold(group.name || 'Chưa gán người đăng').includes(search));

  return <section className="panel tool-panel" aria-labelledby="creators-title">
    <div className="panel-heading tool-heading">
      <div><h2 id="creators-title">Video theo người đăng</h2>
        <p>{workspace.audit ? `Tiến độ theo lần rà ${displayDateTime(workspace.audit.checkedAt)} (giờ Việt Nam).` :
          'Thêm bảng ưu đãi và đoạn trích để bắt đầu theo dõi việc cần làm.'}</p></div>
      {groups.length > 0 && <label className="stack-field tool-select">Tìm người đăng
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tên hoặc @tài khoản" />
      </label>}
    </div>
    {groups.length ? <div className="tool-body">
      <p className="tool-summary" role="status">{shown.length} / {groups.length} nhóm · {workspace.clips.length} video trong chiến dịch</p>
      {shown.length ? <ul className="creator-list">
        {shown.map(group => <li key={group.name}>
          <span className="tool-icon">{group.name ? <UserRound size={19} aria-hidden="true" /> : <UsersRound size={19} aria-hidden="true" />}</span>
          <div className="creator-copy"><h3>{group.name || 'Chưa gán người đăng'}</h3>
            <dl>
              <div><dt>Video</dt><dd>{group.clips.length}</dd></div>
              <div><dt>Việc mở</dt><dd>{group.pending.length}</dd></div>
              <div><dt>Đã xử lý</dt><dd>{group.done}</dd></div>
              <div><dt>Báo nhầm</dt><dd>{group.wrong}</dd></div>
              <div><dt>Video thiếu dữ liệu rà</dt><dd>{group.missing}</dd></div>
            </dl>
          </div>
          <div className="tool-actions">
            <button className="button secondary" type="button" disabled={busy} onClick={() => setAssign(group.name)}>
              {group.name ? 'Đổi người đăng' : 'Gán người đăng'}
            </button>
            <button className="button secondary" type="button" disabled={busy || !(group.pending.length + group.done + group.wrong)}
              onClick={() => onQueue(group.name)}>Xem việc <ArrowRight size={15} aria-hidden="true" /></button>
            {group.name && group.pending.length > 0 && <button className="button primary" type="button" disabled={busy || pendingDate}
              aria-describedby={pendingDate ? 'pending-audit' : undefined} onClick={() => setHandoff(group.name)}>
              <MessageSquare size={15} aria-hidden="true" /> Soạn nhắc
            </button>}
          </div>
        </li>)}
      </ul> : <p className="empty-inline">Chưa tìm được người đăng theo tên này.</p>}
    </div> : <Empty title="Kho chưa có video" detail="Thêm một video hoặc nhập danh sách có cột người đăng để theo dõi tiến độ tại đây.">
      <button type="button" className="button secondary" onClick={onLibrary}>Mở kho video <ArrowRight size={16} aria-hidden="true" /></button>
    </Empty>}
    {selected && <AssignCreatorDialog group={selected} names={groups.map(group => group.name).filter(Boolean)}
      onClose={() => setAssign(undefined)} onSave={onAssign} />}
    {shared && workspace.audit && <HandoffDialog rows={shared.pending} version={workspace.versions.length}
      checkedAt={workspace.audit.checkedAt} onClose={() => setHandoff(undefined)} />}
  </section>;
}

function AssignCreatorDialog({ group, names, onClose, onSave }: {
  group: CreatorGroup; names: string[]; onClose: () => void; onSave: (ids: string[], creator?: string) => Promise<void>;
}) {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const [name, setName] = useState('');
  const [remove, setRemove] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nameList = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !ids.size) return;
    const next = remove ? undefined : name.trim();
    if (next === '') { setError('Nhập tên người đăng.'); return; }
    if (next === group.name) { setError('Chọn tên người đăng khác với tên đang gán.'); return; }
    setSaving(true);
    setError('');
    try { await onSave([...ids], next); onClose(); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Chưa lưu được người đăng.'); }
    finally { setSaving(false); }
  }

  return <Modal title={group.name ? 'Đổi người đăng cho video' : 'Gán người đăng cho video'}
    detail={group.name || 'Chọn video và nhập tên hoặc @tài khoản người đăng.'} busy={saving} onClose={onClose}>
    <form className="dialog-form" onSubmit={event => void submit(event)}>
      <fieldset className="clip-fields" disabled={saving}>
        <label className="stack-field tool-select">Tên người đăng mới
          <input value={name} maxLength={100} disabled={remove} required={!remove} list={nameList}
            onChange={event => { setName(event.target.value); setError(''); }} />
        </label>
        <datalist id={nameList}>{names.filter(value => value !== group.name).map(value => <option key={value} value={value} />)}</datalist>
        {group.name && <label className="creator-check">
          <input type="checkbox" checked={remove} onChange={event => { setRemove(event.target.checked); setError(''); }} /> Bỏ gán người đăng
        </label>}
        <label className="creator-check">
          <input type="checkbox" checked={ids.size === group.clips.length} onChange={event =>
            setIds(event.target.checked ? new Set(group.clips.map(clip => clip.id)) : new Set())} /> Chọn tất cả video trong nhóm
        </label>
        <ul className="creator-selection">
          {group.clips.map(clip => <li key={clip.id}><label className="creator-check">
            <input type="checkbox" checked={ids.has(clip.id)} onChange={event => {
              const next = new Set(ids);
              if (event.target.checked) next.add(clip.id);
              else next.delete(clip.id);
              setIds(next);
            }} />
            <span><strong>{clip.title}</strong><small>{clip.sku || 'Chưa gán SKU'}</small></span>
          </label></li>)}
        </ul>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions tool-dialog-actions">
        <button className="button secondary" type="button" disabled={saving} onClick={onClose}>Hủy</button>
        <button className="button primary" type="submit" disabled={saving || !ids.size}>
          {saving ? 'Đang lưu…' : `Lưu cho ${ids.size} video`}
        </button>
      </div>
    </form>
  </Modal>;
}

import { Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { errorMessage, getPaged } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import type { AuditEntry } from '../lib/types';
import { EmptyState, ErrorNote, PageHeader, Pagination, Spinner } from '../components/ui';

export default function AuditPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const q = params.get('q') ?? '';
  const action = params.get('action') ?? '';
  const from = params.get('from') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const log = useQuery({
    queryKey: ['audit', { page, q, action, from }],
    queryFn: () => getPaged<AuditEntry>('/audit', { page, limit: 30, q: q || undefined, action: action || undefined, from: from || undefined }),
    placeholderData: (p) => p,
  });
  return (
    <div>
      <PageHeader title="Audit log" description="Every sign-in, change and deletion, with who did it and from where." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input className="field w-64 pl-9" placeholder="Search action, entity or actor" value={q} onChange={(e) => setParam('q', e.target.value)} aria-label="Search audit log" />
        </label>
        <input className="field w-auto" type="date" value={from} onChange={(e) => setParam('from', e.target.value)} aria-label="From date" />
        {(q || action || from) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Clear filters
          </button>
        )}
      </div>
      <div className="panel overflow-hidden">
        {log.isLoading ? <Spinner /> : log.isError ? <div className="p-5"><ErrorNote message={errorMessage(log.error)} /></div> : log.data!.data.length === 0 ? <EmptyState title="Nothing recorded yet" /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
            <tbody>{log.data!.data.map((e) => (
              <tr key={e.id}><td className="tabular text-ink-muted">{fmtDateTime(e.created_at)}</td><td className="font-medium text-pine">{e.actor?.name ?? 'System'}</td><td><code className="rounded-chip bg-mist px-1.5 py-0.5 text-[12.5px]">{e.action}</code></td><td className="text-ink-muted">{e.entity_type}{e.entity_id ? ` #${e.entity_id}` : ''}</td><td className="max-w-[320px] truncate text-[12.5px] text-ink-muted">{e.meta ? JSON.stringify(e.meta) : '—'}</td><td className="tabular text-ink-faint">{e.ip ?? '—'}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {log.data && <div className="mt-3"><Pagination page={log.data.meta.page} pages={log.data.meta.pages} total={log.data.meta.total} onChange={(p) => setParam('page', String(p))} /></div>}
    </div>
  );
}

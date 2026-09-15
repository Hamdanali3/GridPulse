import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { errorMessage, getPaged } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import type { AuditEntry } from '../lib/types';
import { EmptyState, ErrorNote, PageHeader, Pagination, Spinner } from '../components/ui';

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const log = useQuery({ queryKey: ['audit', page], queryFn: () => getPaged<AuditEntry>('/audit', { page, limit: 30 }), placeholderData: (p) => p });
  return (
    <div>
      <PageHeader title="Audit log" description="Every sign-in, change and deletion, with who did it and from where." />
      <div className="panel overflow-hidden">
        {log.isLoading ? <Spinner /> : log.isError ? <div className="p-5"><ErrorNote message={errorMessage(log.error)} /></div> : log.data!.data.length === 0 ? <EmptyState title="Nothing recorded yet" /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
            <tbody>{log.data!.data.map((e) => (
              <tr key={e.id}><td className="tabular text-ink-muted">{fmtDateTime(e.created_at)}</td><td className="font-medium text-pine">{e.actor?.name ?? 'System'}</td><td><code className="rounded bg-mist px-1.5 py-0.5 text-[12.5px]">{e.action}</code></td><td className="text-ink-muted">{e.entity_type}{e.entity_id ? ` #${e.entity_id}` : ''}</td><td className="max-w-[320px] truncate text-[12.5px] text-ink-muted">{e.meta ? JSON.stringify(e.meta) : '—'}</td><td className="tabular text-ink-faint">{e.ip ?? '—'}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {log.data && <div className="mt-3"><Pagination page={log.data.meta.page} pages={log.data.meta.pages} total={log.data.meta.total} onChange={setPage} /></div>}
    </div>
  );
}

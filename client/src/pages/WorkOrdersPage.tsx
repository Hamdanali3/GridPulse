import { useMemo, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { del, errorMessage, fieldErrors, getPaged, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, humanize, toDateInput } from '../lib/format';
import type { Asset, Site, User, WorkOrder, WorkOrderStatus } from '../lib/types';
import { ConfirmDialog, Drawer, EmptyState, ErrorNote, Field, PageHeader, Pagination, PriorityChip, Segmented, WorkOrderStatusChip } from '../components/ui';
import { CardSkeleton } from '../components/ui/Skeleton';

const schema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters.').max(160),
  description: z.string().max(4000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  status: z.enum(['planned', 'in_progress', 'blocked', 'done']),
  site_id: z.coerce.number().min(1, 'Choose a site.'),
  asset_id: z.coerce.number().optional(),
  assignee_id: z.coerce.number().optional(),
  due_at: z.string().optional(),
});
type Form = z.infer<typeof schema>;

const COLUMNS: WorkOrderStatus[] = ['planned', 'in_progress', 'blocked', 'done'];

export default function WorkOrdersPage() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') ?? 'board') as 'board' | 'table';
  const q = params.get('q') ?? '';
  const siteId = params.get('site_id') ?? '';
  const mine = params.get('mine') === '1';
  const page = Number(params.get('page') ?? 1);
  const [editing, setEditing] = useState<WorkOrder | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WorkOrder | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<WorkOrderStatus | null>(null);

  const setParam = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); setParams(next, { replace: true }); };

  const sites = useQuery({ queryKey: ['sites', 'all'], queryFn: () => getPaged<Site>('/sites', { limit: 100, sort: 'name' }) });
  const users = useQuery({ queryKey: ['users', 'all'], queryFn: () => getPaged<User>('/users', { limit: 100 }), enabled: can('admin') });
  const list = useQuery({
    queryKey: ['work-orders', { q, siteId, mine, page, view }],
    queryFn: () => getPaged<WorkOrder>('/work-orders', { q: q || undefined, site_id: siteId || undefined, assignee_id: mine ? user?.id : undefined, page: view === 'table' ? page : 1, limit: view === 'table' ? 20 : 100, sort: '-priority,due_at' }),
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
  });

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['work-orders'] }); void qc.invalidateQueries({ queryKey: ['alerts'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const move = useMutation({ mutationFn: ({ id, status }: { id: number; status: WorkOrderStatus }) => patch<WorkOrder>(`/work-orders/${id}`, { status }), onSuccess: (wo) => { toast.success(`Moved to ${humanize(wo.status)}.`); invalidate(); }, onError: (e) => toast.error(errorMessage(e)) });
  const remove = useMutation({ mutationFn: (id: number) => del(`/work-orders/${id}`), onSuccess: () => { toast.success('Work order deleted.'); setDeleting(null); invalidate(); }, onError: (e) => toast.error(errorMessage(e)) });

  const onDragStart = (e: DragEvent, w: WorkOrder) => { setDragId(w.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(w.id)); };
  const onDrop = (e: DragEvent, status: WorkOrderStatus) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('text/plain')) || dragId;
    const item = list.data?.data.find((w) => w.id === id);
    setDragId(null); setOverCol(null);
    if (item && item.status !== status) move.mutate({ id: item.id, status });
  };
  const accent: Record<string, string> = { urgent: 'border-l-ember', high: 'border-l-amber', medium: 'border-l-teal', low: 'border-l-moss-deep' };

  const grouped = useMemo(() => { const g: Record<WorkOrderStatus, WorkOrder[]> = { planned: [], in_progress: [], blocked: [], done: [] }; for (const w of list.data?.data ?? []) g[w.status].push(w); return g; }, [list.data]);

  return (
    <div>
      <PageHeader title="Work orders" description="Maintenance and repair tasks, linked to the site, unit and alert they came from. Drag a card to change its status." actions={can('admin', 'engineer') && <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New work order</button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented ariaLabel="View" value={view} onChange={(v) => setParam('view', v)} options={[{ value: 'board', label: 'Board' }, { value: 'table', label: 'Table' }]} />
        <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" /><input className="field w-56 pl-9" placeholder="Search titles" value={q} onChange={(e) => setParam('q', e.target.value)} aria-label="Search work orders" /></label>
        <select className="field w-auto" value={siteId} onChange={(e) => setParam('site_id', e.target.value)} aria-label="Filter by site"><option value="">All sites</option>{sites.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <label className="flex items-center gap-2 text-[13.5px] text-ink-muted"><input type="checkbox" checked={mine} onChange={(e) => setParam('mine', e.target.checked ? '1' : '')} className="accent-pine" /> Assigned to me</label>
      </div>

      {list.isLoading ? <CardSkeleton count={4} /> : list.isError ? <ErrorNote message={errorMessage(list.error)} /> : view === 'board' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <section
              key={col}
              className={clsx('flex min-h-[240px] flex-col rounded-panel border border-line bg-moss/40 transition-colors', overCol === col && 'drop-target')}
              onDragOver={(e) => { if (can('admin', 'engineer')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overCol !== col) setOverCol(col); } }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={(e) => onDrop(e, col)}
            >
              <header className="flex items-center justify-between px-4 py-3"><h2 className="text-[13.5px] font-semibold text-pine">{humanize(col)}</h2><span className="tabular text-[12.5px] text-ink-muted">{grouped[col].length}</span></header>
              <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {grouped[col].length === 0 && <p className="px-2 py-6 text-center text-[12.5px] text-ink-faint">Nothing {col === 'done' ? 'finished yet' : humanize(col).toLowerCase()}</p>}
                {grouped[col].map((w) => (
                  <article
                    key={w.id}
                    className={clsx('panel border-l-[3px] p-3', accent[w.priority], dragId === w.id && 'dragging', can('admin', 'engineer') && 'cursor-grab active:cursor-grabbing')}
                    draggable={can('admin', 'engineer')}
                    onDragStart={(e) => onDragStart(e, w)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2"><PriorityChip priority={w.priority} />{w.due_at && <span className={clsx('text-[12px] tabular', new Date(w.due_at) < new Date() && w.status !== 'done' ? 'font-medium text-ember' : 'text-ink-faint')}>{fmtDate(w.due_at, 'd MMM')}</span>}</div>
                    <button className="text-left text-[13.5px] font-medium leading-snug text-pine hover:underline" onClick={() => can('admin', 'engineer') && setEditing(w)}>{w.title}</button>
                    <p className="mt-1 text-[12px] text-ink-muted">{w.site?.name}{w.asset && ` · ${w.asset.tag}`}</p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-faint">
                      {w.assignee ? <><span className="flex h-5 w-5 items-center justify-center rounded-full bg-pine text-[10px] font-semibold text-white">{w.assignee.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}</span>{w.assignee.name}</> : 'Unassigned'}
                    </p>
                    {can('admin', 'engineer') && (
                      <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
                        {COLUMNS.filter((c) => c !== w.status).map((c) => <button key={c} className="btn btn-ghost btn-sm !px-2 text-[12px]" onClick={() => move.mutate({ id: w.id, status: c })}>{c === 'in_progress' ? 'Start' : c === 'done' ? 'Finish' : c === 'blocked' ? 'Block' : 'Plan'}</button>)}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <>
          <div className="panel overflow-hidden">{list.data!.data.length === 0 ? <EmptyState title="No work orders" hint="Create one from an alert or from scratch." /> : (
            <div className="overflow-x-auto"><table className="table">
              <thead><tr><th>Title</th><th>Site</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Due</th>{can('admin', 'engineer') && <th />}</tr></thead>
              <tbody>{list.data!.data.map((w) => (
                <tr key={w.id}><td><p className="font-medium text-pine">{w.title}</p>{w.asset && <p className="text-[12px] text-ink-faint">{w.asset.tag}</p>}</td><td>{w.site?.name}</td><td><PriorityChip priority={w.priority} /></td><td><WorkOrderStatusChip status={w.status} /></td><td>{w.assignee?.name ?? <span className="text-ink-faint">Unassigned</span>}</td><td className="tabular">{fmtDate(w.due_at)}</td>{can('admin', 'engineer') && <td className="text-right"><div className="flex justify-end gap-1"><button className="btn btn-ghost btn-sm" onClick={() => setEditing(w)}>Edit</button>{can('admin') && <button className="btn btn-ghost btn-sm text-ember" onClick={() => setDeleting(w)}>Delete</button>}</div></td>}</tr>
              ))}</tbody>
            </table></div>
          )}</div>
          {list.data && <div className="mt-3"><Pagination page={list.data.meta.page} pages={list.data.meta.pages} total={list.data.meta.total} onChange={(p) => setParam('page', String(p))} /></div>}
        </>
      )}

      <WorkOrderDrawer item={editing} sites={sites.data?.data ?? []} users={users.data?.data ?? []} onClose={() => setEditing(null)} onDelete={can('admin') ? (w) => { setEditing(null); setDeleting(w); } : undefined} />
      <ConfirmDialog open={!!deleting} title="Delete this work order?" message={`"${deleting?.title}" will be removed. Linked alerts stay in place.`} onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} busy={remove.isPending} />
    </div>
  );
}

function WorkOrderDrawer({ item, sites, users, onClose, onDelete }: { item: WorkOrder | 'new' | null; sites: Site[]; users: User[]; onClose: () => void; onDelete?: (w: WorkOrder) => void }) {
  const qc = useQueryClient();
  const isNew = item === 'new';
  const defaults = useMemo<Form>(() => item && item !== 'new' ? { title: item.title, description: item.description ?? '', priority: item.priority, status: item.status, site_id: item.site_id, asset_id: item.asset_id ?? 0, assignee_id: item.assignee_id ?? 0, due_at: toDateInput(item.due_at) } : { title: '', description: '', priority: 'medium', status: 'planned', site_id: 0, asset_id: 0, assignee_id: 0, due_at: '' }, [item]);
  const { register, handleSubmit, setError, watch, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), values: defaults });
  const siteId = watch('site_id');
  const assets = useQuery({ queryKey: ['assets', { site_id: siteId, all: true }], queryFn: () => getPaged<Asset>('/assets', { site_id: siteId, limit: 100, sort: 'tag' }), enabled: !!siteId });

  const save = useMutation({
    mutationFn: (v: Form) => { const body = { ...v, asset_id: v.asset_id || null, assignee_id: v.assignee_id || null, due_at: v.due_at || null, description: v.description || null }; return isNew ? post<WorkOrder>('/work-orders', body) : patch<WorkOrder>(`/work-orders/${(item as WorkOrder).id}`, body); },
    onSuccess: () => { toast.success(isNew ? 'Work order created.' : 'Work order updated.'); void qc.invalidateQueries({ queryKey: ['work-orders'] }); void qc.invalidateQueries({ queryKey: ['alerts'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); onClose(); },
    onError: (e) => { const fe = fieldErrors(e); for (const [k, v] of Object.entries(fe)) setError(k as keyof Form, { message: v }); if (!Object.keys(fe).length) toast.error(errorMessage(e)); },
  });

  return (
    <Drawer open={!!item} onClose={onClose} title={isNew ? 'New work order' : 'Edit work order'} footer={<>{onDelete && !isNew && <button className="btn btn-ghost mr-auto text-ember" type="button" onClick={() => onDelete(item as WorkOrder)}>Delete</button>}<button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="wo-form" type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : isNew ? 'Create work order' : 'Save changes'}</button></>}>
      <form id="wo-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <div className="sm:col-span-2"><Field label="Title" error={errors.title?.message}><input className="field" {...register('title')} placeholder="Replace gearbox oil on turbine 03" /></Field></div>
        <div className="sm:col-span-2"><Field label="Description" error={errors.description?.message}><textarea className="field min-h-[96px]" {...register('description')} placeholder="What needs to happen, parts required, safety notes." /></Field></div>
        <Field label="Site" error={errors.site_id?.message}><select className="field" {...register('site_id')}><option value={0}>Choose a site</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Asset" error={errors.asset_id?.message}><select className="field" {...register('asset_id')} disabled={!siteId}><option value={0}>Whole site</option>{assets.data?.data.map((a) => <option key={a.id} value={a.id}>{a.tag} · {a.name}</option>)}</select></Field>
        <Field label="Priority"><select className="field" {...register('priority')}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
        <Field label="Status"><select className="field" {...register('status')}><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></Field>
        <Field label="Assignee" hint={users.length ? undefined : 'Only admins can assign people.'}><select className="field" {...register('assignee_id')} disabled={!users.length}><option value={0}>Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select></Field>
        <Field label="Due date" error={errors.due_at?.message}><input className="field" type="date" {...register('due_at')} /></Field>
      </form>
    </Drawer>
  );
}

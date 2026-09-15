import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { MapPin, Plus, Search } from 'lucide-react';
import Sparkline from '../components/charts/Sparkline';
import { CardSkeleton, TableSkeleton } from '../components/ui/Skeleton';
import { del, errorMessage, fieldErrors, getPaged, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtKw, fmtNumber, toDateInput } from '../lib/format';
import type { OperationalStatus, Site, SiteType } from '../lib/types';
import { ConfirmDialog, Drawer, EmptyState, ErrorNote, Field, PageHeader, Pagination, Segmented, StatusChip, TypeGlyph, TypeMark } from '../components/ui';
import { get } from '../lib/api';
import { fmtPct } from '../lib/format';

const siteSchema = z.object({
  name: z.string().min(2, 'Site name must be at least 2 characters.').max(120),
  code: z.string().regex(/^[A-Za-z]{3}-[A-Za-z0-9]{2,4}-\d{2,3}$/, 'Format is TYP-RGN-01, for example SOL-TX-01.'),
  type: z.enum(['solar', 'wind', 'hydro']),
  capacity_mw: z.coerce.number().min(0.1, 'Capacity must be at least 0.1 MW.').max(5000),
  status: z.enum(['online', 'degraded', 'offline', 'maintenance']),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  region: z.string().min(1, 'Region is required.').max(80),
  country: z.string().min(1, 'Country is required.').max(80),
  commissioned_at: z.string().optional(),
  min_efficiency: z.coerce.number().min(0).max(100),
  max_temperature: z.coerce.number().min(-50).max(200),
});
export type SiteForm = z.infer<typeof siteSchema>;

const emptySite: SiteForm = { name: '', code: '', type: 'solar', capacity_mw: 10, status: 'online', lat: 0, lng: 0, region: '', country: '', commissioned_at: '', min_efficiency: 70, max_temperature: 65 };

export default function SitesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const q = params.get('q') ?? '';
  const type = (params.get('type') ?? '') as SiteType | '';
  const status = (params.get('status') ?? '') as OperationalStatus | '';
  const view = (params.get('view') ?? 'cards') as 'cards' | 'table';
  const [editing, setEditing] = useState<Site | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Site | null>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const sites = useQuery({
    queryKey: ['sites', { page, q, type, status }],
    queryFn: () => getPaged<Site>('/sites', { page, limit: 20, q: q || undefined, type: type || undefined, status: status || undefined, sort: 'name' }),
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
  });

  const sparks = useQuery({ queryKey: ['sites', 'sparklines'], queryFn: () => get<Record<string, number[]>>('/telemetry/sites/sparklines', { hours: 24, bucket: 60 }), refetchInterval: 60_000 });

  const remove = useMutation({
    mutationFn: (id: number) => del(`/sites/${id}`),
    onSuccess: () => { toast.success('Site deleted.'); setDeleting(null); void qc.invalidateQueries({ queryKey: ['sites'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Sites"
        description="Every generating site in the fleet with its live output and open alerts."
        actions={can('admin', 'engineer') && <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New site</button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented ariaLabel="View" value={view} onChange={(v) => setParam('view', v)} options={[{ value: 'cards', label: 'Cards' }, { value: 'table', label: 'Table' }]} />
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input className="field w-64 pl-9" placeholder="Search name, code or region" value={q} onChange={(e) => setParam('q', e.target.value)} aria-label="Search sites" />
        </label>
        <select className="field w-auto" value={type} onChange={(e) => setParam('type', e.target.value)} aria-label="Filter by type">
          <option value="">All types</option><option value="solar">Solar</option><option value="wind">Wind</option><option value="hydro">Hydro</option>
        </select>
        <select className="field w-auto" value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option><option value="online">Online</option><option value="degraded">Degraded</option><option value="offline">Offline</option><option value="maintenance">Maintenance</option>
        </select>
      </div>

      {sites.isLoading ? (view === 'cards' ? <CardSkeleton /> : <div className="panel"><TableSkeleton /></div>) : sites.isError ? <ErrorNote message={errorMessage(sites.error)} /> : sites.data!.data.length === 0 ? (
        <div className="panel"><EmptyState title="No sites match" hint={q || type || status ? 'Try clearing a filter.' : 'Add the first site to start receiving telemetry.'} action={can('admin', 'engineer') && !q && <button className="btn btn-primary" onClick={() => setEditing('new')}>New site</button>} /></div>
      ) : view === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sites.data!.data.map((s) => {
            const cf = s.capacity_mw ? ((s.current_output_kw ?? 0) / (s.capacity_mw * 1000)) * 100 : 0;
            return (
              <article key={s.id} className="panel card-link relative flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[12px] text-ink-muted"><TypeGlyph type={s.type} /> {s.code}</p>
                    <Link to={`/sites/${s.id}`} className="mt-0.5 block truncate text-[16px] font-semibold text-pine hover:underline">{s.name}</Link>
                    <p className="flex items-center gap-1 text-[12px] text-ink-faint"><MapPin className="h-3 w-3" /> {s.region}</p>
                  </div>
                  <StatusChip status={s.status} />
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-[28px] font-semibold leading-none text-pine tabular">{fmtKw(s.current_output_kw)}</p>
                    <p className="mt-1 text-[12px] text-ink-muted"><span className="font-medium text-pine tabular">{fmtPct(cf, 0)}</span> of {fmtNumber(s.capacity_mw, s.capacity_mw < 10 ? 1 : 0)} MW</p>
                  </div>
                  <Sparkline values={sparks.data?.[String(s.id)] ?? []} width={120} height={36} color={s.type === 'solar' ? '#F2A93B' : '#2E8B8B'} />
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-moss"><div className="h-full rounded-full bg-amber" style={{ width: `${Math.min(100, cf)}%` }} /></div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[12.5px] text-ink-muted">
                  <span>{s.asset_count} {s.asset_count === 1 ? 'unit' : 'units'}</span>
                  <span>{s.open_alerts ? <span className="font-semibold text-ember">{s.open_alerts} open {s.open_alerts === 1 ? 'alert' : 'alerts'}</span> : <span className="text-ink-faint">No open alerts</span>}</span>
                  {can('admin', 'engineer') && <button className="btn btn-ghost btn-sm -mr-2" onClick={() => setEditing(s)}>Edit</button>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Code</th><th>Site</th><th>Type</th><th className="text-right">Capacity</th><th>Status</th><th>24 h</th><th className="text-right">Output now</th><th className="text-right">Units</th><th className="text-right">Alerts</th>{can('admin', 'engineer') && <th />}</tr>
              </thead>
              <tbody>
                {sites.data!.data.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium tabular text-ink-muted">{s.code}</td>
                    <td><Link to={`/sites/${s.id}`} className="font-medium text-pine hover:underline">{s.name}</Link><p className="text-[12px] text-ink-faint">{s.region}, {s.country}</p></td>
                    <td><TypeMark type={s.type} /></td>
                    <td className="text-right tabular">{fmtNumber(s.capacity_mw, s.capacity_mw < 10 ? 1 : 0)} MW</td>
                    <td><StatusChip status={s.status} /></td>
                    <td><Sparkline values={sparks.data?.[String(s.id)] ?? []} width={90} height={24} color={s.type === 'solar' ? '#F2A93B' : '#2E8B8B'} /></td>
                    <td className="text-right tabular font-medium text-pine">{fmtKw(s.current_output_kw)}</td>
                    <td className="text-right tabular">{s.asset_count}</td>
                    <td className="text-right tabular">{s.open_alerts ? <span className="font-semibold text-ember">{s.open_alerts}</span> : <span className="text-ink-faint">0</span>}</td>
                    {can('admin', 'engineer') && (
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>Edit</button>
                          {can('admin') && <button className="btn btn-ghost btn-sm text-ember" onClick={() => setDeleting(s)}>Delete</button>}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {sites.data && <div className="mt-3"><Pagination page={sites.data.meta.page} pages={sites.data.meta.pages} total={sites.data.meta.total} onChange={(p) => setParam('page', String(p))} /></div>}

      <SiteDrawer site={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!deleting} title={`Delete ${deleting?.name}?`} message="This removes the site with all its assets, telemetry, alerts and work orders. There is no undo." onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} busy={remove.isPending} />
    </div>
  );
}

export function SiteDrawer({ site, onClose }: { site: Site | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = site === 'new';
  const defaults = useMemo<SiteForm>(() => (site && site !== 'new' ? { name: site.name, code: site.code, type: site.type, capacity_mw: site.capacity_mw, status: site.status, lat: site.lat, lng: site.lng, region: site.region, country: site.country, commissioned_at: toDateInput(site.commissioned_at), min_efficiency: site.min_efficiency, max_temperature: site.max_temperature } : emptySite), [site]);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<SiteForm>({ resolver: zodResolver(siteSchema), values: defaults });

  const save = useMutation({
    mutationFn: (values: SiteForm) => {
      const body = { ...values, code: values.code.toUpperCase(), commissioned_at: values.commissioned_at || null };
      return isNew ? post<Site>('/sites', body) : patch<Site>(`/sites/${(site as Site).id}`, body);
    },
    onSuccess: () => { toast.success(isNew ? 'Site created.' : 'Site updated.'); void qc.invalidateQueries({ queryKey: ['sites'] }); void qc.invalidateQueries({ queryKey: ['site'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); onClose(); },
    onError: (e) => {
      const fe = fieldErrors(e);
      for (const [k, v] of Object.entries(fe)) setError(k as keyof SiteForm, { message: v });
      if (Object.keys(fe).length === 0) toast.error(errorMessage(e));
    },
  });

  return (
    <Drawer open={!!site} onClose={onClose} title={isNew ? 'New site' : `Edit ${(site as Site)?.name ?? ''}`} footer={<><button className="btn btn-secondary" onClick={onClose} type="button">Cancel</button><button className="btn btn-primary" form="site-form" type="submit" disabled={isSubmitting || save.isPending}>{save.isPending ? 'Saving…' : isNew ? 'Create site' : 'Save changes'}</button></>}>
      <form id="site-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <div className="sm:col-span-2"><Field label="Site name" error={errors.name?.message}><input className="field" {...register('name')} aria-invalid={!!errors.name} placeholder="Llano Estacado Solar Park" /></Field></div>
        <Field label="Code" error={errors.code?.message} hint="TYP-RGN-01"><input className="field uppercase" {...register('code')} aria-invalid={!!errors.code} placeholder="SOL-TX-01" /></Field>
        <Field label="Type" error={errors.type?.message}><select className="field" {...register('type')}><option value="solar">Solar</option><option value="wind">Wind</option><option value="hydro">Hydro</option></select></Field>
        <Field label="Capacity (MW)" error={errors.capacity_mw?.message}><input className="field" type="number" step="0.1" {...register('capacity_mw')} aria-invalid={!!errors.capacity_mw} /></Field>
        <Field label="Status" error={errors.status?.message}><select className="field" {...register('status')}><option value="online">Online</option><option value="degraded">Degraded</option><option value="offline">Offline</option><option value="maintenance">Maintenance</option></select></Field>
        <Field label="Latitude" error={errors.lat?.message}><input className="field" type="number" step="0.0001" {...register('lat')} aria-invalid={!!errors.lat} /></Field>
        <Field label="Longitude" error={errors.lng?.message}><input className="field" type="number" step="0.0001" {...register('lng')} aria-invalid={!!errors.lng} /></Field>
        <Field label="Region" error={errors.region?.message}><input className="field" {...register('region')} aria-invalid={!!errors.region} placeholder="Texas" /></Field>
        <Field label="Country" error={errors.country?.message}><input className="field" {...register('country')} aria-invalid={!!errors.country} placeholder="United States" /></Field>
        <Field label="Commissioned" error={errors.commissioned_at?.message}><input className="field" type="date" {...register('commissioned_at')} /></Field>
        <div />
        <Field label="Minimum efficiency (%)" error={errors.min_efficiency?.message} hint="Alert below this value"><input className="field" type="number" step="1" {...register('min_efficiency')} /></Field>
        <Field label="Maximum temperature (°C)" error={errors.max_temperature?.message} hint="Alert above this value"><input className="field" type="number" step="1" {...register('max_temperature')} /></Field>
      </form>
    </Drawer>
  );
}

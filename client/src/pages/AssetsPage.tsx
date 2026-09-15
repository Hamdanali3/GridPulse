import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';
import { del, errorMessage, fieldErrors, getPaged, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtKw, kindLabel, toDateInput } from '../lib/format';
import type { Asset, Site } from '../lib/types';
import { ConfirmDialog, Drawer, EmptyState, ErrorNote, Field, HealthBar, PageHeader, Pagination, StatusChip } from '../components/ui';
import { TableSkeleton } from '../components/ui/Skeleton';

const schema = z.object({
  site_id: z.coerce.number().min(1, 'Choose a site.'),
  name: z.string().min(2).max(120),
  tag: z.string().regex(/^[A-Za-z]{2,4}-\d{2,4}$/, 'Tag format is INV-01 or WT-003.'),
  kind: z.enum(['inverter', 'turbine', 'panel_string', 'transformer']),
  manufacturer: z.string().max(80).optional(),
  serial_number: z.string().max(80).optional(),
  rated_kw: z.coerce.number().min(1, 'Rated power must be at least 1 kW.').max(50000),
  status: z.enum(['online', 'degraded', 'offline', 'maintenance']),
  health_score: z.coerce.number().min(0).max(100),
  installed_at: z.string().optional(),
});
type Form = z.infer<typeof schema>;

export default function AssetsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const q = params.get('q') ?? '';
  const siteId = params.get('site_id') ?? '';
  const kind = params.get('kind') ?? '';
  const status = params.get('status') ?? '';
  const [editing, setEditing] = useState<Asset | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);

  useEffect(() => { if (params.get('new') === '1' && can('admin', 'engineer')) setEditing('new'); }, [params, can]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('new');
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const sites = useQuery({ queryKey: ['sites', 'all'], queryFn: () => getPaged<Site>('/sites', { limit: 100, sort: 'name' }) });
  const assets = useQuery({
    queryKey: ['assets', { page, q, siteId, kind, status }],
    queryFn: () => getPaged<Asset>('/assets', { page, limit: 20, q: q || undefined, site_id: siteId || undefined, kind: kind || undefined, status: status || undefined, sort: 'tag' }),
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
  });

  const remove = useMutation({
    mutationFn: (id: number) => del(`/assets/${id}`),
    onSuccess: () => { toast.success('Asset deleted.'); setDeleting(null); void qc.invalidateQueries({ queryKey: ['assets'] }); void qc.invalidateQueries({ queryKey: ['sites'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader title="Assets" description="Inverters, turbines, generator blocks and transformers. Health is derived from recent efficiency." actions={can('admin', 'engineer') && <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New asset</button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" /><input className="field w-64 pl-9" placeholder="Search name, tag or manufacturer" value={q} onChange={(e) => setParam('q', e.target.value)} aria-label="Search assets" /></label>
        <select className="field w-auto" value={siteId} onChange={(e) => setParam('site_id', e.target.value)} aria-label="Filter by site"><option value="">All sites</option>{sites.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="field w-auto" value={kind} onChange={(e) => setParam('kind', e.target.value)} aria-label="Filter by kind"><option value="">All kinds</option><option value="inverter">Inverter</option><option value="turbine">Wind turbine</option><option value="panel_string">Panel string</option><option value="transformer">Turbine-generator</option></select>
        <select className="field w-auto" value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Filter by status"><option value="">All statuses</option><option value="online">Online</option><option value="degraded">Degraded</option><option value="offline">Offline</option><option value="maintenance">Maintenance</option></select>
      </div>

      <div className="panel overflow-hidden">
        {assets.isLoading ? <TableSkeleton cols={8} /> : assets.isError ? <div className="p-5"><ErrorNote message={errorMessage(assets.error)} /></div> : assets.data!.data.length === 0 ? <EmptyState title="No assets match" hint="Try clearing a filter, or add an asset to a site." /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Tag</th><th>Asset</th><th>Site</th><th>Kind</th><th className="text-right">Rated</th><th className="text-right">Output now</th><th className="text-right">Efficiency</th><th>Status</th><th>Health</th>{can('admin', 'engineer') && <th />}</tr></thead>
            <tbody>{assets.data!.data.map((a) => (
              <tr key={a.id}>
                <td className="tabular text-ink-muted">{a.tag}</td>
                <td><p className="font-medium text-pine">{a.name}</p><p className="text-[12px] text-ink-faint">{a.manufacturer ?? '—'}{a.serial_number && ` · ${a.serial_number}`}</p></td>
                <td>{a.site?.name}</td>
                <td>{kindLabel(a.kind)}</td>
                <td className="text-right tabular">{fmtKw(a.rated_kw)}</td>
                <td className="text-right tabular font-medium text-pine">{fmtKw(a.latest?.power_kw)}</td>
                <td className="text-right tabular">{a.latest ? `${a.latest.efficiency_pct.toFixed(1)}%` : '—'}</td>
                <td><StatusChip status={a.status} /></td>
                <td><HealthBar value={a.health_score} /></td>
                {can('admin', 'engineer') && <td className="text-right"><div className="flex justify-end gap-1"><button className="btn btn-ghost btn-sm" onClick={() => setEditing(a)}>Edit</button>{can('admin') && <button className="btn btn-ghost btn-sm text-ember" onClick={() => setDeleting(a)}>Delete</button>}</div></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {assets.data && <div className="mt-3"><Pagination page={assets.data.meta.page} pages={assets.data.meta.pages} total={assets.data.meta.total} onChange={(p) => setParam('page', String(p))} /></div>}

      <AssetDrawer asset={editing} sites={sites.data?.data ?? []} defaultSiteId={siteId ? Number(siteId) : undefined} onClose={() => { setEditing(null); if (params.get('new')) setParam('new', ''); }} />
      <ConfirmDialog open={!!deleting} title={`Delete ${deleting?.tag}?`} message="This removes the asset and its telemetry and alerts. Work orders keep their history." onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} busy={remove.isPending} />
    </div>
  );
}

function AssetDrawer({ asset, sites, defaultSiteId, onClose }: { asset: Asset | 'new' | null; sites: Site[]; defaultSiteId?: number; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = asset === 'new';
  const defaults = useMemo<Form>(() => asset && asset !== 'new' ? { site_id: asset.site_id, name: asset.name, tag: asset.tag, kind: asset.kind, manufacturer: asset.manufacturer ?? '', serial_number: asset.serial_number ?? '', rated_kw: asset.rated_kw, status: asset.status, health_score: asset.health_score, installed_at: toDateInput(asset.installed_at) } : { site_id: defaultSiteId ?? 0, name: '', tag: '', kind: 'inverter', manufacturer: '', serial_number: '', rated_kw: 1000, status: 'online', health_score: 100, installed_at: '' }, [asset, defaultSiteId]);
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), values: defaults });

  const save = useMutation({
    mutationFn: (v: Form) => {
      const body = { ...v, tag: v.tag.toUpperCase(), installed_at: v.installed_at || null, manufacturer: v.manufacturer || null, serial_number: v.serial_number || null };
      return isNew ? post<Asset>('/assets', body) : patch<Asset>(`/assets/${(asset as Asset).id}`, body);
    },
    onSuccess: () => { toast.success(isNew ? 'Asset created.' : 'Asset updated.'); void qc.invalidateQueries({ queryKey: ['assets'] }); void qc.invalidateQueries({ queryKey: ['sites'] }); void qc.invalidateQueries({ queryKey: ['site'] }); onClose(); },
    onError: (e) => { const fe = fieldErrors(e); for (const [k, v] of Object.entries(fe)) setError(k as keyof Form, { message: v }); if (!Object.keys(fe).length) toast.error(errorMessage(e)); },
  });

  return (
    <Drawer open={!!asset} onClose={onClose} title={isNew ? 'New asset' : `Edit ${(asset as Asset)?.tag ?? ''}`} footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="asset-form" type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : isNew ? 'Create asset' : 'Save changes'}</button></>}>
      <form id="asset-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <div className="sm:col-span-2"><Field label="Site" error={errors.site_id?.message}><select className="field" {...register('site_id')}><option value={0}>Choose a site</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}</select></Field></div>
        <div className="sm:col-span-2"><Field label="Asset name" error={errors.name?.message}><input className="field" {...register('name')} placeholder="TX Inverter 07" /></Field></div>
        <Field label="Tag" error={errors.tag?.message} hint="INV-01, WT-003"><input className="field uppercase" {...register('tag')} /></Field>
        <Field label="Kind" error={errors.kind?.message}><select className="field" {...register('kind')}><option value="inverter">Inverter</option><option value="turbine">Wind turbine</option><option value="panel_string">Panel string</option><option value="transformer">Turbine-generator</option></select></Field>
        <Field label="Manufacturer" error={errors.manufacturer?.message}><input className="field" {...register('manufacturer')} placeholder="SMA Sunny Central" /></Field>
        <Field label="Serial number" error={errors.serial_number?.message}><input className="field" {...register('serial_number')} /></Field>
        <Field label="Rated power (kW)" error={errors.rated_kw?.message}><input className="field" type="number" step="1" {...register('rated_kw')} /></Field>
        <Field label="Status" error={errors.status?.message}><select className="field" {...register('status')}><option value="online">Online</option><option value="degraded">Degraded</option><option value="offline">Offline</option><option value="maintenance">Maintenance</option></select></Field>
        <Field label="Health score" error={errors.health_score?.message} hint="0 to 100"><input className="field" type="number" step="1" {...register('health_score')} /></Field>
        <Field label="Installed" error={errors.installed_at?.message}><input className="field" type="date" {...register('installed_at')} /></Field>
      </form>
    </Drawer>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { fmtKw } from '../../lib/format';
import type { DashboardSite } from '../../lib/types';

const statusColor: Record<DashboardSite['status'], string> = {
  online: '#2f8f5b',
  degraded: '#F2A93B',
  offline: '#E5533C',
  maintenance: '#2E8B8B',
};

type Layer = 'terrain' | 'satellite' | 'streets';

const LAYERS: Record<Layer, { label: string; url: string; attribution: string; maxZoom: number; className?: string }> = {
  terrain: { label: 'Terrain', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors, SRTM · style &copy; OpenTopoMap', maxZoom: 17 },
  satellite: { label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics', maxZoom: 18 },
  streets: { label: 'Streets', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', maxZoom: 19, className: 'map-tiles' },
};

/** Fits the view to every plant once sites arrive, with a little breathing room. */
function FitToSites({ sites, single }: { sites: DashboardSite[]; single: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (sites.length === 0) return;
    if (single) {
      map.setView([sites[0].lat, sites[0].lng], 11);
      return;
    }
    const bounds = L.latLngBounds(sites.map((s) => [s.lat, s.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.18), { animate: false });
  }, [map, sites, single]);
  return null;
}

/**
 * Fleet map over real Hindu Kush terrain. Pin size follows capacity, colour follows status.
 * Scroll to zoom, switch between terrain, satellite and streets, click a pin for the plant.
 */
export default function FleetMap({ sites, height = 320, zoom, center, defaultLayer = 'satellite' }: { sites: DashboardSite[]; height?: number; zoom?: number; center?: [number, number]; defaultLayer?: Layer }) {
  const [layer, setLayer] = useState<Layer>(defaultLayer);
  const single = sites.length === 1;
  const c: [number, number] = center ?? [35.95, 72.05];
  const tile = LAYERS[layer];
  const sorted = useMemo(() => [...sites].sort((a, b) => b.capacity_mw - a.capacity_mw), [sites]);

  return (
    <div style={{ height }} className="relative overflow-hidden rounded-panel">
      <MapContainer center={c} zoom={zoom ?? 8} minZoom={6} maxZoom={tile.maxZoom} scrollWheelZoom style={{ height: '100%', width: '100%' }} attributionControl worldCopyJump={false}>
        <TileLayer key={layer} url={tile.url} attribution={tile.attribution} maxZoom={tile.maxZoom} className={tile.className} />
        <FitToSites sites={sites} single={single} />
        {sorted.map((s) => {
          const r = Math.max(7, Math.min(20, 6 + Math.sqrt(s.capacity_mw) * 1.2));
          return (
            <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={r} pathOptions={{ color: '#ffffff', weight: 2, fillColor: statusColor[s.status], fillOpacity: 0.92 }}>
              {(s.capacity_mw >= 4 || single) && (
                <Tooltip permanent direction="right" offset={[r + 2, 0]} className="gp-label">
                  <span className="font-medium">{s.name}</span> <span className="text-ink-muted">· {fmtKw(s.current_output_kw)}</span>
                </Tooltip>
              )}
              {s.capacity_mw < 4 && !single && (
                <Tooltip direction="top" offset={[0, -r]} className="gp-label">
                  <span className="font-medium">{s.name}</span> <span className="text-ink-muted">· {fmtKw(s.current_output_kw)}</span>
                </Tooltip>
              )}
              <Popup>
                <div className="min-w-[200px]">
                  <p className="font-semibold text-pine">{s.name}</p>
                  <p className="text-[12.5px] text-ink-muted">{s.code} · {s.capacity_mw} MW · {s.status}</p>
                  <p className="mt-1 text-[13px]"><span className="font-semibold text-pine tabular">{fmtKw(s.current_output_kw)}</span> now · {s.capacity_factor_pct}% of capacity</p>
                  <p className="text-[12px] text-ink-faint tabular">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</p>
                  {!single && <Link to={`/sites/${s.id}`} className="mt-1 inline-block text-[13px] font-medium text-teal">Open plant</Link>}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Layer switcher */}
      <div className="absolute right-3 top-3 z-[500] inline-flex rounded-control border border-line bg-paper/95 p-0.5 backdrop-blur" role="tablist" aria-label="Map style">
        {(Object.keys(LAYERS) as Layer[]).map((k) => (
          <button key={k} role="tab" aria-selected={layer === k} onClick={() => setLayer(k)} className={clsx('rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-colors', layer === k ? 'bg-pine text-white' : 'text-ink-muted hover:bg-moss hover:text-pine')}>
            {LAYERS[k].label}
          </button>
        ))}
      </div>

      {!single && (
        <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap gap-3 rounded-control border border-line bg-paper/95 px-3 py-1.5 text-[11.5px] text-ink-muted backdrop-blur">
          {(Object.keys(statusColor) as DashboardSite['status'][]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: statusColor[k] }} />{k}</span>
          ))}
          <span className="text-ink-faint">· pin size = capacity · scroll to zoom</span>
        </div>
      )}
    </div>
  );
}

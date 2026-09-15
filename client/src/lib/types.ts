export type Role = 'admin' | 'engineer' | 'viewer';
export type SiteType = 'solar' | 'wind' | 'hydro';
export type OperationalStatus = 'online' | 'degraded' | 'offline' | 'maintenance';
export type AssetKind = 'inverter' | 'turbine' | 'panel_string' | 'transformer';
export type Severity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type AlertType = 'low_efficiency' | 'high_temperature' | 'asset_offline' | 'zero_output';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type WorkOrderStatus = 'planned' | 'in_progress' | 'blocked' | 'done';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  last_login_at?: string | null;
  created_at: string;
}

export interface Site {
  id: number;
  name: string;
  code: string;
  type: SiteType;
  capacity_mw: number;
  status: OperationalStatus;
  lat: number;
  lng: number;
  region: string;
  country: string;
  commissioned_at?: string | null;
  min_efficiency: number;
  max_temperature: number;
  asset_count?: number;
  open_alerts?: number;
  current_output_kw?: number;
  created_at: string;
  updated_at: string;
}

export interface SiteSummary {
  current_output_kw: number;
  capacity_kw: number;
  capacity_factor_pct: number;
  today_energy_kwh: number;
  availability_pct: number;
  assets_by_status: Record<string, number>;
  alerts_by_severity: Record<string, number>;
  open_work_orders: number;
}

export interface Reading {
  id: number;
  asset_id: number;
  site_id: number;
  recorded_at: string;
  power_kw: number;
  efficiency_pct: number;
  temperature_c: number;
  irradiance_wm2?: number | null;
  wind_speed_ms?: number | null;
}

export interface Asset {
  id: number;
  site_id: number;
  site?: Pick<Site, 'id' | 'name' | 'code' | 'type'>;
  name: string;
  tag: string;
  kind: AssetKind;
  manufacturer?: string | null;
  serial_number?: string | null;
  rated_kw: number;
  status: OperationalStatus;
  health_score: number;
  installed_at?: string | null;
  latest?: Reading | null;
  open_alerts?: number;
  created_at: string;
  updated_at: string;
}

export interface Alert {
  id: number;
  site_id: number;
  asset_id: number;
  site?: Pick<Site, 'id' | 'name' | 'code' | 'type'>;
  asset?: Pick<Asset, 'id' | 'name' | 'tag' | 'kind'>;
  type: AlertType;
  severity: Severity;
  status: AlertStatus;
  message: string;
  value?: number | null;
  acknowledged_by?: Pick<User, 'id' | 'name'> | null;
  acknowledged_at?: string | null;
  resolved_by?: Pick<User, 'id' | 'name'> | null;
  resolved_at?: string | null;
  work_order_id?: number | null;
  work_order?: Pick<WorkOrder, 'id' | 'title' | 'status' | 'priority'> | null;
  created_at: string;
  updated_at: string;
}

export interface WorkOrder {
  id: number;
  title: string;
  description?: string | null;
  priority: Priority;
  status: WorkOrderStatus;
  site_id: number;
  asset_id?: number | null;
  alert_id?: number | null;
  assignee_id?: number | null;
  site?: Pick<Site, 'id' | 'name' | 'code' | 'type'>;
  asset?: Pick<Asset, 'id' | 'name' | 'tag' | 'kind'> | null;
  alert?: Pick<Alert, 'id' | 'type' | 'severity' | 'status'> | null;
  assignee?: Pick<User, 'id' | 'name' | 'email' | 'role'> | null;
  created_by?: Pick<User, 'id' | 'name'> | null;
  due_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: number;
  actor?: Pick<User, 'id' | 'name' | 'email' | 'role'> | null;
  action: string;
  entity_type: string;
  entity_id?: number | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
  created_at: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface Paged<T> {
  data: T[];
  meta: PageMeta;
}

export interface FleetLive {
  fleet_kw: number;
  reporting_assets: number;
  capacity_kw: number;
  recorded_at: string | null;
}

export interface SeriesPoint {
  ts: string;
  kw: number;
  efficiency_pct?: number;
  temperature_c?: number;
}

export interface EnergyRow {
  key: string;
  label: string;
  code?: string;
  type?: SiteType;
  kwh: number;
}

export interface DashboardSite {
  id: number;
  name: string;
  code: string;
  type: SiteType;
  status: OperationalStatus;
  capacity_mw: number;
  lat: number;
  lng: number;
  current_output_kw: number;
  capacity_factor_pct: number;
  today_energy_kwh: number;
}

export interface DashboardOverview {
  fleet: {
    current_output_kw: number;
    capacity_kw: number;
    capacity_factor_pct: number;
    today_energy_kwh: number;
    availability_pct: number;
    total_sites: number;
    total_assets: number;
  };
  alerts: {
    open: number;
    by_severity: Record<string, number>;
    recent: Alert[];
  };
  work_orders: {
    due_this_week: number;
    by_status: Record<string, number>;
  };
  sites: DashboardSite[];
  sites_by_status: Record<string, number>;
  generation_by_type: Record<string, { kw: number; capacity_kw: number; sites: number }>;
  top_sites: DashboardSite[];
  bottom_sites: DashboardSite[];
}

# GridPulse — Database Design

Day 36 · Relational schema · MySQL 8 in production, SQLite for local development and tests · Laravel migrations

## 1. Design approach

The domain is naturally relational: a site owns assets, an asset emits telemetry and triggers alerts,
an alert can become a work order, and every action is attributed to a user. A relational database with
foreign keys gives referential integrity for free, and Eloquent relationships map one-to-one onto it.
Three rules guided the design:

1. Third normal form for every entity table. No repeating groups, no derived columns stored except
   `health_score` (a slow-moving aggregate that is expensive to recompute per request).
2. Enumerations are stored as short strings constrained at the application layer (Form Requests and
   PHP enums), which keeps migrations portable between MySQL and SQLite.
3. Every column used in a `WHERE`, `ORDER BY` or `JOIN` is indexed; telemetry gets a composite
   index on `(asset_id, recorded_at)` and `(site_id, recorded_at)` because every chart query filters by
   one of those pairs and sorts by time.

## 2. Entity relationship diagram

```mermaid
erDiagram
    USERS ||--o{ WORK_ORDERS : "assigned to"
    USERS ||--o{ AUDIT_LOGS : "performed"
    USERS ||--o{ ALERTS : "acknowledged / resolved by"
    USERS ||--o{ SITES : "created"
    SITES ||--o{ ASSETS : "contains"
    SITES ||--o{ WORK_ORDERS : "scheduled at"
    SITES ||--o{ ALERTS : "raised at"
    ASSETS ||--o{ TELEMETRY_READINGS : "emits"
    ASSETS ||--o{ ALERTS : "triggers"
    ASSETS ||--o{ WORK_ORDERS : "targets"
    ALERTS ||--o| WORK_ORDERS : "converted into"

    USERS {
        bigint id PK
        string name
        string email UK
        string password
        string role "admin|engineer|viewer"
        boolean is_active
        timestamp last_login_at
    }
    SITES {
        bigint id PK
        string name
        string code UK
        string type "solar|wind|hydro"
        decimal capacity_mw
        string status "online|degraded|offline|maintenance"
        decimal lat
        decimal lng
        string region
        string country
        date commissioned_at
        decimal min_efficiency
        decimal max_temperature
        bigint created_by FK
    }
    ASSETS {
        bigint id PK
        bigint site_id FK
        string name
        string tag UK
        string kind "inverter|turbine|panel_string|transformer"
        string manufacturer
        string serial_number
        decimal rated_kw
        string status
        decimal health_score
        date installed_at
    }
    TELEMETRY_READINGS {
        bigint id PK
        bigint asset_id FK
        bigint site_id FK
        timestamp recorded_at
        decimal power_kw
        decimal efficiency_pct
        decimal temperature_c
        decimal irradiance_wm2
        decimal wind_speed_ms
    }
    ALERTS {
        bigint id PK
        bigint site_id FK
        bigint asset_id FK
        string type
        string severity "critical|warning|info"
        string status "open|acknowledged|resolved"
        string message
        decimal value
        bigint acknowledged_by FK
        timestamp acknowledged_at
        bigint resolved_by FK
        timestamp resolved_at
        bigint work_order_id FK
    }
    WORK_ORDERS {
        bigint id PK
        string title
        text description
        string priority "low|medium|high|urgent"
        string status "planned|in_progress|blocked|done"
        bigint site_id FK
        bigint asset_id FK
        bigint alert_id FK
        bigint assignee_id FK
        bigint created_by FK
        timestamp due_at
        timestamp completed_at
    }
    AUDIT_LOGS {
        bigint id PK
        bigint actor_id FK
        string action
        string entity_type
        bigint entity_id
        json meta
        string ip
        timestamp created_at
    }
    PERSONAL_ACCESS_TOKENS {
        bigint id PK
        string tokenable_type
        bigint tokenable_id
        string token UK
        timestamp expires_at
    }
```

## 3. Tables in detail

### users
| Column | Type | Rules |
| --- | --- | --- |
| id | bigint PK | auto-increment |
| name | varchar(80) | required |
| email | varchar(160) | required, unique |
| password | varchar(255) | bcrypt hash, hidden from JSON |
| role | varchar(16) | `admin` / `engineer` / `viewer`, default `viewer` |
| is_active | boolean | default true; inactive users cannot authenticate |
| last_login_at | timestamp | nullable |
| timestamps | | created_at, updated_at |

Sessions are Sanctum personal access tokens in `personal_access_tokens` (ships with Sanctum).

### sites
| Column | Type | Rules |
| --- | --- | --- |
| name | varchar(120) | required |
| code | varchar(16) | unique, format `SOL-TX-01` |
| type | varchar(8) | solar / wind / hydro |
| capacity_mw | decimal(8,2) | > 0 |
| status | varchar(16) | online / degraded / offline / maintenance |
| lat, lng | decimal(9,6) | −90..90, −180..180 |
| region, country | varchar(80) | required |
| commissioned_at | date | nullable |
| min_efficiency | decimal(5,2) | default 70 — alert threshold |
| max_temperature | decimal(5,2) | default 65 — alert threshold |
| created_by | FK users | null on delete |

Indexes: `code` unique, `(type, status)`.

### assets
Indexes: `site_id`, `tag` unique, `status`. `health_score` (0–100) is updated by the simulator from
recent efficiency. Foreign key `site_id` cascades on delete: an asset cannot outlive its site.

### telemetry_readings
Indexes: `(asset_id, recorded_at)`, `(site_id, recorded_at)`, `recorded_at`.
Append-only. `gridpulse:prune` deletes rows older than seven days. No `updated_at`.

### alerts
Indexes: `(status, severity, created_at)`, `(asset_id, type, status)` — the second one is how the
alert engine checks "is there already an open alert of this type for this asset?" in one indexed lookup.

### work_orders
Indexes: `(status, priority)`, `assignee_id`, `due_at`, `site_id`. `completed_at` is stamped by a
model observer when status changes to `done`.

### audit_logs
Indexes: `created_at`, `actor_id`, `(entity_type, entity_id)`. `meta` is JSON.

## 4. Relationships in Eloquent

| Model | Relationship |
| --- | --- |
| Site | `hasMany(Asset)`, `hasMany(Alert)`, `hasMany(WorkOrder)`, `hasMany(TelemetryReading)`, `belongsTo(User, 'created_by')` |
| Asset | `belongsTo(Site)`, `hasMany(TelemetryReading)`, `hasMany(Alert)`, `hasMany(WorkOrder)` |
| Alert | `belongsTo(Site)`, `belongsTo(Asset)`, `belongsTo(User, 'acknowledged_by')`, `belongsTo(User, 'resolved_by')`, `belongsTo(WorkOrder)` |
| WorkOrder | `belongsTo(Site)`, `belongsTo(Asset)`, `belongsTo(Alert)`, `belongsTo(User, 'assignee_id')`, `belongsTo(User, 'created_by')` |
| User | `hasMany(WorkOrder, 'assignee_id')`, `hasMany(AuditLog, 'actor_id')` |

## 5. Denormalisation decisions (deliberate)

- `telemetry_readings.site_id` duplicates `assets.site_id` so fleet and site aggregations never join
  the hottest table. It is set once at insert and never changes.
- `alerts.message` and `alerts.value` snapshot the condition at the time it was raised, so history
  stays truthful if thresholds are edited later.
- `alerts.work_order_id` and `work_orders.alert_id` point at each other so both screens can render
  the link without a second query. The application keeps them consistent inside a transaction.

## 6. Data volume and retention

40 assets × one reading every 5 s ≈ 690 000 rows per day. The prune command caps the table at seven
days (≈ 4.8 M rows, roughly 500 MB in MySQL with indexes). Daily energy is computed on demand as
average power × elapsed hours per asset per day; a production deployment would roll this into a
`daily_energy` summary table by a nightly job.

# GridPulse — API Contract

Day 36 · Base URL `http://localhost:8000/api/v1` · JSON everywhere · Laravel 12

## Conventions

- Success envelope: `{ "success": true, "data": ..., "meta"?: { "page", "limit", "total", "pages" } }`
- Error envelope: `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details"?: { field: [msgs] } } }`
- Authentication: `Authorization: Bearer <token>` (Laravel Sanctum personal access token, 7-day expiry).
- Pagination: `?page=1&limit=20`; sorting: `?sort=-created_at`; search: `?q=text`.
- Roles column: A = admin, E = engineer, V = viewer. Enforced by the `role:` middleware and policies.
- All routes are throttled (300/min per user, 20/15 min on credential endpoints).

## Auth

| Method | Path | Body | Roles | Notes |
| --- | --- | --- | --- | --- |
| POST | /auth/register | name, email, password, password_confirmation | public | first user becomes admin, others viewer |
| POST | /auth/login | email, password | public | returns token + user |
| POST | /auth/logout | — | any | revokes current token |
| GET | /auth/me | — | any | current user |
| PATCH | /auth/me | name | any | update profile |
| PATCH | /auth/me/password | current_password, password, password_confirmation | any | revokes other tokens |

## Users (admin)

| Method | Path | Roles |
| --- | --- | --- |
| GET | /users | A |
| PATCH | /users/{id} | A (role, is_active, name) |
| DELETE | /users/{id} | A |

## Sites

| Method | Path | Roles | Query / body |
| --- | --- | --- | --- |
| GET | /sites | A E V | q, type, status, page, limit, sort |
| POST | /sites | A E | name, code, type, capacity_mw, status, lat, lng, region, country, commissioned_at, min_efficiency, max_temperature |
| GET | /sites/{id} | A E V | includes asset count, open alert count, current output |
| PATCH | /sites/{id} | A E | partial |
| DELETE | /sites/{id} | A | cascades assets, telemetry, alerts, work orders |
| GET | /sites/{id}/summary | A E V | current output, today's kWh, availability, assets by status |

## Assets

| Method | Path | Roles |
| --- | --- | --- |
| GET | /assets | A E V (filter: site_id, kind, status, q) |
| POST | /assets | A E |
| GET | /assets/{id} | A E V (includes latest reading) |
| PATCH | /assets/{id} | A E |
| DELETE | /assets/{id} | A |

## Telemetry

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | /telemetry/fleet/live | A E V | latest reading per asset summed → fleet kW |
| GET | /telemetry/fleet/series?minutes=60&bucket=1 | A E V | fleet kW bucketed series |
| GET | /telemetry/sites/{id}/series?hours=24&bucket=15 | A E V | per-site series (kW, efficiency, temperature) |
| GET | /telemetry/assets/{id}/latest | A E V | last reading |
| GET | /telemetry/energy?from&to&group_by=site\|type\|day | A E V | kWh totals |

The client polls `/fleet/live` and `/fleet/series` every 5 seconds while the overview is open.

## Alerts

| Method | Path | Roles |
| --- | --- | --- |
| GET | /alerts | A E V (filter: status, severity, type, site_id, page) |
| GET | /alerts/{id} | A E V |
| POST | /alerts/{id}/acknowledge | A E |
| POST | /alerts/{id}/resolve | A E |
| POST | /alerts/{id}/work-order | A E (creates linked work order in a transaction) |

## Work orders

| Method | Path | Roles |
| --- | --- | --- |
| GET | /work-orders | A E V (filter: status, priority, assignee_id, site_id, q) |
| POST | /work-orders | A E |
| GET | /work-orders/{id} | A E V |
| PATCH | /work-orders/{id} | A E |
| DELETE | /work-orders/{id} | A |

## Dashboard and reports

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | /dashboard/overview | A E V | KPIs, sites by status, generation by type, top/bottom sites, recent alerts |
| GET | /reports/energy.csv?from&to | A E V | CSV download |
| GET | /audit | A | paginated audit log |
| GET | /health | public | `{ status: "ok", db, app, time }` |

## Status codes

200 OK · 201 Created · 204 No Content · 401 unauthenticated · 403 forbidden · 404 not found ·
409 conflict (state transitions) · 422 validation · 429 rate limited · 500 unexpected.

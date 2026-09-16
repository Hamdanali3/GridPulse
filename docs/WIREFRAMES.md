# GridPulse — Wireframes and Design System Plan

Day 36 · Low-fidelity layout, before any code

## Design tokens

| Token | Value | Use |
| --- | --- | --- |
| mist | `#F3F5F2` | page canvas |
| paper | `#FFFFFF` | panels |
| moss | `#DCE8D9` | subtle surfaces, table stripes |
| pine | `#14312B` | navigation rail, headings, primary buttons |
| pine-soft | `#1F473F` | hover on pine |
| amber | `#F2A93B` | generated energy, live indicator, primary chart line |
| teal | `#2E8B8B` | capacity, secondary data, links |
| ember | `#E5533C` | alerts, destructive |
| ink | `#182320` | body text |
| ink-muted | `#5C6B66` | secondary text |

Type: Bricolage Grotesque (display 600, key numbers 700 with tabular figures), Instrument Sans (body 400/500).
Scale: 12 / 14 / 16 / 20 / 28 / 40 / 56.

Radii: panel 16px · control 8px · chip 6px. Borders: 1px `rgba(20,49,43,.12)`. No drop shadows.

## App shell

```
┌────────────┬───────────────────────────────────────────────────────────┐
│  GridPulse │  Fleet overview                        ● live   Zafar ▾  │
│            ├───────────────────────────────────────────────────────────┤
│  Overview  │                                                           │
│  Sites     │   [ content canvas — mist background, 24px gutter ]       │
│  Assets    │                                                           │
│  Alerts  3 │                                                           │
│  Work      │                                                           │
│  Reports   │                                                           │
│  Team      │                                                           │
│            │                                                           │
│  Settings  │                                                           │
│  Log out   │                                                           │
└────────────┴───────────────────────────────────────────────────────────┘
   pine rail, 232px         collapses to bottom tab bar under 900px
```

## Overview (dashboard)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Live fleet output                                                    │
│  125.8 MW                            [ live line chart, 60 min,       │
│  66% of 190 MW capacity   ◔ ◔          amber line, sunrise fill ]     │
│  capacity factor · availability rings                                 │
├────────────────┬────────────────┬────────────────┬───────────────────┤
│ Energy today   │ Availability   │ Open alerts    │ Work due this wk  │
│ 1,204 MWh      │ 96.4 %         │ 7  (2 critical)│ 5                 │
├────────────────┴───────┬────────┴────────────────┴───────────────────┤
│  Chitral map (Leaflet) │  Alerts feed (latest 8, severity colour)     │
│  pins by status        │  ● Reshun Unit 02 offline                    │
│                        │  ● Chitral Town Unit 01 efficiency 65 %      │
├────────────────────────┼─────────────────────────────────────────────┤
│  Generation by type    │  Site performance now (capacity-factor bars)│
│  (stacked area, 24h)   │                                             │
└────────────────────────┴─────────────────────────────────────────────┘
```

## Sites list → Site detail

```
Sites                                   [ search ] [ type ▾ ] [ + New site ]
┌────────────────────────────────────────────────────────────────────────┐
│ Code       Name              Type   Capacity  Status     Output  Alerts │
│ HYD-CH-01  Golen Gol Hydro   hydro  108 MW    ● online   84 MW   0      │
│ HYD-CH-03  Reshun Hydro      hydro  4.2 MW    ● online   1.6 MW  1      │
│ SOL-CH-01  Mastuj Solar Park solar  2.0 MW    ● online   0.9 MW  1      │
└────────────────────────────────────────────────────────────────────────┘

Site detail: header (name, code, status chip, capacity, edit/delete),
row 1: 24h generation chart | site summary tiles,
row 2: assets table | open alerts + work orders, map pin.
```

## Alerts, Work orders, Reports, Team

- Alerts: filter chips (open / acknowledged / resolved; severity); table with actions
  "Acknowledge", "Resolve", "Create work order".
- Work orders: toggle table / board. Board columns planned · in progress · blocked · done. Drawer form.
- Reports: date range, group by site/type/day; chart plus table; "Download CSV".
- Team (admin): users table with role select and active toggle.
- Settings: profile form, change password.

## Auth screens

Split layout: left panel pine with a large live-style generation sparkline and the product promise,
right panel form on mist. No stock photography needed; if site photography is supplied it replaces the
left panel background.

## Motion

- One page-load sequence on the overview: the hero chart draws its line over 900 ms, then tiles fade.
- Live pulse dot next to "live"; disabled under `prefers-reduced-motion`.
- All other transitions are responses to user actions (drawer open, row expand, toast).

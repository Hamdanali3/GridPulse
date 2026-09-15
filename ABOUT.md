# About GridPulse — in plain language

## The place

Chitral is a high mountain district in the far north of Khyber Pakhtunkhwa, Pakistan, wedged between the
Hindu Kush and the Afghan border. It is not connected to the national grid in the way a city is. Its
electricity comes mostly from water: the 108 MW Golen Gol plant, the new Lawi plant, and dozens of small
"micro-hydro" schemes on glacier-fed streams that power single valleys. In the last few years solar fields
have appeared in the dry upper valleys around Booni and Mastuj, and a small wind pilot sits on the Shandur
plateau.

## The problem

Those plants are spread across a district the size of a small country. Roads close in winter. Each plant
keeps its own log book. When a turbine trips at 2 a.m. in Reshun, somebody phones somebody. The people
responsible for the whole fleet cannot answer three simple questions quickly:

1. **How much power are we producing right now, and is it what we expected?**
2. **Which unit is under-performing or has stopped, and who is dealing with it?**
3. **What maintenance is planned, overdue, or blocking generation?**

Without answers, faults last longer, output is lost, and nobody can prove what the fleet delivered.

## What GridPulse does

GridPulse is a website that works like a control room. Anyone on the operations team opens it in a
browser and sees:

- **The fleet, live.** A big number for total output that updates every five seconds, a chart of the
  last hour, and rings for capacity factor (how hard the fleet is working) and availability (how many
  units are online).
- **A real map.** Every plant on satellite imagery of the Hindu Kush. Bigger pins are bigger plants;
  the colour says online, degraded, in maintenance or offline. Zoom in, click a pin, open the plant.
- **Each plant in detail.** Output, energy today, a 24-hour / 3-day / 7-day chart of generation and
  efficiency, and every unit with its live reading and a health score.
- **Alerts that raise themselves.** The system checks every reading against the plant's limits. If a
  unit runs hot, loses efficiency, stops while marked online, or goes offline, an alert appears —
  once, not a hundred times. An engineer acknowledges it (so everyone knows it is being handled),
  resolves it, or turns it into a work order with one click.
- **Work orders on a board.** Planned → In progress → Blocked → Done. Drag a card to move it. Each card
  knows which plant, which unit and which alert it came from. When the work is done, the alert closes
  itself.
- **Reports.** Energy by plant, by technology or by day for any date range, and a CSV download for
  whoever needs the numbers in a spreadsheet.
- **A team with roles.** Viewers can look, engineers can operate, admins can manage people. Every
  change is written to an audit log with who did it and when.

## How it works, briefly

- The **API** is written in **Laravel** (PHP). It stores plants, units, readings, alerts, work orders
  and users in a relational database, checks every request for a valid login and the right role,
  validates every field, and answers in one consistent JSON shape.
- The **website** is written in **React** (TypeScript). It asks the API for data every few seconds so
  the screens move without reloading, and it never trusts itself: the server decides what a viewer may do.
- Because there is no real sensor feed in a classroom project, a **simulator** inside the API plays the
  role of the field devices. It writes one realistic reading per unit every five seconds — solar
  follows the sun over Chitral, wind follows a turbine's power curve, hydro is steady — and runs the
  alert rules on each one. Swap it for a real gateway and nothing else changes.

## Who it is for

- The **operations manager** who needs the fleet on one screen and wants to know what is being fixed.
- The **engineer** on shift who needs the alert, the unit, the history and a place to log the work.
- The **executive or funder** who wants a read-only view and a monthly energy report.

## What it proves as a capstone

- Planning: a product requirements document, a database design with an entity-relationship diagram,
  an API contract and wireframes, written before code.
- Full-stack build: authentication, roles, complete CRUD for every resource, live data flow, charts and
  a map, a design system with its own identity.
- Engineering discipline: 30 automated tests, a bug log with root causes, Docker and CI, a deployment
  guide, and a Git history that reads like the project's diary.

## Try it in five minutes

See `README.md`. Sign in as `admin@gridpulse.io` / `Admin12345`, then try the engineer and viewer accounts
to see the interface change with the role.

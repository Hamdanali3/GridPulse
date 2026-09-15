# Images to collect (optional, makes the demo feel local)

The interface works without any photography: the login panel uses a drawn generation curve and the
map uses OpenStreetMap tiles. If you want real Chitral imagery, collect these and drop them into
`client/public/images/`. Each slot lists where it appears and the size that works best.

| File | Where it appears | Suggested source | Size |
| --- | --- | --- | --- |
| `login-hero.jpg` | Background of the left panel on Sign in / Create account (behind the dark pine overlay) | Golen Gol powerhouse or the Chitral river valley at dawn | 1600×1200, landscape |
| `sites/golen-gol.jpg` | Site detail header for Golen Gol Hydropower | Powerhouse or penstock photo | 1200×600 |
| `sites/reshun.jpg` | Site detail header for Reshun Hydropower | Reshun weir / channel | 1200×600 |
| `sites/lawi.jpg` | Site detail header for Lawi Hydropower | Construction / intake | 1200×600 |
| `sites/bumburet.jpg` | Site detail header for Bumburet Micro-Hydro | Kalash valley micro-hydro turbine house | 1200×600 |
| `sites/mastuj-solar.jpg` | Site detail header for Mastuj Solar Park | Solar array with mountains behind | 1200×600 |
| `sites/shandur.jpg` | Site detail header for Shandur Wind Pilot | Shandur plateau | 1200×600 |
| `team/*.jpg` | Avatars on the Team page (currently initials in an amber circle) | Team photos | 256×256 |

How to wire them in:

1. Login background: in `client/src/pages/AuthShell.tsx` add
   `style={{ backgroundImage: "linear-gradient(rgba(20,49,43,.85), rgba(20,49,43,.92)), url('/images/login-hero.jpg')", backgroundSize: 'cover' }}`
   to the `<aside>` element.
2. Site headers: add an optional `image_url` column to `sites` (one migration) and render it above the
   stats row in `SiteDetailPage.tsx`. The seeder can map site codes to the files above.

Everything else (icons, charts, map, logo) is generated in code and needs no assets.

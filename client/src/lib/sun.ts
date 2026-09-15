/**
 * Sunrise and sunset for a latitude/longitude on a given date (NOAA simplified algorithm, ±3 min).
 * Used for the Chitral conditions widget; the API's solar model uses the same daylight idea.
 */
export function sunTimes(date: Date, lat: number, lng: number, timeZone = 'Asia/Karachi'): { sunrise: string; sunset: string; daylightHours: number } {
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000);
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (12 - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const zenith = 90.833 * rad;
  const cosHa = Math.cos(zenith) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  const ha = Math.acos(Math.max(-1, Math.min(1, cosHa))) / rad; // degrees
  const sunriseUtcMin = 720 - 4 * (lng + ha) - eqTime;
  const sunsetUtcMin = 720 - 4 * (lng - ha) - eqTime;
  const toLocal = (utcMin: number) => {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, utcMin));
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone }).format(d);
  };
  return { sunrise: toLocal(sunriseUtcMin), sunset: toLocal(sunsetUtcMin), daylightHours: Math.round(((sunsetUtcMin - sunriseUtcMin) / 60) * 10) / 10 };
}

/** Hydrological season for the Chitral river system, which is fed by snow and glacier melt. */
export function chitralSeason(date: Date): { label: string; note: string } {
  const m = date.getMonth() + 1;
  if (m >= 6 && m <= 9) return { label: 'Glacial melt', note: 'peak river flow, hydro at full head' };
  if (m >= 3 && m <= 5) return { label: 'Spring snowmelt', note: 'rising flow, silt load high' };
  if (m >= 10 && m <= 11) return { label: 'Autumn recession', note: 'flows falling, clear water' };
  return { label: 'Winter low flow', note: 'reduced hydro head, solar short days' };
}

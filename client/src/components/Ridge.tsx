/**
 * Layered Hindu Kush ridge line. Three silhouettes at decreasing opacity give depth; the sun sits
 * where the amber accent wants to be. Used behind the login panel and the site-detail header.
 */
export default function Ridge({ className = '', sun = true, hour, snow = true }: { className?: string; sun?: boolean; hour?: number; snow?: boolean }) {
  // Sun position follows Chitral local time when given: rises at 6, sets at 19.
  const h = hour ?? 12;
  const day = h >= 6 && h <= 19;
  const sunX = day ? 80 + ((h - 6) / 13) * 640 : 400;
  const sunY = day ? 150 - Math.sin(((h - 6) / 13) * Math.PI) * 110 : 200;
  return (
    <svg className={className} viewBox="0 0 800 260" preserveAspectRatio="xMidYMax slice" aria-hidden>
      {sun && (
        <g>
          <circle cx={sunX} cy={sunY} r="48" fill="#F2A93B" opacity={day ? 0.18 : 0.08} />
          <circle cx={sunX} cy={sunY} r="18" fill={day ? '#F2A93B' : '#DCE8D9'} opacity={day ? 1 : 0.7} />
        </g>
      )}
      <path d="M0 200 L60 170 L120 150 L170 175 L230 120 L290 140 L340 95 L400 130 L450 110 L520 150 L580 105 L640 140 L700 120 L760 155 L800 140 L800 260 L0 260 Z" fill="#1F473F" opacity="0.9" />
      <path d="M0 225 L50 205 L110 215 L160 190 L220 200 L280 170 L330 190 L390 165 L450 185 L510 160 L570 180 L630 165 L690 185 L750 170 L800 190 L800 260 L0 260 Z" fill="#2B5A50" opacity="0.85" />
      <path d="M0 245 L70 235 L130 240 L200 225 L260 235 L320 220 L380 232 L450 218 L520 230 L590 220 L660 232 L730 222 L800 235 L800 260 L0 260 Z" fill="#3A6E62" opacity="0.8" />
      {snow && <path d="M340 95 L360 108 L352 112 L370 120 L400 130 L392 118 L372 104 Z" fill="#DCE8D9" opacity="0.55" />}
      {snow && <path d="M580 105 L598 118 L590 121 L612 130 L640 140 L630 126 L610 112 Z" fill="#DCE8D9" opacity="0.5" />}
    </svg>
  );
}

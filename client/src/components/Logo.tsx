export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#F2A93B" />
      <path d="M6 21 L11 13 L15 18 L20 9 L26 19" fill="none" stroke="#14312B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="19" r="2.4" fill="#14312B" />
    </svg>
  );
}

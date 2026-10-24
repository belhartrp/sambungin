export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      <g fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round">
        <rect x="5.5" y="11" width="13" height="10" rx="5" />
        <rect x="13.5" y="11" width="13" height="10" rx="5" />
      </g>
    </svg>
  );
}

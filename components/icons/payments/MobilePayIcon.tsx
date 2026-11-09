/**
 * Placeholder MobilePay-style mark; text and abstract phone icon avoid exact trademark reproduction.
 */
export function MobilePayIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      role="img"
      aria-label="MobilePay"
      className={className}
      fill="none"
    >
      <rect width="64" height="40" rx="8" fill="white" />
      <rect x="0.5" y="0.5" width="63" height="39" rx="7.5" stroke="#1e3f5a" strokeOpacity="0.16" />
      <rect x="10" y="10" width="13" height="20" rx="3" fill="#5B8DEF" />
      <path d="M14 14H25C28 14 30 16 30 19C30 22 28 24 25 24H18" stroke="#1e3f5a" strokeWidth="2.5" strokeLinecap="round" />
      <text x="34" y="23.5" fill="#1e3f5a" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="700">
        Mobile
      </text>
    </svg>
  );
}


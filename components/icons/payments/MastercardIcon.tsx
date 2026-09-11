/**
 * Stylized overlapping-circle mark for payment method displays.
 */
export function MastercardIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      role="img"
      aria-label="Mastercard"
      className={className}
      fill="none"
    >
      <rect width="64" height="40" rx="8" fill="white" />
      <rect x="0.5" y="0.5" width="63" height="39" rx="7.5" stroke="#1e3f5a" strokeOpacity="0.16" />
      <circle cx="27" cy="20" r="10" fill="#D65F3D" />
      <circle cx="37" cy="20" r="10" fill="#D9A441" fillOpacity="0.92" />
      <path d="M32 12.4A10 10 0 0 1 32 27.6A10 10 0 0 1 32 12.4Z" fill="#C77739" />
    </svg>
  );
}


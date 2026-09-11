/**
 * Stylized Stripe Link-style mark for payment method displays.
 */
export function StripeLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      role="img"
      aria-label="Stripe Link"
      className={className}
      fill="none"
    >
      <rect width="64" height="40" rx="8" fill="white" />
      <rect x="0.5" y="0.5" width="63" height="39" rx="7.5" stroke="#1e3f5a" strokeOpacity="0.16" />
      <rect x="11" y="12" width="18" height="16" rx="5" fill="#635BFF" />
      <path d="M17 20H23" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M35 15H42C45 15 47 17 47 20C47 23 45 25 42 25H35" stroke="#1e3f5a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M37 20H52" stroke="#1e3f5a" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}


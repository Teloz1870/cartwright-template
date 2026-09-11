/**
 * Stylized Google Pay-style mark for payment method displays.
 */
export function GooglePayIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      role="img"
      aria-label="Google Pay"
      className={className}
      fill="none"
    >
      <rect width="64" height="40" rx="8" fill="white" />
      <rect x="0.5" y="0.5" width="63" height="39" rx="7.5" stroke="#1e3f5a" strokeOpacity="0.16" />
      <path d="M16 20C16 16.1 19.1 13 23 13C25 13 26.6 13.7 27.8 14.9L25.7 17C25 16.3 24 16 23 16C20.8 16 19 17.8 19 20C19 22.2 20.8 24 23 24C24.7 24 25.7 23.3 26.2 22.1H23V19.4H29.2C29.3 19.8 29.3 20.2 29.3 20.7C29.3 24.4 26.8 27 23 27C19.1 27 16 23.9 16 20Z" fill="#4285F4" />
      <text x="34" y="24" fill="#1a1a1a" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="700">
        Pay
      </text>
    </svg>
  );
}


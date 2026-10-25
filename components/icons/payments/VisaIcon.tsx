/**
 * Stylized card-network mark for payment method displays.
 */
export function VisaIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      role="img"
      aria-label="Visa"
      className={className}
      fill="none"
    >
      <rect width="64" height="40" rx="8" fill="white" />
      <rect x="0.5" y="0.5" width="63" height="39" rx="7.5" stroke="#1e3f5a" strokeOpacity="0.16" />
      <path d="M12 25.5L15.5 14.5H20L16.5 25.5H12Z" fill="#1e3f5a" />
      <path d="M20 25.5L24.5 14.5H29L31 21.5L35 14.5H39.5L32.8 25.5H28.2L26.3 18.8L23.8 25.5H20Z" fill="#1e3f5a" />
      <path d="M40.5 25.5L44 14.5H51.5C54.8 14.5 56.2 16.1 55.3 18.5C54.7 20.1 53.4 21.1 51.5 21.5L54 25.5H49.2L47 21.8H45.9L44.8 25.5H40.5ZM46.8 18.9H50.2C51 18.9 51.5 18.6 51.7 18C51.9 17.4 51.5 17.1 50.7 17.1H47.4L46.8 18.9Z" fill="#1e3f5a" />
    </svg>
  );
}


/**
 * Placeholder Apple Pay-style mark; text and simple fruit silhouette avoid exact trademark reproduction.
 */
export function ApplePayIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      role="img"
      aria-label="Apple Pay"
      className={className}
      fill="none"
    >
      <rect width="64" height="40" rx="8" fill="white" />
      <rect x="0.5" y="0.5" width="63" height="39" rx="7.5" stroke="#1e3f5a" strokeOpacity="0.16" />
      <path d="M18.5 13.2C20 11.6 21.8 11.7 22.9 12.9C21.5 13.8 20.8 15 20.9 16.4C19.7 16.4 18.8 15.3 18.5 13.2Z" fill="#1a1a1a" />
      <path d="M15.2 20.1C15.2 16.5 17.3 14.5 20 14.5C21 14.5 21.8 14.9 22.5 15.2C23.1 14.9 24 14.5 25 14.5C27 14.5 28.3 15.6 29 17.2C27.7 18 27.1 19.1 27.1 20.5C27.1 22.1 27.9 23.3 29.4 24C28.5 26.1 27.2 28 25.2 28C24.2 28 23.6 27.5 22.6 27.5C21.6 27.5 20.9 28 19.9 28C17.4 28 15.2 24.2 15.2 20.1Z" fill="#1a1a1a" />
      <text x="33" y="24" fill="#1a1a1a" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="700">
        Pay
      </text>
    </svg>
  );
}


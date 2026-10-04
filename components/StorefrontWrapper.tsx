"use client";

import { usePathname } from "next/navigation";

export default function StorefrontWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Hide these elements on admin pages
  if (pathname?.startsWith("/admin")) {
    return null;
  }

  return <>{children}</>;
}

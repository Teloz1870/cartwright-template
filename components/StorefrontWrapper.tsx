"use client";

import { usePathname } from "next/navigation";
import { isAdminPath } from "@/lib/path-segments";

export default function StorefrontWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Hide these elements on admin pages (the whole /admin segment —
  // a storefront page such as /administration keeps them)
  if (isAdminPath(pathname)) {
    return null;
  }

  return <>{children}</>;
}

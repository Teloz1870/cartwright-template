"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ redirectTo: "/" })}
      className="h-12 w-full flex items-center justify-center rounded-md border border-white/10 bg-transparent text-white/50 font-semibold text-sm hover:bg-white/5 hover:text-white transition-all focus:ring-4 focus:ring-white/10"
    >
      Log out
    </button>
  );
}

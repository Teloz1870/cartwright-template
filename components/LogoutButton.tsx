"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/Button";

export default function LogoutButton() {
  return (
    <Button
      variant="ghost"
      onClick={() => signOut({ redirectTo: "/" })}
    >
      Log ud
    </Button>
  );
}

import { execSync } from "node:child_process";
import { E2E_ADMIN_PASSWORD } from "./constants";

export default async function globalSetup() {
  // db push (ikke migrate deploy) — matcher projektets konvention og sikrer at
  // hele skemaet (inkl. mustChangePassword) er synket før seed.
  execSync("npx prisma db push", {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  // Kendt admin-password til E2E (ellers genererer seed et tilfældigt). Sat så
  // den seedede admin får mustChangePassword: false (ingen tvungen-skift-redirect).
  execSync("npx prisma db seed", {
    stdio: "inherit",
    cwd: process.cwd(),
    env: { ...process.env, ADMIN_PASSWORD: E2E_ADMIN_PASSWORD },
  });
}

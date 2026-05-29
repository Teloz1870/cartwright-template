import { execSync } from "node:child_process";

export default async function globalSetup() {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  execSync("npx prisma db seed", {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

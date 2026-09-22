import "server-only";

import { cache } from "react";
import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getFeatures } from "@/lib/brand";
import { routing } from "@/i18n/routing";

/**
 * Er in-place editing aktivt for den aktuelle request? Tre betingelser:
 *   1) annotateEdit-flag ON (inkl. DB-override),
 *   2) den besøgende er admin,
 *   3) vi er på standard-locale (da).
 *
 * (3) holder v1 base-locale-only-løftet konsistent på tværs af ALLE flader:
 * write-tools'ene har ingen `locale`-param, så et edit skriver altid base-copy.
 * Ved at gate på standard-locale undgår vi "redigér base mens du ser EN"-
 * forvirringen helt — uden at tråde locale gennem hver komponent.
 *
 * Er den false er DOM byte-identisk med før for ikke-admins, og overlayet
 * rendrer intet. `cache()` dedupliserer kaldene på tværs af de mange server-
 * komponenter (layout, homepage, PLP, PDP, footer, info-side) i én request.
 */
export const isAnnotateEditEnabled = cache(async (): Promise<boolean> => {
  const features = await getFeatures();
  if (!features.annotateEdit) return false;

  let locale: string;
  try {
    locale = await getLocale();
  } catch {
    // Uden for next-intl request-kontekst (fx visse RSC-edge-cases) → fail-soft.
    return false;
  }
  if (locale !== routing.defaultLocale) return false;

  const session = await auth();
  return session?.user?.role === "admin";
});

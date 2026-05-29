/**
 * AI-first scope system.
 *
 * Hvert API-tool er tagget med præcis ÉN required scope. API-keys bærer en
 * liste af scopes og må kalde alle tools hvis scope er i listen. Storefront-
 * chat-session-JWTs får kun customer-scopes (cart:write + catalog:read), så
 * en jailbreak ikke kan eskalere til admin-CRUD.
 *
 * Læseregler: <domæne>:<aktion>. "*" er en wildcard der dækker hele domænet
 * (kun til root-keys i admin-UI; aldrig til session-JWT'er).
 */
export const SCOPES = [
  "products:read",
  "products:write",
  "categories:read",
  "categories:write",
  "pages:read",
  "pages:write",
  "discounts:read",
  "discounts:write",
  "orders:read",
  "orders:write",
  "settings:read",
  "settings:write",
  "audit:read",
  "audit:revert",
  "analytics:read",
  "marketing:write",
  "catalog:read",
  "cart:write",
  "customer:read",
] as const;

export type Scope = (typeof SCOPES)[number];

/**
 * Scope-grupper til UI'et i /admin/api-keys (præsenteres som checkboxes).
 * Når nye scopes tilføjes: opdater både SCOPES og denne grouping.
 */
export const SCOPE_GROUPS: Record<string, readonly Scope[]> = {
  Katalog: ["catalog:read", "products:read", "products:write"],
  Indhold: ["categories:read", "categories:write", "pages:read", "pages:write"],
  Salg: [
    "orders:read",
    "orders:write",
    "discounts:read",
    "discounts:write",
    "marketing:write",
  ],
  Drift: [
    "settings:read",
    "settings:write",
    "analytics:read",
    "audit:read",
    "audit:revert",
  ],
  Kunde: ["cart:write", "customer:read"],
};

/**
 * Storefront-chat-session-JWT'er får kun denne minimale scope-liste.
 * Aldrig admin-skrivetools. Hvis dette ændres, skal pen-test køres igen.
 */
export const CUSTOMER_CHAT_SCOPES: readonly Scope[] = [
  "catalog:read",
  "cart:write",
  "customer:read",
  "orders:write",
];

/**
 * Operatør-chat (/admin/ai) får admin-scopes men eksplicit IKKE cart:write —
 * admin styrer ordrer, ikke kurve. Plan-først-confirmation håndhæver det
 * ekstra sikkerheds-lag for destructive ops; scope alene er ikke nok når
 * brugeren ER admin.
 */
export const ADMIN_CHAT_SCOPES: readonly Scope[] = [
  "catalog:read",
  "products:read",
  "products:write",
  "categories:read",
  "categories:write",
  "pages:read",
  "pages:write",
  "orders:read",
  "orders:write",
  "discounts:read",
  "discounts:write",
  "settings:read",
  "settings:write",
  "audit:read",
  "audit:revert",
  "analytics:read",
  "marketing:write",
  "customer:read",
];

export function isValidScope(s: string): s is Scope {
  return (SCOPES as readonly string[]).includes(s);
}

/**
 * Tjek om en granted scope-liste dækker en required scope.
 * Accepterer wildcard "<domæne>:*" hvis nogensinde introduceret.
 */
export function hasScope(granted: readonly string[], required: Scope): boolean {
  if (granted.includes(required)) return true;
  const [domain] = required.split(":");
  return granted.includes(`${domain}:*`);
}

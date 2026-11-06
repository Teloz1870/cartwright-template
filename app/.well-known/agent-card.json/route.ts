/**
 * /.well-known/agent-card.json — the A2A ecosystem's canonical discovery
 * location for an agent card. Thin mount over the existing /api/agent-card
 * route: same gate (404 when brand.features.a2a is off), same honest 503
 * while no card is published, same signed document when one is.
 */
export { GET, OPTIONS } from "@/app/api/agent-card/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

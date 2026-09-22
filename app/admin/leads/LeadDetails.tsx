/**
 * Render a lead's `data` blob — whatever a custom form chose to submit.
 *
 * Everything here is public, unauthenticated input, so it is rendered as TEXT
 * only: JSX interpolation escapes it, and no value is ever passed to
 * dangerouslySetInnerHTML or used as an href. Non-object JSON (a bare string,
 * an array, null) cannot come from the public inquiry endpoint, which requires
 * an object — but it CAN come from a seed, a manual row, an import, or a future
 * writer, and one bad row must not take down the whole inbox. So it degrades to
 * a single formatted line rather than throwing.
 *
 * (Deliberately no literal endpoint path here: inquiry-error-i18n.test.ts
 * derives the list of endpoint CONSUMERS by grepping .tsx files for it, and
 * this component renders rows rather than posting to it.)
 */
// Its own module, not a named export of page.tsx: an App Router page may
// export only `default` and Next's segment config, and anything else fails the
// page type-check Next generates (TS2344). It is exported at all because it is
// the only place a lead's public `data` blob is rendered, and "text only, never
// innerHTML" is a security property — it earns a render test rather than a
// reading (tests/unit/admin-leads-render.test.tsx).
export function LeadDetails({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;

  const entries =
    typeof data === "object" && !Array.isArray(data)
      ? Object.entries(data as Record<string, unknown>)
      : [["value", data] as const];
  if (entries.length === 0) return null;

  return (
    <details className="mt-2">
      <summary className="text-xs font-normal text-sol-muted cursor-pointer hover:text-sol-ink">
        {entries.length} submitted {entries.length === 1 ? "field" : "fields"}
      </summary>
      <dl className="mt-1 flex flex-col gap-0.5">
        {entries.map(([key, value]) => (
          <div key={key} className="text-xs font-normal">
            <dt className="inline text-sol-muted">{key}: </dt>
            <dd className="inline text-sol-ink break-words">
              {typeof value === "string" ? value : JSON.stringify(value)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

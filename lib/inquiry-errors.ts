/**
 * Machine-readable failure codes for the public inquiry endpoint.
 *
 * The route must not answer with human prose. `/api/inquiries` carries no
 * locale segment, so the route cannot know the visitor's language — but the
 * PAGE does, and the form already translates its own errors. A hardcoded
 * message here silently wins over that translation, because
 * `result.error || t("errorGeneric")` can never fall through a truthy string.
 * That is how an English shop rendered "Ugyldig email-adresse" to a visitor
 * who mistyped their address.
 *
 * So the route returns a `code`, the form translates it, and `error` stays
 * English for non-browser API consumers (agents, scripts, logs) that read the
 * response rather than render it.
 */
export const INQUIRY_ERROR_CODES = [
  "invalid_name",
  "invalid_email",
  "invalid_input",
  "send_failed",
] as const;

export type InquiryErrorCode = (typeof INQUIRY_ERROR_CODES)[number];

const ENGLISH: Record<InquiryErrorCode, string> = {
  invalid_name: "Name is too short",
  invalid_email: "Invalid email address",
  invalid_input: "Invalid input",
  send_failed: "Could not send your message",
};

/**
 * Narrow an arbitrary Zod issue message to a known code. Zod emits its own
 * built-in text for failures the schema does not annotate (a missing field, a
 * wrong type), so anything unrecognised degrades to `invalid_input` rather
 * than leaking Zod's own wording into the response.
 */
export function inquiryErrorCode(value: unknown): InquiryErrorCode {
  return INQUIRY_ERROR_CODES.includes(value as InquiryErrorCode)
    ? (value as InquiryErrorCode)
    : "invalid_input";
}

export function inquiryErrorEnglish(code: InquiryErrorCode): string {
  return ENGLISH[code];
}

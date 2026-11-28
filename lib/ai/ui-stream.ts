/**
 * Options for a UI message stream a shopper reads.
 *
 * `ai` 7.0.171 stopped replacing a failed tool call's error text with "An error
 * occurred." by default: the client now gets the text the model received. On the
 * storefront that text can be a database or upstream error, so the public chat
 * keeps the earlier behaviour explicitly. The admin chat passes its own `onError`,
 * which keeps redaction on there (the SDK's default when `onError` is given).
 */
export const PUBLIC_UI_STREAM = { redactToolErrors: true } as const;

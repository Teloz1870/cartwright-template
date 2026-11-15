/**
 * A tool's deliberate business refusal — "this request cannot be done in the
 * current state", not "the server broke". `invokeTool` maps it to a 4xx with
 * its stable `code`, and REST and MCP pass its `message` through unchanged.
 *
 * Any other throw stays a 500 whose text never leaves the server
 * (`safeInvokeErrorDetail`), because handler errors can carry SQL, provider or
 * credential text. That is the contract this class depends on: the message is
 * public. Build it only from literals and the caller's own validated input,
 * never from a DB row, a caught error or a provider response.
 *
 * Status: 409 Conflict when the request clashes with the resource's current
 * state (a duplicate code, a code the owner switched off); 404 when the
 * resource the caller named does not exist. 422 stays reserved for input that
 * fails the published JSON Schema (`validation_failed` + Zod `issues`), so a
 * client can tell "fix the body" from "the shop says no".
 */
export type ToolRefusalStatus = 404 | 409;

const CODE_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;

export class ToolRefusal extends Error {
  readonly code: string;
  readonly status: ToolRefusalStatus;

  constructor(code: string, message: string, status: ToolRefusalStatus = 409) {
    if (!CODE_PATTERN.test(code)) {
      throw new TypeError(`ToolRefusal code must be snake_case: ${code}`);
    }
    super(message);
    this.name = "ToolRefusal";
    this.code = code;
    this.status = status;
  }
}

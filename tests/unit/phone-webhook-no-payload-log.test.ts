import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const features = vi.hoisted(() => ({ phoneWidget: true }));
vi.mock("@/lib/brand", () => ({ getFeatures: async () => features }));

import { POST, loggableEventName } from "@/plugins/phone-widget/api/webhook";

// DRØM26-a: the Phone.inc webhook wrote the whole `data` object of every call
// to the server log. These tests post the personal data a Phone.inc payload
// carries and assert that none of it reaches any console argument, while the
// event name still does. Since DRØM26-b every delivery must carry Phone.inc's
// signature, so the requests here are signed with the test secret.

const PHONE = "+4520123456";
const TRANSCRIPT = "Hej, det er Jens Hansen, jeg ringer om min ordre fra i går";
const AUDIO = "https://phone.inc/rec/abc123/audio.mp3";
const URL_BASE = "https://shop.example.com/api/phone/webhook";
const SECRET = "s3cr3t-value";

const ORIGINAL_SECRET = process.env.PHONE_INC_WEBHOOK_SECRET;

let spies: MockInstance[] = [];

beforeEach(() => {
  process.env.PHONE_INC_WEBHOOK_SECRET = SECRET;
  spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});

afterEach(() => {
  for (const s of spies) s.mockRestore();
  if (ORIGINAL_SECRET === undefined) delete process.env.PHONE_INC_WEBHOOK_SECRET;
  else process.env.PHONE_INC_WEBHOOK_SECRET = ORIGINAL_SECRET;
});

/** Every argument of every console call, serialised the way a log sink would. */
function logged(): string {
  return spies
    .flatMap((s) => s.mock.calls)
    .flatMap((args) => args)
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join("\n");
}

function post(body: string, init: { signed?: boolean } = {}): Request {
  const ts = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.signed !== false) {
    headers["x-phone-inc-timestamp"] = ts;
    headers["x-phone-inc-signature"] =
      "v1=" + createHmac("sha256", SECRET).update(`${ts}.`).update(body).digest("hex");
  }
  return new Request(URL_BASE, { method: "POST", headers, body });
}

function payload(event: unknown): string {
  return JSON.stringify({
    event,
    data: { call_id: "call_1", from: PHONE, to: "+4570000000", transcript: TRANSCRIPT, audio_url: AUDIO },
  });
}

describe("phone webhook — no personal data in the server log", () => {
  it.each(["call.transcription_done", "voicemail.new", "call.ended"])(
    "logs the event name %s but not the number, transcript or recording link",
    async (event) => {
      const res = await POST(post(payload(event)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });

      const out = logged();
      expect(out).toContain(event);
      expect(out).not.toContain(PHONE);
      expect(out).not.toContain("20123456");
      expect(out).not.toContain(TRANSCRIPT);
      expect(out).not.toContain("Jens Hansen");
      expect(out).not.toContain(AUDIO);
    },
  );

  it("an event that is not a Phone.inc event (a phone number) is not echoed", async () => {
    const res = await POST(post(payload(PHONE)));
    expect(res.status).toBe(200);
    const out = logged();
    expect(out).toContain("Unhandled event type");
    expect(out).not.toContain("20123456");
    expect(out).not.toContain(TRANSCRIPT);
  });

  it.each([
    // V8's JSON.parse error message quotes the first ~10 characters of the text
    // it rejected (`Unexpected token '+', "+452012345"... is not valid JSON`),
    // so the probes are shorter than that quote.
    [`${PHONE} ${TRANSCRIPT}`, "452012"],
    [`${TRANSCRIPT} ${PHONE}`, "Hej, det"],
  ])("a signed body that is not JSON answers 400 without quoting the body in the log (%#)", async (body, probe) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid payload" });
    const out = logged();
    expect(out).toContain("Failed to process Phone.inc webhook");
    expect(out).toContain("SyntaxError");
    expect(out).not.toContain(probe);
  });

  it("an unsigned request is 401 and logs nothing", async () => {
    const res = await POST(post(payload("call.ended"), { signed: false }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(logged()).toBe("");
  });

});

describe("loggableEventName", () => {
  it("keeps the event names Phone.inc documents, and the older outside-hours name", () => {
    for (const e of ["call.outside_business_hours", "call.outside_opening_hours", "employee.status.changed", "voicemail.new"]) {
      expect(loggableEventName(e)).toBe(e);
    }
  });

  it("drops anything that is not on the documented list, even when it is shaped like an event name", () => {
    for (const v of [PHONE, "4520123456", TRANSCRIPT, "jens@example.com", "", undefined, null, 42, { from: PHONE }]) {
      expect(loggableEventName(v)).toBe("(not a Phone.inc event)");
    }
    expect(loggableEventName("call.4520123456")).toBe("(not a Phone.inc event)");
    expect(loggableEventName("call.transferred")).toBe("(not a Phone.inc event)");
  });
});

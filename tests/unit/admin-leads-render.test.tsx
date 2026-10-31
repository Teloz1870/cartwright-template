import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LeadDetails } from "@/app/admin/leads/LeadDetails";

/**
 * `/admin/leads` renders a lead's `source` and `data` — both of them public,
 * unauthenticated input written by whoever POSTed to `/api/inquiries`.
 *
 * The PR that added them asserted "TEXT ONLY — never innerHTML, never an href"
 * and "one bad row must not take down the whole inbox". Both were true when
 * read, and neither was tested: swapping the value cell for
 * `dangerouslySetInnerHTML` left all 320 test files green. A security property
 * nothing would notice losing is not a property, so it is rendered here.
 */
describe("/admin/leads renders lead.data as text, and survives whatever is in it", () => {
  it("escapes markup instead of executing it", () => {
    const html = renderToStaticMarkup(
      <LeadDetails
        data={{
          "<img src=x onerror=alert(1)>": "<script>alert(2)</script>",
          link: "javascript:alert(3)",
        }}
      />,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    // The escaped TEXT still contains the characters "src=", so assert on the
    // thing that actually matters: no element was produced from the input.
    expect(html).not.toMatch(/<(a|img|script|iframe|object|embed)\b/i);
  });

  it("degrades non-object JSON to ONE line instead of throwing", () => {
    // `not.toThrow()` alone stayed green with this whole branch replaced by a
    // bare `Object.entries(data)`, under which a bare string renders one row
    // PER CHARACTER and a number or boolean renders nothing at all. So assert
    // the promise as made: exactly one row, carrying the whole value.
    const cases: [unknown, string][] = [
      ["a bare string", "a bare string"],
      [42, "42"],
      [true, "true"],
      [["a", "b"], "[&quot;a&quot;,&quot;b&quot;]"],
      [{ "": "blank key" }, "blank key"],
    ];
    for (const [value, line] of cases) {
      const html = renderToStaticMarkup(<LeadDetails data={value} />);
      const rows = [...html.matchAll(/<dd[^>]*>(.*?)<\/dd>/g)].map((m) => m[1]);
      expect(rows, JSON.stringify(value)).toEqual([line]);
    }
  });

  it("renders nothing at all for the rows that predate the column", () => {
    expect(renderToStaticMarkup(<LeadDetails data={null} />)).toBe("");
    expect(renderToStaticMarkup(<LeadDetails data={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<LeadDetails data={{}} />)).toBe("");
  });

  it("shows every submitted field, with its key", () => {
    const html = renderToStaticMarkup(
      <LeadDetails data={{ meters: 42, model: "Type 1" }} />,
    );
    expect(html).toContain("2 submitted fields");
    expect(html).toContain("meters");
    expect(html).toContain("42");
    expect(html).toContain("Type 1");
  });
});

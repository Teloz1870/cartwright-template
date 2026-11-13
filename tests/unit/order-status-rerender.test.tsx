// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * After a status change the order page refreshes in place: the status control
 * stays mounted while `currentStatus` moves on. The control kept its old pick
 * in state, so the select SHOWED the first new option and SUBMITTED the status
 * just written — the server refused it, and the shown option could not be
 * picked, since choosing what is already displayed fires no change event.
 * Both controls (the plain form and the workspace timeline) had it.
 */

const action = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/admin/ordrer/actions", () => ({ updateOrderStatusAdmin: action }));

const { default: OrderStatusForm } = await import("@/components/admin/OrderStatusForm");
const { default: OrderTimeline } = await import("@/components/admin/OrderTimeline");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  action.mockReset();
  action.mockResolvedValue({ ok: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const select = () => host.querySelector("select") as HTMLSelectElement;
const submit = async () => {
  const button = [...host.querySelectorAll("button")].find((b) => /Update|Updating/.test(b.textContent ?? ""))!;
  await act(async () => {
    button.click();
  });
};

describe.each([
  ["the plain status form", (s: string) => <OrderStatusForm orderId="o1" currentStatus={s} />],
  ["the workspace timeline", (s: string) => <OrderTimeline orderId="o1" currentStatus={s} notes={[]} />],
])("%s after a refresh", (_name, render) => {
  it("submits the option it shows, not the status it just wrote", async () => {
    await act(async () => root.render(render("paid")));
    expect(select().value).toBe("processing");
    await submit();
    expect(action).toHaveBeenLastCalledWith("o1", "processing");

    // router.refresh(): same component, new status.
    await act(async () => root.render(render("processing")));
    expect(select().value).toBe("shipped");
    await submit();
    expect(action).toHaveBeenLastCalledWith("o1", "shipped");
  });

  it("keeps a pick that is still legal after the status moved", async () => {
    await act(async () => root.render(render("paid")));
    await act(async () => {
      select().value = "cancelled";
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => root.render(render("processing"))); // cancelled is legal from both
    expect(select().value).toBe("cancelled");
  });

  it("a request that fails says so in place: the control stays, and can be used again", async () => {
    action.mockRejectedValueOnce(new Error("network"));
    await act(async () => root.render(render("paid")));
    await submit();
    expect(host.textContent).toMatch(/Could not reach the server/);
    expect(select()).not.toBeNull(); // not taken to an error boundary
    const button = [...host.querySelectorAll("button")].find((b) => /Update/.test(b.textContent ?? ""))!;
    expect(button.disabled).toBe(false);
    await submit();
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("a pick is spent once it is submitted: the next status starts from its first option", async () => {
    await act(async () => root.render(render("paid")));
    await act(async () => {
      select().value = "cancelled";
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
    await submit();
    expect(action).toHaveBeenLastCalledWith("o1", "cancelled");
    // Had the order gone to processing instead (cancelled is legal there too),
    // the old pick must not come back as the preselected target.
    await act(async () => root.render(render("processing")));
    expect(select().value).toBe("shipped");
  });

  it("the button is disabled while the request is in flight", async () => {
    let finish!: (v: { ok: true }) => void;
    action.mockReturnValue(new Promise((r) => (finish = r)));
    await act(async () => root.render(render("paid")));
    const button = [...host.querySelectorAll("button")].find((b) => /Update/.test(b.textContent ?? ""))!;
    await act(async () => {
      button.click();
    });
    expect(button.disabled).toBe(true);
    expect(button.textContent).toMatch(/Updating/);
    await act(async () => finish({ ok: true }));
    expect(button.disabled).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
  });
});

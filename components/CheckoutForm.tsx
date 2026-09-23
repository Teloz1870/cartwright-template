"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { placeOrder, type PlaceOrderResult } from "@/app/[locale]/checkout/actions";
import { checkoutSchema } from "@/lib/validation";
import StripePaymentPanel from "@/components/StripePaymentPanel";

type FieldErrors = Partial<Record<string, string>>;
type FormValues = {
  shippingName: string;
  email: string;
  shippingAddress: string;
  shippingZip: string;
  shippingCity: string;
  discountCode: string;
};

type StripeData = Extract<PlaceOrderResult, { mode: "stripe" }>;

const EMPTY_VALUES: FormValues = {
  shippingName: "",
  email: "",
  shippingAddress: "",
  shippingZip: "",
  shippingCity: "",
  discountCode: "",
};

// Each checkout field has exactly one validation rule, so this field → Checkout
// message-key map fully covers the customer-facing field errors. We translate
// via next-intl here (client display) instead of surfacing checkoutSchema's raw
// English `issue.message`, so the da shops render Danish validation errors.
const FIELD_ERROR_KEY: Record<string, string> = {
  shippingName: "errName",
  email: "errEmail",
  shippingAddress: "errAddress",
  shippingZip: "errZip",
  shippingCity: "errCity",
  phoneNumber: "errPhone",
};

// placeOrder returns a language-neutral `code`; we render a localized message
// per code (the server keeps the English `error` for logs/tests/non-UI callers).
// Generic per-code copy — the specific product name / discount reason from the
// English `error` is intentionally not interpolated here (would require carrying
// params through createOrder's contract, which many machine consumers share).
const ORDER_ERROR_KEY: Record<string, string> = {
  VALIDATION: "errInvalid",
  EMPTY_CART: "errCartEmpty",
  OUT_OF_STOCK: "errOutOfStock",
  INVALID_DISCOUNT: "errDiscount",
  PAYMENT_INIT_FAILED: "errPayment",
  INTERNAL: "errOrderGeneric",
};

export default function CheckoutForm() {
  const t = useTranslations("Checkout");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [step, setStep] = useState<"form" | "payment">("form");
  const [stripeData, setStripeData] = useState<StripeData | null>(null);

  function updateField<K extends keyof FormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const rawData = { ...values };

    const result = checkoutSchema.safeParse({
      ...rawData,
      discountCode: rawData.discountCode || undefined,
    });
    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as string;
        if (!errors[key]) errors[key] = t(FIELD_ERROR_KEY[key] ?? "errInvalid");
      }
      setFieldErrors(errors);
      setServerError(null);
      return;
    }
    setFieldErrors({});
    setServerError(null);

    const formData = new FormData();
    for (const [k, v] of Object.entries(rawData)) {
      formData.append(k, v);
    }

    startTransition(async () => {
      const res = await placeOrder(formData);
      if (!res.ok) {
        setServerError(t(ORDER_ERROR_KEY[res.code] ?? "errOrderGeneric"));
        return;
      }
      if (res.mode === "mock") {
        router.push("/order/" + res.orderId);
        return;
      }
      // res.mode === "stripe"
      setStripeData(res);
      setStep("payment");
    });
  }

  const inputClass =
    "w-full rounded-full border border-sol-ink/20 bg-sol-cream px-5 py-3 text-sol-ink placeholder:text-sol-muted focus:outline-none focus:ring-2 focus:ring-sol-accent transition";
  const labelClass = "block text-sm font-bold text-sol-ink mb-1";

  if (step === "payment" && stripeData) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => {
            setStep("form");
            setStripeData(null);
          }}
          className="text-sm text-sol-muted hover:text-sol-ink underline"
        >
          {t("backToDelivery")}
        </button>

        <section className="rounded-2xl bg-sol-cream p-5 text-sm">
          <h3 className="font-black uppercase tracking-wide text-sol-ink mb-2">
            {t("deliveringTo")}
          </h3>
          <p className="text-sol-ink leading-relaxed">
            {values.shippingName}
            <br />
            {values.shippingAddress}
            <br />
            {values.shippingZip} {values.shippingCity}
            <br />
            <span className="text-sol-muted">{values.email}</span>
          </p>
        </section>

        <StripePaymentPanel
          clientSecret={stripeData.clientSecret}
          publishableKey={stripeData.publishableKey}
          chargeAmountMinor={stripeData.chargeAmountMinor}
          chargeCurrency={stripeData.chargeCurrency}
          orderId={stripeData.orderId}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {serverError && (
        <div className="rounded-2xl bg-red-50 border border-red-300 px-5 py-3 text-red-700 font-semibold text-sm">
          {serverError}
        </div>
      )}

      {[
        { name: "shippingName", label: t("fullName"), type: "text", autoComplete: "name", placeholder: t("fullNamePlaceholder") },
        { name: "email", label: t("email"), type: "email", autoComplete: "email", placeholder: t("emailPlaceholder") },
        { name: "shippingAddress", label: t("address"), type: "text", autoComplete: "street-address", placeholder: t("addressPlaceholder") },
      ].map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className={labelClass}>
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type}
            autoComplete={f.autoComplete}
            placeholder={f.placeholder}
            value={values[f.name as keyof FormValues]}
            onChange={(e) => updateField(f.name as keyof FormValues, e.target.value)}
            className={inputClass}
            aria-invalid={!!fieldErrors[f.name]}
            aria-describedby={fieldErrors[f.name] ? `${f.name}-error` : undefined}
          />
          {fieldErrors[f.name] && (
            <p id={`${f.name}-error`} role="alert" className="text-red-600 text-sm font-semibold mt-1">{fieldErrors[f.name]}</p>
          )}
        </div>
      ))}

      <div className="grid grid-cols-[120px_1fr] gap-4">
        <div>
          <label htmlFor="shippingZip" className={labelClass}>{t("postcode")}</label>
          <input
            id="shippingZip"
            name="shippingZip"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="2100"
            maxLength={4}
            value={values.shippingZip}
            onChange={(e) => updateField("shippingZip", e.target.value)}
            className={inputClass}
            aria-invalid={!!fieldErrors.shippingZip}
            aria-describedby={fieldErrors.shippingZip ? "shippingZip-error" : undefined}
          />
          {fieldErrors.shippingZip && (
            <p id="shippingZip-error" role="alert" className="text-red-600 text-sm font-semibold mt-1">{fieldErrors.shippingZip}</p>
          )}
        </div>
        <div>
          <label htmlFor="shippingCity" className={labelClass}>{t("city")}</label>
          <input
            id="shippingCity"
            name="shippingCity"
            type="text"
            autoComplete="address-level2"
            placeholder={t("cityPlaceholder")}
            value={values.shippingCity}
            onChange={(e) => updateField("shippingCity", e.target.value)}
            className={inputClass}
            aria-invalid={!!fieldErrors.shippingCity}
            aria-describedby={fieldErrors.shippingCity ? "shippingCity-error" : undefined}
          />
          {fieldErrors.shippingCity && (
            <p id="shippingCity-error" role="alert" className="text-red-600 text-sm font-semibold mt-1">{fieldErrors.shippingCity}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="discountCode" className={labelClass}>
          {t("discountCode")} <span className="text-sol-muted font-normal">{t("optional")}</span>
        </label>
        <input
          id="discountCode"
          name="discountCode"
          type="text"
          placeholder={t("discountPlaceholder")}
          value={values.discountCode}
          onChange={(e) => updateField("discountCode", e.target.value)}
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-sol-accent px-6 py-4 text-base font-black uppercase tracking-wide text-sol-cream transition hover:brightness-95 disabled:opacity-60"
      >
        {isPending ? t("processing") : t("continueToPayment")}
      </button>
    </form>
  );
}

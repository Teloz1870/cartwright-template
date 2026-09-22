"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateProfile, type ProfileState } from "./actions";

const INITIAL: ProfileState = { status: "idle" };

const inputClass =
  "w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:border-[var(--cw-brand-on-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--cw-brand-on-dark)]/20";

type InitialValues = {
  name: string;
  phoneNumber: string;
  shippingName: string;
  shippingAddress: string;
  shippingZip: string;
  shippingCity: string;
};

function Field({
  name,
  label,
  defaultValue,
  className,
}: {
  name: string;
  label: string;
  defaultValue: string;
  className?: string;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-sm font-bold text-white/80 ${className ?? ""}`}
    >
      {label}
      <input name={name} defaultValue={defaultValue} className={inputClass} />
    </label>
  );
}

export default function ProfileForm({ initial }: { initial: InitialValues }) {
  const t = useTranslations("Account");
  const [state, action, pending] = useActionState(updateProfile, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-3">
      <Field name="name" label={t("profile_name")} defaultValue={initial.name} />
      <Field name="phoneNumber" label={t("profile_phone")} defaultValue={initial.phoneNumber} />

      <hr className="my-1 border-white/10" />
      <p className="text-xs font-bold uppercase tracking-wider text-white/40">
        {t("profile_shippingAddress")}
      </p>
      <Field
        name="shippingName"
        label={t("profile_recipient")}
        defaultValue={initial.shippingName}
      />
      <Field
        name="shippingAddress"
        label={t("profile_address")}
        defaultValue={initial.shippingAddress}
      />
      <div className="flex gap-3">
        <Field
          name="shippingZip"
          label={t("profile_zip")}
          defaultValue={initial.shippingZip}
          className="w-1/3"
        />
        <Field
          name="shippingCity"
          label={t("profile_city")}
          defaultValue={initial.shippingCity}
          className="flex-1"
        />
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm font-bold text-red-400">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p className="text-sm font-bold text-green-400">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-xl bg-[var(--cw-brand)] px-4 py-3 font-bold text-white transition hover:bg-[var(--cw-brand-deep)] disabled:opacity-60"
      >
        {pending ? t("profile_saving") : t("profile_submit")}
      </button>
    </form>
  );
}

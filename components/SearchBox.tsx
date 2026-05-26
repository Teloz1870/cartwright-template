"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { brand } from "@/brand.config";

export default function SearchBox() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = value.trim();
    router.push(query ? `/produkter?q=${encodeURIComponent(query)}` : "/produkter");
  }

  return (
    <form onSubmit={handleSubmit} role="search" className="relative w-52">
      <label htmlFor="site-search" className="sr-only">
        {brand.uiLabels.searchAria}
      </label>
      <input
        id="site-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={brand.uiLabels.searchPlaceholder}
        className="w-full rounded-full border border-sol-ink/15 bg-white py-2 pl-9 pr-3 text-sm text-sol-ink placeholder:text-sol-muted outline-none transition focus:border-sol-accent focus:ring-2 focus:ring-sol-accent/20"
      />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sol-muted"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </form>
  );
}

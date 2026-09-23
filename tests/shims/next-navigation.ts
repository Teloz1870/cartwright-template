// Shim for `next/navigation` i Vitest. next-intl's createNavigation() (kaldt på
// module-load i @/i18n/routing) importerer next/navigation transitivt, hvilket
// ikke kan resolves i ren Node-test-runtime. Vi giver bare nok overflade til at
// modulet kan importeres uden at kaste — tests navigerer ikke rigtigt. Samme
// mønster som tests/shims/next-server.ts (for next-auth's next/server-import).
const notImplemented = () => {
  throw new Error("next/navigation shim: not implemented in unit-test runtime");
};

export const useRouter = () => ({
  push: () => {},
  replace: () => {},
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
});
export const usePathname = () => "/";
export const useSearchParams = () => new URLSearchParams();
export const useParams = () => ({});
export const useSelectedLayoutSegment = () => null;
export const useSelectedLayoutSegments = () => [];
export const redirect = notImplemented;
export const permanentRedirect = notImplemented;
export const notFound = notImplemented;
export const RedirectType = { push: "push", replace: "replace" } as const;

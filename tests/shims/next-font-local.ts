// Shim for `next/font/local` in Vitest — the sibling of ./next-font.ts. Like
// next/font/google it is a build-time transform; outside the compiler its
// default export just throws, so importing a self-hosted family module
// (app/fonts/<family>/font.ts, FONT1) would crash every test that pulls in the
// design registry. Returns the shape next/font produces, inert.
type FontResult = { className: string; variable: string; style: { fontFamily: string } };

export default function localFont(): FontResult {
  return { className: "", variable: "", style: { fontFamily: "" } };
}

# Slotting the Hoptify logo

Two ways to set the Hoptify brand mark — both feed the existing
`components/Logo.tsx` raster branch (`logoImageUrl ? <img> : <svg>`).

## A. The owner's finished logo (from Google AI Studio)

1. Drop the file in `public/` (e.g. `public/hoptify-logo.png`, SVG preferred).
2. Set it as the brand mark — either:
   - Admin: `/admin/indstillinger` → "Upload Logo Billede" → pick the file
     (uploads to Vercel Blob, saves `BrandingSettings.logoImageUrl`), **or**
   - Directly: set `BrandingSettings.logoImageUrl = "/hoptify-logo.png"` in the DB.
3. `invalidateBrandCache()` runs automatically via the admin action.

If it's an SVG outline you'd rather render as paths, paste the path `d`
attributes into the "SVG Paths" field instead (`logoMarkPaths`).

## B. Generate one with Gemini (the built-in generator — HOP2)

Enable `features.logoGenerator` in `brand.config.ts`, set a Gemini key
(`/admin/integrations` or `GOOGLE_GEMINI_API_KEY`) + `BLOB_READ_WRITE_TOKEN`,
then `/admin/indstillinger` → "🎨 Gemini-logo" → prompt → it generates
(`gemini-2.5-flash-image`), uploads to Blob, and sets `logoImageUrl` in one step.

This is the "agent preview" integration the owner referenced: same paid Gemini
image API, wired into the admin so any shop can regenerate its mark from a prompt.

import "server-only";

export const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
] as const;

export const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
] as const;

export const GOOGLE_DOCS_SCOPES = [
  "https://www.googleapis.com/auth/documents",
] as const;

export type GoogleScopeModule = "sheets" | "drive" | "docs";

const MODULE_SCOPES: Record<GoogleScopeModule, readonly string[]> = {
  sheets: GOOGLE_SHEETS_SCOPES,
  drive: GOOGLE_DRIVE_SCOPES,
  docs: GOOGLE_DOCS_SCOPES,
};

export function composeGoogleScopes(
  modules: readonly GoogleScopeModule[] = ["sheets", "drive", "docs"],
): string[] {
  return Array.from(new Set(modules.flatMap((module) => MODULE_SCOPES[module])));
}

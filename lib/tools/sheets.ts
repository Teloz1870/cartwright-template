import "server-only";

import { z } from "zod";

import {
  pullProductsFromSheet,
  pushProductsToSheet,
  syncProductsWithSheet,
} from "@/lib/sheets/sync";
import { defineTool } from "@/lib/tools/types";

const emptyInput = z.object({});

const sheetsErrorOutput = z.object({
  row: z.number().int().positive().optional(),
  sku: z.string().optional(),
  error: z.string(),
}).strict();

const sheetsResultBaseShape = {
  ok: z.boolean(),
  skipped: z.number().int().nonnegative(),
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  reason: z.string().optional(),
  error: z.string().optional(),
  errors: z.array(sheetsErrorOutput),
  spreadsheetId: z.string().optional(),
  finishedAt: z.iso.datetime(),
};

const sheetsPullOutput = z.object({
  ...sheetsResultBaseShape,
  mode: z.literal("pull"),
}).strict();

const sheetsPushOutput = z.object({
  ...sheetsResultBaseShape,
  mode: z.literal("push"),
}).strict();

const sheetsSyncOutput = z.object({
  ...sheetsResultBaseShape,
  mode: z.literal("sync"),
  pulled: sheetsPullOutput.optional(),
  pushed: sheetsPushOutput.optional(),
}).strict();

export const sheetsSyncNowTool = defineTool({
  name: "sheets.sync_now",
  description:
    "Run a two-way Google Sheets ↔ product catalog sync now. Pulls sheet rows first, then pushes the normalized catalog back to the sheet.",
  scope: "products:write",
  input: emptyInput,
  output: sheetsSyncOutput,
  handler: async () => syncProductsWithSheet(),
});

export const sheetsPullTool = defineTool({
  name: "sheets.pull",
  description:
    "Pull product rows from the configured Google Sheet into the catalog. Upserts products by SKU.",
  scope: "products:write",
  input: emptyInput,
  output: sheetsPullOutput,
  handler: async () => pullProductsFromSheet(),
});

export const sheetsPushTool = defineTool({
  name: "sheets.push",
  description:
    "Push the product catalog into the configured Google Sheet using the canonical product row schema.",
  scope: "products:write",
  input: emptyInput,
  output: sheetsPushOutput,
  handler: async () => pushProductsToSheet(),
});

export const sheetsTools = [sheetsSyncNowTool, sheetsPullTool, sheetsPushTool];

import "server-only";

import { z } from "zod";

import {
  pullProductsFromSheet,
  pushProductsToSheet,
  syncProductsWithSheet,
} from "@/lib/sheets/sync";
import { defineTool } from "@/lib/tools/types";

const emptyInput = z.object({});

export const sheetsSyncNowTool = defineTool({
  name: "sheets.sync_now",
  description:
    "Run a two-way Google Sheets ↔ product catalog sync now. Pulls sheet rows first, then pushes the normalized catalog back to the sheet.",
  scope: "products:write",
  input: emptyInput,
  handler: async () => syncProductsWithSheet(),
});

export const sheetsPullTool = defineTool({
  name: "sheets.pull",
  description:
    "Pull product rows from the configured Google Sheet into the catalog. Upserts products by SKU.",
  scope: "products:write",
  input: emptyInput,
  handler: async () => pullProductsFromSheet(),
});

export const sheetsPushTool = defineTool({
  name: "sheets.push",
  description:
    "Push the product catalog into the configured Google Sheet using the canonical product row schema.",
  scope: "products:write",
  input: emptyInput,
  handler: async () => pushProductsToSheet(),
});

export const sheetsTools = [sheetsSyncNowTool, sheetsPullTool, sheetsPushTool];

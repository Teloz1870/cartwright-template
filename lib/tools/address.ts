import { z } from "zod";
import { defineTool } from "./types";
import { searchAddresses, type AddressMatch } from "@/lib/address";

const autocompleteInput = z.object({
  query: z.string().min(2, "Search must be at least 2 characters").max(100),
});

const addressMatchOutput = z.strictObject({
  display: z.string(),
  address: z.string(),
  zip: z.string(),
  city: z.string(),
});

const autocompleteOutput = z.union([
  z.strictObject({
    matches: z.array(addressMatchOutput).max(5),
    count: z.number().int().min(0).max(5),
  }),
  z.strictObject({
    matches: z.tuple([]),
    count: z.literal(0),
    error: z.string(),
  }),
]);

export const addressAutocompleteTool = defineTool({
  name: "address.autocomplete",
  description: "Look up Danish addresses via DAWA (Denmark's Address Web API). Use when a customer needs to provide a shipping address - they only need to type the beginning (for example 'Vesterbro 12') to get a structured match with street, postal code, and city. Returns the top 5 most likely candidates.",
  scope: "catalog:read",
  input: autocompleteInput,
  output: autocompleteOutput,
  skipAudit: true,
  handler: async (args) => {
    try {
      const matches = await searchAddresses(args.query);
      return { matches, count: matches.length };
    } catch (error) {
      return {
        matches: [] as AddressMatch[],
        count: 0,
        error: error instanceof Error ? error.message : "Address lookup failed",
      };
    }
  },
});

export const addressTools = [addressAutocompleteTool];

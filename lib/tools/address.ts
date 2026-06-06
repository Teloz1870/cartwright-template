import { z } from "zod";
import { defineTool } from "./types";
import { searchAddresses, type AddressMatch } from "@/lib/address";

const autocompleteInput = z.object({
  query: z.string().min(2, "Search must be at least 2 characters").max(100),
});

export const addressAutocompleteTool = defineTool({
  name: "address.autocomplete",
  description: "Look up Danish addresses via DAWA (Denmark's Address Web API). Use when a customer needs to provide a shipping address - they only need to type the beginning (for example 'Vesterbro 12') to get a structured match with street, postal code, and city. Returns the top 5 most likely candidates.",
  scope: "catalog:read",
  input: autocompleteInput,
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

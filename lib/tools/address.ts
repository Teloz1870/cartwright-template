import { z } from "zod";
import { defineTool } from "./types";
import { searchAddresses, type AddressMatch } from "@/lib/address";

const autocompleteInput = z.object({
  query: z.string().min(2, "Søgning skal være mindst 2 tegn").max(100),
});

export const addressAutocompleteTool = defineTool({
  name: "address.autocomplete",
  description: "Slå danske adresser op via DAWA (Danmarks Adressers Web API). Brug når kunde skal angive shipping-adresse — de behøver kun skrive begyndelsen (fx 'Vesterbro 12') så får du et struktureret match med vej, postnr og by. Returnerer top 5 mest sandsynlige kandidater.",
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
        error: error instanceof Error ? error.message : "Adresse-opslag fejlede",
      };
    }
  },
});

export const addressTools = [addressAutocompleteTool];

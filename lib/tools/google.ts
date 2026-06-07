import "server-only";

import { z } from "zod";
import { getGoogleConnectionStatus } from "@/lib/google/oauth";
import { defineTool } from "@/lib/tools/types";

export const googleConnectStatusTool = defineTool({
  name: "google.connect_status",
  description:
    "Read the shared Google Workspace OAuth2 connector status for server-side Sheets/Drive/Docs modules. Does not expose tokens or client secrets.",
  scope: "settings:read",
  input: z.object({}),
  skipAudit: true,
  handler: async () => getGoogleConnectionStatus(),
});

export const googleTools = [googleConnectStatusTool];

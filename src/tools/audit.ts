// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch, subdomainBaseUrl } from "../shared/ado-rest.js";
import { toolError } from "../shared/tool-results.js";
import { continuationTokenParam } from "../shared/common-params.js";

const AUDIT_TOOLS = {
  query_log: "audit_query_log",
  list_actions: "audit_list_actions",
};

const auditApiVersion = "7.1-preview.1";

function configureAuditTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  async function request(pathAndQuery: string): Promise<Response> {
    const connection = await connectionProvider();
    const token = await tokenProvider();
    const baseUrl = subdomainBaseUrl(connection.serverUrl, "auditservice");
    return adoFetch({ url: `${baseUrl}/_apis/audit/${pathAndQuery}`, method: "GET", token, userAgent: userAgentProvider() });
  }

  registerTool(
    server,
    AUDIT_TOOLS.query_log,
    "Query the organization audit log for events in a time range. Results are paged; pass the continuationToken from a prior response to get the next batch.",
    {
      startTime: z.string().optional().describe("Start of the time range (ISO 8601, e.g. '2026-01-01T00:00:00Z'). Optional."),
      endTime: z.string().optional().describe("End of the time range (ISO 8601). Optional."),
      batchSize: z.coerce.number().optional().describe("Maximum number of events to return in this batch."),
      continuationToken: continuationTokenParam,
      skipAggregation: z.boolean().optional().describe("If true, return raw events without aggregating related ones."),
    },
    async ({ startTime, endTime, batchSize, continuationToken, skipAggregation }) => {
      try {
        const params = new URLSearchParams({ "api-version": auditApiVersion });
        if (startTime) params.append("startTime", startTime);
        if (endTime) params.append("endTime", endTime);
        if (batchSize !== undefined) params.append("batchSize", String(batchSize));
        if (continuationToken) params.append("continuationToken", continuationToken);
        if (skipAggregation !== undefined) params.append("skipAggregation", String(skipAggregation));

        const response = await request(`auditlog?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to query audit log (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        return toolError("querying audit log", error);
      }
    }
  );

  registerTool(server, AUDIT_TOOLS.list_actions, "List the available audit action IDs (the catalog of auditable actions), useful for understanding or filtering audit log entries.", {}, async () => {
    try {
      const response = await request(`actions?api-version=${auditApiVersion}`);
      if (!response.ok) {
        throw new Error(`Failed to list audit actions (${response.status}): ${await response.text()}`);
      }

      return { content: [{ type: "text", text: await response.text() }] };
    } catch (error) {
      return toolError("listing audit actions", error);
    }
  });
}

export { AUDIT_TOOLS, configureAuditTools };

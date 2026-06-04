// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch } from "../shared/ado-rest.js";

const OPERATIONS_TOOLS = {
  get_operation: "operations_get_operation",
};

const operationsApiVersion = "7.1";

function configureOperationsTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  registerTool(
    server,
    OPERATIONS_TOOLS.get_operation,
    "Get the status of a long-running (async) operation by its ID, e.g. the operation reference returned by core_create_project. The 'status' field is one of queued, inProgress, cancelled, succeeded, or failed.",
    {
      operationId: z.string().describe("The ID (GUID) of the operation to check."),
      pluginId: z.string().optional().describe("The plugin ID that owns the operation, if the operation reference includes one."),
    },
    async ({ operationId, pluginId }) => {
      try {
        const connection = await connectionProvider();
        const token = await tokenProvider();
        const baseUrl = connection.serverUrl.replace(/\/$/, "");
        const params = new URLSearchParams({ "api-version": operationsApiVersion });
        if (pluginId) params.append("pluginId", pluginId);

        const response = await adoFetch({
          url: `${baseUrl}/_apis/operations/${encodeURIComponent(operationId)}?${params.toString()}`,
          method: "GET",
          token,
          userAgent: userAgentProvider(),
        });

        if (response.status === 404) {
          return { content: [{ type: "text", text: `Operation '${operationId}' not found` }], isError: true };
        }
        if (!response.ok) {
          throw new Error(`Failed to get operation (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching operation: ${errorMessage}` }], isError: true };
      }
    }
  );
}

export { OPERATIONS_TOOLS, configureOperationsTools };

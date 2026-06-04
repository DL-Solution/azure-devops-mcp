// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch } from "../shared/ado-rest.js";

const FEATURE_MANAGEMENT_TOOLS = {
  get_feature_state: "featuremanagement_get_feature_state",
  set_feature_state: "featuremanagement_set_feature_state",
};

const featureManagementApiVersion = "7.1-preview.1";

// ContributedFeatureEnabledValue.
const FEATURE_STATE_VALUE = { undefined: 0, disabled: 1, enabled: 2 } as const;

// Builds the feature-state route. When a named scope (e.g. project/team) is given,
// the scoped route is used; otherwise the host/me route is used.
function featureStatePath(featureId: string, userScope: string, scopeName?: string, scopeValue?: string): string {
  if (scopeName && scopeValue) {
    return `featuremanagement/featurestatesforscope/${encodeURIComponent(userScope)}/${encodeURIComponent(scopeName)}/${encodeURIComponent(scopeValue)}/${encodeURIComponent(featureId)}`;
  }
  return `featuremanagement/featurestates/${encodeURIComponent(userScope)}/${encodeURIComponent(featureId)}`;
}

function configureFeatureManagementTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  async function request(method: string, pathAndQuery: string, body?: unknown): Promise<Response> {
    const connection = await connectionProvider();
    const token = await tokenProvider();
    const baseUrl = connection.serverUrl.replace(/\/$/, "");
    return adoFetch({ url: `${baseUrl}/_apis/${pathAndQuery}`, method, token, userAgent: userAgentProvider(), body });
  }

  const userScopeField = z.enum(["host", "me"]).optional().default("host").describe("'host' for the value applied to all users, or 'me' for the current user. Defaults to 'host'.");
  const scopeNameField = z.string().optional().describe("The named scope to target, e.g. 'project' or 'team'. Provide together with scopeValue to target a specific project/team.");
  const scopeValueField = z.string().optional().describe("The value of the named scope, e.g. the project or team ID. Required when scopeName is provided.");

  registerTool(
    server,
    FEATURE_MANAGEMENT_TOOLS.get_feature_state,
    "Get the state of a feature flag (toggle) by its contribution ID, optionally for a specific project/team scope.",
    {
      featureId: z.string().describe("The contribution ID of the feature, e.g. 'ms.feed.feed'."),
      userScope: userScopeField,
      scopeName: scopeNameField,
      scopeValue: scopeValueField,
    },
    async ({ featureId, userScope = "host", scopeName, scopeValue }) => {
      try {
        const path = featureStatePath(featureId, userScope, scopeName, scopeValue);
        const response = await request("GET", `${path}?api-version=${featureManagementApiVersion}`);
        if (response.status === 404) {
          return { content: [{ type: "text", text: `Feature '${featureId}' not found` }], isError: true };
        }
        if (!response.ok) {
          throw new Error(`Failed to get feature state (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching feature state: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    FEATURE_MANAGEMENT_TOOLS.set_feature_state,
    "Enable or disable a feature flag (toggle) by its contribution ID, optionally for a specific project/team scope.",
    {
      featureId: z.string().describe("The contribution ID of the feature, e.g. 'ms.feed.feed'."),
      state: z.enum(["enabled", "disabled", "undefined"]).describe("The desired state: 'enabled', 'disabled', or 'undefined' (inherit)."),
      userScope: userScopeField,
      scopeName: scopeNameField,
      scopeValue: scopeValueField,
      reason: z.string().optional().describe("Optional reason for the change (recorded with the state)."),
    },
    async ({ featureId, state, userScope = "host", scopeName, scopeValue, reason }) => {
      try {
        if (scopeName && !scopeValue) {
          return { content: [{ type: "text", text: "scopeValue is required when scopeName is provided." }], isError: true };
        }

        const body = {
          featureId,
          state: FEATURE_STATE_VALUE[state],
          scope: { settingScope: scopeName ?? null, userScoped: userScope === "me" },
          reason,
        };

        const path = featureStatePath(featureId, userScope, scopeName, scopeValue);
        const response = await request("PATCH", `${path}?api-version=${featureManagementApiVersion}`, body);
        if (!response.ok) {
          throw new Error(`Failed to set feature state (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error setting feature state: ${errorMessage}` }], isError: true };
      }
    }
  );
}

export { FEATURE_MANAGEMENT_TOOLS, configureFeatureManagementTools, featureStatePath };

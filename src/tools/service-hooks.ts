// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch } from "../shared/ado-rest.js";

const SERVICE_HOOKS_TOOLS = {
  list_subscriptions: "servicehook_list_subscriptions",
  get_subscription: "servicehook_get_subscription",
  create_subscription: "servicehook_create_subscription",
  delete_subscription: "servicehook_delete_subscription",
};

const serviceHooksApiVersion = "7.1";

function configureServiceHooksTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  async function request(method: string, pathAndQuery: string, body?: unknown): Promise<Response> {
    const connection = await connectionProvider();
    const token = await tokenProvider();
    const baseUrl = connection.serverUrl.replace(/\/$/, "");
    return adoFetch({ url: `${baseUrl}/${pathAndQuery}`, method, token, userAgent: userAgentProvider(), body });
  }

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.list_subscriptions,
    "List service hook subscriptions (webhooks) in the organization. Optionally filter by publisher, event type, or consumer.",
    {
      publisherId: z.string().optional().describe("Filter by publisher ID, e.g. 'tfs'."),
      eventType: z.string().optional().describe("Filter by event type, e.g. 'workitem.created' or 'git.push'."),
      consumerId: z.string().optional().describe("Filter by consumer ID, e.g. 'webHooks'."),
    },
    async ({ publisherId, eventType, consumerId }) => {
      try {
        const params = new URLSearchParams({ "api-version": serviceHooksApiVersion });
        if (publisherId) params.append("publisherId", publisherId);
        if (eventType) params.append("eventType", eventType);
        if (consumerId) params.append("consumerId", consumerId);

        const response = await request("GET", `_apis/hooks/subscriptions?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list subscriptions (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing service hook subscriptions: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.get_subscription,
    "Get a single service hook subscription (webhook) by its ID.",
    {
      subscriptionId: z.string().describe("The ID (GUID) of the subscription."),
    },
    async ({ subscriptionId }) => {
      try {
        const response = await request("GET", `_apis/hooks/subscriptions/${encodeURIComponent(subscriptionId)}?api-version=${serviceHooksApiVersion}`);
        if (response.status === 404) {
          return { content: [{ type: "text", text: `Subscription '${subscriptionId}' not found` }], isError: true };
        }
        if (!response.ok) {
          throw new Error(`Failed to get subscription (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching service hook subscription: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.create_subscription,
    "Create a service hook subscription (webhook). The subscription object is passed through to the REST API; it must include publisherId, eventType, consumerId, consumerActionId, publisherInputs, and consumerInputs (e.g. the target 'url' for the 'webHooks' consumer).",
    {
      subscription: z.record(z.unknown()).describe("The full subscription definition (publisherId, eventType, consumerId, consumerActionId, publisherInputs, consumerInputs, ...)."),
    },
    async ({ subscription }) => {
      try {
        const response = await request("POST", `_apis/hooks/subscriptions?api-version=${serviceHooksApiVersion}`, subscription);
        if (!response.ok) {
          throw new Error(`Failed to create subscription (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error creating service hook subscription: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.delete_subscription,
    "Delete a service hook subscription (webhook) by its ID. This is a destructive operation.",
    {
      subscriptionId: z.string().describe("The ID (GUID) of the subscription to delete."),
    },
    async ({ subscriptionId }) => {
      try {
        const response = await request("DELETE", `_apis/hooks/subscriptions/${encodeURIComponent(subscriptionId)}?api-version=${serviceHooksApiVersion}`);
        if (!response.ok) {
          throw new Error(`Failed to delete subscription (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: `Service hook subscription '${subscriptionId}' deleted.` }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error deleting service hook subscription: ${errorMessage}` }], isError: true };
      }
    }
  );
}

export { SERVICE_HOOKS_TOOLS, configureServiceHooksTools };

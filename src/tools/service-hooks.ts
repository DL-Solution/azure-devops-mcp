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
  update_subscription: "servicehook_update_subscription",
  list_publishers: "servicehook_list_publishers",
  list_event_types: "servicehook_list_event_types",
  list_consumers: "servicehook_list_consumers",
  get_consumer: "servicehook_get_consumer",
  list_notifications: "servicehook_list_notifications",
  get_notification: "servicehook_get_notification",
  send_test_notification: "servicehook_send_test_notification",
  get_subscription_diagnostics: "servicehook_get_subscription_diagnostics",
  update_subscription_diagnostics: "servicehook_update_subscription_diagnostics",
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

  async function call(action: string, method: string, pathAndQuery: string, body?: unknown) {
    try {
      const response = await request(method, pathAndQuery, body);
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status}: ${text}`);
      }
      return { content: [{ type: "text" as const, text: text || "Done." }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Error ${action}: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }

  function query(path: string, values: Record<string, string | number | boolean | undefined>): string {
    const params = new URLSearchParams({ "api-version": serviceHooksApiVersion });
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) params.append(key, String(value));
    }
    return [path, params.toString()].join("?");
  }

  const subscriptionIdParam = z.string().describe("The ID (GUID) of the subscription.");

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.update_subscription,
    "Replace a service hook subscription, e.g. to change its target URL, event filters or to disable it. Send the full subscription as returned by servicehook_get_subscription with the fields changed; set status 'disabledByUser' to pause it or 'enabled' to resume.",
    {
      subscriptionId: subscriptionIdParam,
      subscription: z.record(z.unknown()).describe("The full subscription definition (publisherId, eventType, consumerId, consumerActionId, publisherInputs, consumerInputs, status, ...)."),
    },
    async ({ subscriptionId, subscription }) => call(`updating subscription ${subscriptionId}`, "PUT", query(`_apis/hooks/subscriptions/${encodeURIComponent(subscriptionId)}`, {}), subscription)
  );

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.list_publishers,
    "List the publishers of service hook events, e.g. 'tfs' (work items, code, builds), 'rm' (releases), 'pipelines'. A publisher's inputDescriptors are the filters its subscriptions accept.",
    {},
    async () => call("listing publishers", "GET", query("_apis/hooks/publishers", {}))
  );

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.list_event_types,
    "List the event types a publisher raises, e.g. 'git.push' or 'workitem.updated' for 'tfs', with the filter inputs each one accepts. Use the event type ID as eventType when creating a subscription.",
    {
      publisherId: z.string().describe("The publisher ID, e.g. 'tfs', 'rm' or 'pipelines'."),
    },
    async ({ publisherId }) => call(`listing event types of ${publisherId}`, "GET", query(`_apis/hooks/publishers/${encodeURIComponent(publisherId)}/eventtypes`, {}))
  );

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.list_consumers,
    "List the services a subscription can deliver to, e.g. 'webHooks', 'azureServiceBus', 'slack', 'teams', with their actions and the inputs each action needs.",
    {
      publisherId: z.string().optional().describe("Only consumers that support at least one event type of this publisher."),
    },
    async ({ publisherId }) => call("listing consumers", "GET", query("_apis/hooks/consumers", { publisherId }))
  );

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.get_consumer,
    "Get one consumer service with its actions and their inputs, e.g. what 'webHooks' action 'httpRequest' needs (url, http headers, basic auth). Use the consumer and action IDs as consumerId and consumerActionId when creating a subscription.",
    {
      consumerId: z.string().describe("The consumer ID, e.g. 'webHooks'."),
      publisherId: z.string().optional().describe("Leave out actions that support no event type of this publisher."),
    },
    async ({ consumerId, publisherId }) => call(`getting consumer ${consumerId}`, "GET", query(`_apis/hooks/consumers/${encodeURIComponent(consumerId)}`, { publisherId }))
  );

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.list_notifications,
    "List recent deliveries of a subscription: the event, the request sent to the consumer and its response. Use it to find out why a webhook did not arrive.",
    {
      subscriptionId: subscriptionIdParam,
      maxResults: z.coerce.number().min(1).optional().describe("Maximum number of notifications to return. The service defaults to 100."),
      status: z.enum(["queued", "processing", "requestInProgress", "completed"]).optional().describe("Only notifications in this state."),
      result: z.enum(["pending", "succeeded", "failed", "filtered"]).optional().describe("Only notifications with this outcome, e.g. 'failed'."),
    },
    async ({ subscriptionId, maxResults, status, result }) =>
      call(`listing notifications of subscription ${subscriptionId}`, "GET", query(`_apis/hooks/subscriptions/${encodeURIComponent(subscriptionId)}/notifications`, { maxResults, status, result }))
  );

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.get_notification,
    "Get one delivery of a subscription with the full event payload, request and response.",
    {
      subscriptionId: subscriptionIdParam,
      notificationId: z.coerce.number().describe("The notification ID."),
    },
    async ({ subscriptionId, notificationId }) =>
      call(`getting notification ${notificationId}`, "GET", query(`_apis/hooks/subscriptions/${encodeURIComponent(subscriptionId)}/notifications/${notificationId}`, {}))
  );

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.send_test_notification,
    "Send a test event to a consumer to check a subscription's configuration. Give subscriptionId to test an existing subscription, or details (publisherId, eventType, consumerId, consumerActionId, publisherInputs, consumerInputs) to test one before creating it. The consumer really receives the request.",
    {
      subscriptionId: z.string().optional().describe("The ID (GUID) of an existing subscription to test."),
      details: z.record(z.unknown()).optional().describe("The subscription settings to test, as for servicehook_create_subscription."),
      useRealData: z.boolean().optional().describe("Send a recent real event instead of sample data. Only for existing subscriptions."),
    },
    async ({ subscriptionId, details, useRealData }) => {
      if (!subscriptionId && !details) {
        return { content: [{ type: "text", text: "Give subscriptionId or details." }], isError: true };
      }
      return call("sending a test notification", "POST", query("_apis/hooks/testnotifications", { useRealData }), { subscriptionId, details });
    }
  );

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.get_subscription_diagnostics,
    "Get the diagnostic settings of a subscription: whether delivery results, delivery tracing and evaluation tracing are recorded.",
    {
      subscriptionId: subscriptionIdParam,
    },
    async ({ subscriptionId }) => call(`getting diagnostics of subscription ${subscriptionId}`, "GET", query(`_apis/hooks/subscriptions/${encodeURIComponent(subscriptionId)}/diagnostics`, {}))
  );

  registerTool(
    server,
    SERVICE_HOOKS_TOOLS.update_subscription_diagnostics,
    "Turn diagnostic recording of a subscription on or off. Settings left out stay as they are.",
    {
      subscriptionId: subscriptionIdParam,
      deliveryResults: z.boolean().optional().describe("Record the result of each delivery."),
      deliveryTracing: z.boolean().optional().describe("Trace each delivery in detail."),
      evaluationTracing: z.boolean().optional().describe("Trace how events are matched against the subscription's filters."),
    },
    async ({ subscriptionId, deliveryResults, deliveryTracing, evaluationTracing }) => {
      const enabled = (value: boolean | undefined) => (value === undefined ? undefined : { enabled: value });
      if (deliveryResults === undefined && deliveryTracing === undefined && evaluationTracing === undefined) {
        return { content: [{ type: "text", text: "Nothing to change: give deliveryResults, deliveryTracing or evaluationTracing." }], isError: true };
      }
      return call(`updating diagnostics of subscription ${subscriptionId}`, "PUT", query(`_apis/hooks/subscriptions/${encodeURIComponent(subscriptionId)}/diagnostics`, {}), {
        deliveryResults: enabled(deliveryResults),
        deliveryTracing: enabled(deliveryTracing),
        evaluationTracing: enabled(evaluationTracing),
      });
    }
  );
}

export { SERVICE_HOOKS_TOOLS, configureServiceHooksTools };

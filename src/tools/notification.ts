// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { NotificationSubscriptionCreateParameters, NotificationSubscriptionUpdateParameters, SubscriptionQueryFlags } from "azure-devops-node-api/interfaces/NotificationInterfaces.js";
import { jsonResult, toolError } from "../shared/tool-results.js";

const NOTIFICATION_TOOLS = {
  list_subscriptions: "notification_list_subscriptions",
  get_subscription: "notification_get_subscription",
  create_subscription: "notification_create_subscription",
  update_subscription: "notification_update_subscription",
  delete_subscription: "notification_delete_subscription",
  list_event_types: "notification_list_event_types",
  get_event_type: "notification_get_event_type",
  list_subscription_templates: "notification_list_subscription_templates",
};

function configureNotificationTools(server: McpServer, _: () => Promise<string>, connectionProvider: () => Promise<WebApi>) {
  registerTool(
    server,
    NOTIFICATION_TOOLS.list_subscriptions,
    "List notification subscriptions, optionally filtered by target (a user or group ID) or by subscription IDs.",
    {
      targetId: z.string().optional().describe("Optional ID of a user or group to list subscriptions for."),
      ids: z.array(z.string()).optional().describe("Optional list of subscription IDs to retrieve."),
      queryFlags: z
        .array(z.enum(["IncludeInvalidSubscriptions", "IncludeDeletedSubscriptions", "IncludeFilterDetails", "AlwaysReturnBasicInformation", "IncludeSystemSubscriptions"]))
        .optional()
        .describe("Optional flags widening what is returned; combined together."),
      top: z.coerce.number().int().min(1).default(100).describe("Maximum number of subscriptions to return. The API does not page, so the list is cut here after it arrives."),
    },
    async ({ targetId, ids, queryFlags, top }) => {
      try {
        const connection = await connectionProvider();
        const notificationApi = await connection.getNotificationApi();
        const flags = queryFlags?.reduce((combined, flag) => combined | SubscriptionQueryFlags[flag], SubscriptionQueryFlags.None);
        const subscriptions = await notificationApi.listSubscriptions(targetId, ids, flags);

        return jsonResult((subscriptions ?? []).slice(0, top));
      } catch (error) {
        return toolError("fetching notification subscriptions", error);
      }
    }
  );

  registerTool(
    server,
    NOTIFICATION_TOOLS.get_subscription,
    "Get a specific notification subscription by ID.",
    {
      subscriptionId: z.string().describe("The ID of the notification subscription."),
    },
    async ({ subscriptionId }) => {
      try {
        const connection = await connectionProvider();
        const notificationApi = await connection.getNotificationApi();
        const subscription = await notificationApi.getSubscription(subscriptionId);

        return jsonResult(subscription);
      } catch (error) {
        return toolError("fetching notification subscription", error);
      }
    }
  );

  registerTool(
    server,
    NOTIFICATION_TOOLS.create_subscription,
    "Create a new notification subscription. Use notification_list_subscription_templates to discover available event filters.",
    {
      subscription: z.record(z.unknown()).describe("The subscription create parameters (e.g. { description, filter: { eventType }, channel: { type }, subscriber: { id } })."),
    },
    async ({ subscription }) => {
      try {
        const connection = await connectionProvider();
        const notificationApi = await connection.getNotificationApi();
        const result = await notificationApi.createSubscription(subscription as unknown as NotificationSubscriptionCreateParameters);

        return jsonResult(result);
      } catch (error) {
        return toolError("creating notification subscription", error);
      }
    }
  );

  registerTool(
    server,
    NOTIFICATION_TOOLS.update_subscription,
    "Update an existing notification subscription. Obtain the current subscription via notification_get_subscription, modify it, and pass back the update parameters.",
    {
      subscriptionId: z.string().describe("The ID of the subscription to update."),
      subscription: z.record(z.unknown()).describe("The subscription update parameters (e.g. { description, filter, channel, status })."),
    },
    async ({ subscriptionId, subscription }) => {
      try {
        const connection = await connectionProvider();
        const notificationApi = await connection.getNotificationApi();
        const result = await notificationApi.updateSubscription(subscription as unknown as NotificationSubscriptionUpdateParameters, subscriptionId);

        return jsonResult(result);
      } catch (error) {
        return toolError("updating notification subscription", error);
      }
    }
  );

  registerTool(
    server,
    NOTIFICATION_TOOLS.delete_subscription,
    "Delete a notification subscription by ID.",
    {
      subscriptionId: z.string().describe("The ID of the subscription to delete."),
    },
    async ({ subscriptionId }) => {
      try {
        const connection = await connectionProvider();
        const notificationApi = await connection.getNotificationApi();
        await notificationApi.deleteSubscription(subscriptionId);

        return { content: [{ type: "text", text: `Notification subscription ${subscriptionId} deleted` }] };
      } catch (error) {
        return toolError("deleting notification subscription", error);
      }
    }
  );

  registerTool(
    server,
    NOTIFICATION_TOOLS.list_event_types,
    "List the notification event types, optionally filtered by publisher.",
    {
      publisherId: z.string().optional().describe("Optional publisher ID to filter event types by (e.g. 'ms.vss-code')."),
    },
    async ({ publisherId }) => {
      try {
        const connection = await connectionProvider();
        const notificationApi = await connection.getNotificationApi();
        const eventTypes = await notificationApi.listEventTypes(publisherId);

        if (!eventTypes || eventTypes.length === 0) {
          return { content: [{ type: "text", text: "No notification event types found" }], isError: true };
        }
        return jsonResult(eventTypes);
      } catch (error) {
        return toolError("fetching notification event types", error);
      }
    }
  );

  registerTool(
    server,
    NOTIFICATION_TOOLS.get_event_type,
    "Get a specific notification event type by ID.",
    {
      eventType: z.string().describe("The ID of the notification event type. Use notification_list_event_types to discover IDs."),
    },
    async ({ eventType }) => {
      try {
        const connection = await connectionProvider();
        const notificationApi = await connection.getNotificationApi();
        const result = await notificationApi.getEventType(eventType);

        return jsonResult(result);
      } catch (error) {
        return toolError("fetching notification event type", error);
      }
    }
  );

  registerTool(server, NOTIFICATION_TOOLS.list_subscription_templates, "List the available notification subscription templates (default subscriptions that can be created).", {}, async () => {
    try {
      const connection = await connectionProvider();
      const notificationApi = await connection.getNotificationApi();
      const templates = await notificationApi.getSubscriptionTemplates();

      if (!templates || templates.length === 0) {
        return { content: [{ type: "text", text: "No notification subscription templates found" }], isError: true };
      }
      return jsonResult(templates);
    } catch (error) {
      return toolError("fetching notification subscription templates", error);
    }
  });
}

export { NOTIFICATION_TOOLS, configureNotificationTools };

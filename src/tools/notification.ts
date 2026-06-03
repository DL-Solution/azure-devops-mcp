// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { NotificationSubscriptionCreateParameters, NotificationSubscriptionUpdateParameters } from "azure-devops-node-api/interfaces/NotificationInterfaces.js";

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
  server.tool(
    NOTIFICATION_TOOLS.list_subscriptions,
    "List notification subscriptions, optionally filtered by target (a user or group ID) or by subscription IDs.",
    {
      targetId: z.string().optional().describe("Optional ID of a user or group to list subscriptions for."),
      ids: z.array(z.string()).optional().describe("Optional list of subscription IDs to retrieve."),
    },
    async ({ targetId, ids }) => {
      try {
        const connection = await connectionProvider();
        const notificationApi = await connection.getNotificationApi();
        const subscriptions = await notificationApi.listSubscriptions(targetId, ids);

        if (!subscriptions || subscriptions.length === 0) {
          return { content: [{ type: "text", text: "No notification subscriptions found" }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(subscriptions, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching notification subscriptions: ${errorMessage}` }], isError: true };
      }
    }
  );

  server.tool(
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

        return { content: [{ type: "text", text: JSON.stringify(subscription, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching notification subscription: ${errorMessage}` }], isError: true };
      }
    }
  );

  server.tool(
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

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error creating notification subscription: ${errorMessage}` }], isError: true };
      }
    }
  );

  server.tool(
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

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error updating notification subscription: ${errorMessage}` }], isError: true };
      }
    }
  );

  server.tool(
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
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error deleting notification subscription: ${errorMessage}` }], isError: true };
      }
    }
  );

  server.tool(
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
        return { content: [{ type: "text", text: JSON.stringify(eventTypes, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching notification event types: ${errorMessage}` }], isError: true };
      }
    }
  );

  server.tool(
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

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching notification event type: ${errorMessage}` }], isError: true };
      }
    }
  );

  server.tool(NOTIFICATION_TOOLS.list_subscription_templates, "List the available notification subscription templates (default subscriptions that can be created).", {}, async () => {
    try {
      const connection = await connectionProvider();
      const notificationApi = await connection.getNotificationApi();
      const templates = await notificationApi.getSubscriptionTemplates();

      if (!templates || templates.length === 0) {
        return { content: [{ type: "text", text: "No notification subscription templates found" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(templates, null, 2) }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return { content: [{ type: "text", text: `Error fetching notification subscription templates: ${errorMessage}` }], isError: true };
    }
  });
}

export { NOTIFICATION_TOOLS, configureNotificationTools };

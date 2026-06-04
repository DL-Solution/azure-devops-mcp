// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch, subdomainBaseUrl } from "../shared/ado-rest.js";

const GRAPH_TOOLS = {
  list_users: "graph_list_users",
  get_user: "graph_get_user",
  list_groups: "graph_list_groups",
  get_group: "graph_get_group",
  list_memberships: "graph_list_memberships",
  add_membership: "graph_add_membership",
  remove_membership: "graph_remove_membership",
};

const graphApiVersion = "7.1-preview.1";

function configureGraphTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  async function request(method: string, pathAndQuery: string, body?: unknown): Promise<Response> {
    const connection = await connectionProvider();
    const token = await tokenProvider();
    const baseUrl = subdomainBaseUrl(connection.serverUrl, "vssps");
    return adoFetch({ url: `${baseUrl}/_apis/graph/${pathAndQuery}`, method, token, userAgent: userAgentProvider(), body });
  }

  registerTool(
    server,
    GRAPH_TOOLS.list_users,
    "List users in the organization via the Graph API. Results are paged; pass the continuationToken from a prior response to get the next page.",
    {
      subjectTypes: z.string().optional().describe("Comma-separated subject types to filter by, e.g. 'aad,msa,svc'."),
      continuationToken: z.string().optional().describe("Continuation token from a previous response to fetch the next page."),
    },
    async ({ subjectTypes, continuationToken }) => {
      try {
        const params = new URLSearchParams({ "api-version": graphApiVersion });
        if (subjectTypes) params.append("subjectTypes", subjectTypes);
        if (continuationToken) params.append("continuationToken", continuationToken);

        const response = await request("GET", `users?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list users (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing users: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.get_user,
    "Get a single user by their Graph subject descriptor.",
    {
      userDescriptor: z.string().describe("The Graph subject descriptor of the user (e.g. 'aad.xxxxx')."),
    },
    async ({ userDescriptor }) => {
      try {
        const response = await request("GET", `users/${encodeURIComponent(userDescriptor)}?api-version=${graphApiVersion}`);
        if (response.status === 404) {
          return { content: [{ type: "text", text: `User '${userDescriptor}' not found` }], isError: true };
        }
        if (!response.ok) {
          throw new Error(`Failed to get user (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching user: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.list_groups,
    "List groups in the organization via the Graph API. Results are paged; pass the continuationToken from a prior response to get the next page.",
    {
      scopeDescriptor: z.string().optional().describe("Limit to groups within this scope descriptor (e.g. a project's scope)."),
      continuationToken: z.string().optional().describe("Continuation token from a previous response to fetch the next page."),
    },
    async ({ scopeDescriptor, continuationToken }) => {
      try {
        const params = new URLSearchParams({ "api-version": graphApiVersion });
        if (scopeDescriptor) params.append("scopeDescriptor", scopeDescriptor);
        if (continuationToken) params.append("continuationToken", continuationToken);

        const response = await request("GET", `groups?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list groups (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing groups: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.get_group,
    "Get a single group by its Graph subject descriptor.",
    {
      groupDescriptor: z.string().describe("The Graph subject descriptor of the group (e.g. 'vssgp.xxxxx')."),
    },
    async ({ groupDescriptor }) => {
      try {
        const response = await request("GET", `groups/${encodeURIComponent(groupDescriptor)}?api-version=${graphApiVersion}`);
        if (response.status === 404) {
          return { content: [{ type: "text", text: `Group '${groupDescriptor}' not found` }], isError: true };
        }
        if (!response.ok) {
          throw new Error(`Failed to get group (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching group: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.list_memberships,
    "List the memberships of a subject (user or group). Use direction 'up' to list the groups the subject belongs to, or 'down' to list the members of a group.",
    {
      subjectDescriptor: z.string().describe("The Graph subject descriptor of the user or group."),
      direction: z.enum(["up", "down"]).optional().default("up").describe("'up' = groups this subject belongs to; 'down' = members of this (group) subject. Defaults to 'up'."),
    },
    async ({ subjectDescriptor, direction = "up" }) => {
      try {
        const params = new URLSearchParams({ "api-version": graphApiVersion, direction });
        const response = await request("GET", `memberships/${encodeURIComponent(subjectDescriptor)}?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list memberships (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing memberships: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.add_membership,
    "Add a membership: make the subject (user or group) a member of the container group.",
    {
      subjectDescriptor: z.string().describe("The Graph subject descriptor of the member to add (user or group)."),
      containerDescriptor: z.string().describe("The Graph subject descriptor of the group to add the member to."),
    },
    async ({ subjectDescriptor, containerDescriptor }) => {
      try {
        const response = await request("PUT", `memberships/${encodeURIComponent(subjectDescriptor)}/${encodeURIComponent(containerDescriptor)}?api-version=${graphApiVersion}`);
        if (!response.ok) {
          throw new Error(`Failed to add membership (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error adding membership: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.remove_membership,
    "Remove a membership: remove the subject (user or group) from the container group. This is a destructive operation.",
    {
      subjectDescriptor: z.string().describe("The Graph subject descriptor of the member to remove (user or group)."),
      containerDescriptor: z.string().describe("The Graph subject descriptor of the group to remove the member from."),
    },
    async ({ subjectDescriptor, containerDescriptor }) => {
      try {
        const response = await request("DELETE", `memberships/${encodeURIComponent(subjectDescriptor)}/${encodeURIComponent(containerDescriptor)}?api-version=${graphApiVersion}`);
        if (!response.ok) {
          throw new Error(`Failed to remove membership (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: `Membership removed: '${subjectDescriptor}' from '${containerDescriptor}'.` }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error removing membership: ${errorMessage}` }], isError: true };
      }
    }
  );
}

export { GRAPH_TOOLS, configureGraphTools };

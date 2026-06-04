// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch, subdomainBaseUrl } from "../shared/ado-rest.js";

const ARTIFACTS_TOOLS = {
  list_feeds: "artifacts_list_feeds",
  get_feed: "artifacts_get_feed",
  create_feed: "artifacts_create_feed",
  list_packages: "artifacts_list_packages",
};

const artifactsApiVersion = "7.1-preview.1";

function configureArtifactsTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  // Feeds can be organization- or project-scoped. When a project is supplied the
  // path is prefixed with it; otherwise the feed is organization-scoped.
  async function request(method: string, project: string | undefined, pathAndQuery: string, body?: unknown): Promise<Response> {
    const connection = await connectionProvider();
    const token = await tokenProvider();
    const baseUrl = subdomainBaseUrl(connection.serverUrl, "feeds");
    const scope = project ? `${encodeURIComponent(project)}/` : "";
    return adoFetch({ url: `${baseUrl}/${scope}_apis/packaging/${pathAndQuery}`, method, token, userAgent: userAgentProvider(), body });
  }

  registerTool(
    server,
    ARTIFACTS_TOOLS.list_feeds,
    "List Azure Artifacts feeds in the organization (or in a project, if specified).",
    {
      project: z.string().optional().describe("The name or ID of the project for project-scoped feeds. Omit for organization-scoped feeds."),
      feedRole: z.enum(["administrator", "contributor", "collaborator", "reader"]).optional().describe("Only return feeds where the caller has at least this role."),
    },
    async ({ project, feedRole }) => {
      try {
        const params = new URLSearchParams({ "api-version": artifactsApiVersion });
        if (feedRole) params.append("feedRole", feedRole);

        const response = await request("GET", project, `feeds?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list feeds (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing feeds: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.get_feed,
    "Get a single Azure Artifacts feed by its ID or name.",
    {
      feedId: z.string().describe("The ID or name of the feed."),
      project: z.string().optional().describe("The name or ID of the project for project-scoped feeds. Omit for organization-scoped feeds."),
    },
    async ({ feedId, project }) => {
      try {
        const response = await request("GET", project, `feeds/${encodeURIComponent(feedId)}?api-version=${artifactsApiVersion}`);
        if (response.status === 404) {
          return { content: [{ type: "text", text: `Feed '${feedId}' not found` }], isError: true };
        }
        if (!response.ok) {
          throw new Error(`Failed to get feed (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching feed: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.create_feed,
    "Create a new Azure Artifacts feed in the organization (or in a project, if specified).",
    {
      name: z.string().describe("The name of the feed to create."),
      description: z.string().optional().describe("An optional description for the feed."),
      project: z.string().optional().describe("The name or ID of the project for a project-scoped feed. Omit for an organization-scoped feed."),
    },
    async ({ name, description, project }) => {
      try {
        const response = await request("POST", project, `feeds?api-version=${artifactsApiVersion}`, { name, description });
        if (!response.ok) {
          throw new Error(`Failed to create feed (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error creating feed: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.list_packages,
    "List packages in an Azure Artifacts feed, optionally filtered by protocol or name.",
    {
      feedId: z.string().describe("The ID or name of the feed."),
      project: z.string().optional().describe("The name or ID of the project for project-scoped feeds. Omit for organization-scoped feeds."),
      protocolType: z.string().optional().describe("Filter by protocol, e.g. 'npm', 'nuget', 'pypi', 'maven', 'upack'."),
      packageNameQuery: z.string().optional().describe("Filter packages whose name contains this substring."),
      top: z.coerce.number().default(50).describe("Maximum number of packages to return. Defaults to 50."),
    },
    async ({ feedId, project, protocolType, packageNameQuery, top }) => {
      try {
        const params = new URLSearchParams({ "api-version": artifactsApiVersion, "$top": String(top) });
        if (protocolType) params.append("protocolType", protocolType);
        if (packageNameQuery) params.append("packageNameQuery", packageNameQuery);

        const response = await request("GET", project, `feeds/${encodeURIComponent(feedId)}/packages?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list packages (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing packages: ${errorMessage}` }], isError: true };
      }
    }
  );
}

export { ARTIFACTS_TOOLS, configureArtifactsTools };

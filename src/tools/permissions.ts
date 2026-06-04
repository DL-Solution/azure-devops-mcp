// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch } from "../shared/ado-rest.js";

const PERMISSIONS_TOOLS = {
  list_security_namespaces: "permissions_list_security_namespaces",
  get_access_control_lists: "permissions_get_access_control_lists",
};

const permissionsApiVersion = "7.1";

function configurePermissionsTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  async function request(pathAndQuery: string): Promise<Response> {
    const connection = await connectionProvider();
    const token = await tokenProvider();
    const baseUrl = connection.serverUrl.replace(/\/$/, "");
    return adoFetch({ url: `${baseUrl}/_apis/${pathAndQuery}`, method: "GET", token, userAgent: userAgentProvider() });
  }

  registerTool(
    server,
    PERMISSIONS_TOOLS.list_security_namespaces,
    "List security namespaces. Each namespace defines the set of permissions (bitmask actions) for a class of resource (e.g. Git repositories, build, project). Use a namespace ID to query its access control lists.",
    {
      namespaceId: z.string().optional().describe("If provided, return only this namespace (by ID)."),
      localOnly: z.boolean().optional().describe("If true, return only namespaces served by the local (this) service."),
    },
    async ({ namespaceId, localOnly }) => {
      try {
        const params = new URLSearchParams({ "api-version": permissionsApiVersion });
        if (localOnly !== undefined) params.append("localOnly", String(localOnly));

        const path = namespaceId ? `securitynamespaces/${encodeURIComponent(namespaceId)}` : "securitynamespaces";
        const response = await request(`${path}?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list security namespaces (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing security namespaces: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    PERMISSIONS_TOOLS.get_access_control_lists,
    "Get the access control lists (ACLs) for a security namespace. Each ACL holds the access control entries (allow/deny permission bitmasks) for identities on a security token.",
    {
      namespaceId: z.string().describe("The ID of the security namespace (from list_security_namespaces)."),
      token: z.string().optional().describe("The security token (resource path) to scope to. Omit to return all ACLs in the namespace."),
      descriptors: z.string().optional().describe("Comma-separated identity descriptors to filter the ACEs by."),
      includeExtendedInfo: z.boolean().optional().describe("Include extended info (effective/inherited permissions) for each ACE."),
      recurse: z.boolean().optional().describe("If true and the token is hierarchical, also return ACLs for child tokens."),
    },
    async ({ namespaceId, token, descriptors, includeExtendedInfo, recurse }) => {
      try {
        const params = new URLSearchParams({ "api-version": permissionsApiVersion });
        if (token) params.append("token", token);
        if (descriptors) params.append("descriptors", descriptors);
        if (includeExtendedInfo !== undefined) params.append("includeExtendedInfo", String(includeExtendedInfo));
        if (recurse !== undefined) params.append("recurse", String(recurse));

        const response = await request(`accesscontrollists/${encodeURIComponent(namespaceId)}?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to get access control lists (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching access control lists: ${errorMessage}` }], isError: true };
      }
    }
  );
}

export { PERMISSIONS_TOOLS, configurePermissionsTools };

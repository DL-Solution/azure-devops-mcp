// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch, subdomainBaseUrl } from "../shared/ado-rest.js";

const EXTENSIONS_TOOLS = {
  list_installed: "extension_list_installed",
  get_installed: "extension_get_installed",
};

const extensionsApiVersion = "7.1-preview.1";

function configureExtensionsTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  async function request(pathAndQuery: string): Promise<Response> {
    const connection = await connectionProvider();
    const token = await tokenProvider();
    const baseUrl = subdomainBaseUrl(connection.serverUrl, "extmgmt");
    return adoFetch({ url: `${baseUrl}/_apis/extensionmanagement/${pathAndQuery}`, method: "GET", token, userAgent: userAgentProvider() });
  }

  registerTool(
    server,
    EXTENSIONS_TOOLS.list_installed,
    "List the extensions installed in the organization.",
    {
      includeDisabledExtensions: z.boolean().optional().describe("Include extensions that are installed but disabled."),
      includeErrors: z.boolean().optional().describe("Include extensions that failed to install."),
    },
    async ({ includeDisabledExtensions, includeErrors }) => {
      try {
        const params = new URLSearchParams({ "api-version": extensionsApiVersion });
        if (includeDisabledExtensions !== undefined) params.append("includeDisabledExtensions", String(includeDisabledExtensions));
        if (includeErrors !== undefined) params.append("includeErrors", String(includeErrors));

        const response = await request(`installedextensions?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list installed extensions (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing installed extensions: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    EXTENSIONS_TOOLS.get_installed,
    "Get a single installed extension by its publisher and extension name.",
    {
      publisherName: z.string().describe("The publisher name of the extension (e.g. 'ms')."),
      extensionName: z.string().describe("The extension name (e.g. 'vss-code-search')."),
    },
    async ({ publisherName, extensionName }) => {
      try {
        const response = await request(`installedextensionsbyname/${encodeURIComponent(publisherName)}/${encodeURIComponent(extensionName)}?api-version=${extensionsApiVersion}`);
        if (response.status === 404) {
          return { content: [{ type: "text", text: `Extension '${publisherName}.${extensionName}' not found` }], isError: true };
        }
        if (!response.ok) {
          throw new Error(`Failed to get installed extension (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching installed extension: ${errorMessage}` }], isError: true };
      }
    }
  );
}

export { EXTENSIONS_TOOLS, configureExtensionsTools };

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch, subdomainBaseUrl } from "../shared/ado-rest.js";
import { jsonResult, toolError } from "../shared/tool-results.js";

const EXTENSIONS_TOOLS = {
  list_installed: "extension_list_installed",
  get_installed: "extension_get_installed",
};

const extensionsApiVersion = "7.1-preview.1";

interface InstalledExtension {
  extensionId?: string;
  extensionName?: string;
  publisherId?: string;
  publisherName?: string;
  version?: string;
  flags?: string;
  installState?: { flags?: string; lastUpdated?: string };
}

// The listing carries each extension's full manifest (contributions, scopes, files): megabytes for a
// few dozen extensions. Keep what identifies it and its state; extension_get_installed has the rest.
// Absent fields stay undefined, which jsonResult's JSON.stringify leaves out.
function summarizeInstalledExtension({ extensionId, extensionName, publisherId, publisherName, version, flags, installState }: InstalledExtension) {
  return {
    extensionId,
    extensionName,
    publisherId,
    publisherName,
    version,
    flags,
    installState: installState && { flags: installState.flags, lastUpdated: installState.lastUpdated },
  };
}

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
    "List the extensions installed in the organization: id, name, publisher, version, flags and install state of each. Use extension_get_installed for one extension's full manifest.",
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

        const body = (await response.json()) as { value?: InstalledExtension[] } | InstalledExtension[];
        const extensions = Array.isArray(body) ? body : (body.value ?? []);
        return jsonResult(extensions.map(summarizeInstalledExtension));
      } catch (error) {
        return toolError("listing installed extensions", error);
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
        return toolError("fetching installed extension", error);
      }
    }
  );
}

export { EXTENSIONS_TOOLS, configureExtensionsTools };

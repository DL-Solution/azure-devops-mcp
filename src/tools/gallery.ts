// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";

const GALLERY_TOOLS = {
  query_extensions: "gallery_query_extensions",
  get_extension: "gallery_get_extension",
};

// ExtensionQueryFilterType.SearchText
const SEARCH_TEXT_FILTER_TYPE = 10;
// ExtensionQueryFlags.IncludeLatestVersionOnly — keeps results compact.
const INCLUDE_LATEST_VERSION_ONLY = 512;

function configureGalleryTools(server: McpServer, _: () => Promise<string>, connectionProvider: () => Promise<WebApi>) {
  registerTool(
    server,
    GALLERY_TOOLS.query_extensions,
    "Search the Visual Studio Marketplace (Gallery) for extensions by text. Returns matching published extensions.",
    {
      searchText: z.string().optional().describe("Text to search for. Omit to browse without a text filter."),
      top: z.coerce.number().default(20).describe("Maximum number of extensions to return. Defaults to 20."),
      flags: z.coerce.number().optional().describe("Advanced: ExtensionQueryFlags bitmask. Defaults to IncludeLatestVersionOnly (512)."),
    },
    async ({ searchText, top, flags }) => {
      try {
        const connection = await connectionProvider();
        const galleryApi = await connection.getGalleryApi();

        const extensionQuery = {
          filters: [
            {
              criteria: searchText ? [{ filterType: SEARCH_TEXT_FILTER_TYPE, value: searchText }] : [],
              pageNumber: 1,
              pageSize: top,
            },
          ],
          flags: flags ?? INCLUDE_LATEST_VERSION_ONLY,
        };

        const result = await galleryApi.queryExtensions({}, extensionQuery);

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error querying extensions: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GALLERY_TOOLS.get_extension,
    "Get a single Marketplace (Gallery) extension by its publisher and extension name.",
    {
      publisherName: z.string().describe("The publisher name, e.g. 'ms-vsts'."),
      extensionName: z.string().describe("The extension name, e.g. 'team-build-tasks'."),
      version: z.string().optional().describe("A specific version to retrieve. Omit for the latest."),
      flags: z.coerce.number().optional().describe("Advanced: ExtensionQueryFlags bitmask controlling included details."),
    },
    async ({ publisherName, extensionName, version, flags }) => {
      try {
        const connection = await connectionProvider();
        const galleryApi = await connection.getGalleryApi();
        const extension = await galleryApi.getExtension({}, publisherName, extensionName, version, flags);

        if (!extension) {
          return { content: [{ type: "text", text: `Extension '${publisherName}.${extensionName}' not found` }], isError: true };
        }

        return { content: [{ type: "text", text: JSON.stringify(extension, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching extension: ${errorMessage}` }], isError: true };
      }
    }
  );
}

export { GALLERY_TOOLS, configureGalleryTools };

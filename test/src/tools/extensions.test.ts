// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configureExtensionsTools, EXTENSIONS_TOOLS } from "../../../src/tools/extensions";
import { createToolServer } from "../../mocks/tool-server";

describe("configureExtensionsTools", () => {
  let server: McpServer;
  let tokenProvider: () => Promise<string>;
  let connectionProvider: () => Promise<WebApi>;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    server = createToolServer() as unknown as McpServer;
    tokenProvider = jest.fn(() => Promise.resolve("fake-token")) as () => Promise<string>;
    connectionProvider = jest.fn().mockResolvedValue({ serverUrl: "https://dev.azure.com/contoso" } as unknown as WebApi);
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  function getHandler(toolName: string) {
    configureExtensionsTools(server, tokenProvider, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
  }

  const ok = (body: string, status = 200) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body), json: () => Promise.resolve(JSON.parse(body)) });

  it("lists installed extensions on the extmgmt host", async () => {
    const handler = getHandler(EXTENSIONS_TOOLS.list_installed);
    mockFetch.mockResolvedValue(ok('{"count":0,"value":[]}'));

    const result = await handler({ includeDisabledExtensions: true, includeErrors: false });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("https://extmgmt.dev.azure.com/contoso/_apis/extensionmanagement/installedextensions?");
    expect(url).toContain("includeDisabledExtensions=true");
    expect(url).toContain("includeErrors=false");
    expect(init.method).toBe("GET");
    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });

  it("projects each installed extension to its identity and state, dropping the manifest", async () => {
    const handler = getHandler(EXTENSIONS_TOOLS.list_installed);
    const extensions = [
      {
        extensionId: "vss-code-search",
        extensionName: "Code Search",
        publisherId: "p1",
        publisherName: "ms",
        version: "20.1.0",
        flags: "builtIn, trusted",
        installState: { flags: "none", lastUpdated: "2026-01-01T00:00:00Z", installationIssues: [] },
        contributions: [{ id: "big" }],
        files: [{ assetType: "x" }],
      },
      { extensionId: "bare", publisherName: "someone" },
    ];
    mockFetch.mockResolvedValue(ok(JSON.stringify({ count: 2, value: extensions })));

    const result = await handler({});

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual([
      {
        extensionId: "vss-code-search",
        extensionName: "Code Search",
        publisherId: "p1",
        publisherName: "ms",
        version: "20.1.0",
        flags: "builtIn, trusted",
        installState: { flags: "none", lastUpdated: "2026-01-01T00:00:00Z" },
      },
      { extensionId: "bare", publisherName: "someone" },
    ]);
  });

  it("returns a failed listing as an error", async () => {
    const handler = getHandler(EXTENSIONS_TOOLS.list_installed);
    mockFetch.mockResolvedValue(ok("denied", 403));

    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error listing installed extensions: Failed to list installed extensions (403): denied");
  });

  it("gets an installed extension by publisher and name", async () => {
    const handler = getHandler(EXTENSIONS_TOOLS.get_installed);
    mockFetch.mockResolvedValue(ok('{"extensionId":"x"}'));

    await handler({ publisherName: "ms", extensionName: "vss-code-search" });

    expect(mockFetch.mock.calls[0][0]).toBe("https://extmgmt.dev.azure.com/contoso/_apis/extensionmanagement/installedextensionsbyname/ms/vss-code-search?api-version=7.1-preview.1");
  });

  it("returns 404 as an error", async () => {
    const handler = getHandler(EXTENSIONS_TOOLS.get_installed);
    mockFetch.mockResolvedValue(ok("", 404));

    const result = await handler({ publisherName: "ms", extensionName: "missing" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });
});

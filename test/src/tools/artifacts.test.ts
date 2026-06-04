// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configureArtifactsTools, ARTIFACTS_TOOLS } from "../../../src/tools/artifacts";

describe("configureArtifactsTools", () => {
  let server: McpServer;
  let tokenProvider: () => Promise<string>;
  let connectionProvider: () => Promise<WebApi>;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    server = { tool: jest.fn() } as unknown as McpServer;
    tokenProvider = jest.fn(() => Promise.resolve("fake-token")) as () => Promise<string>;
    connectionProvider = jest.fn().mockResolvedValue({ serverUrl: "https://dev.azure.com/contoso" } as unknown as WebApi);
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  function getHandler(toolName: string) {
    configureArtifactsTools(server, tokenProvider, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
  }

  const ok = (body: string, status = 200) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });

  it("lists org-scoped feeds on the feeds host", async () => {
    const handler = getHandler(ARTIFACTS_TOOLS.list_feeds);
    mockFetch.mockResolvedValue(ok("[]"));

    await handler({});

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("https://feeds.dev.azure.com/contoso/_apis/packaging/feeds?");
    expect(init.method).toBe("GET");
  });

  it("lists project-scoped feeds by prefixing the project", async () => {
    const handler = getHandler(ARTIFACTS_TOOLS.list_feeds);
    mockFetch.mockResolvedValue(ok("[]"));

    await handler({ project: "MyProject" });

    expect(mockFetch.mock.calls[0][0]).toContain("https://feeds.dev.azure.com/contoso/MyProject/_apis/packaging/feeds?");
  });

  it("creates a feed with name and description", async () => {
    const handler = getHandler(ARTIFACTS_TOOLS.create_feed);
    mockFetch.mockResolvedValue(ok('{"id":"feed-new"}'));

    await handler({ name: "my-feed", description: "desc" });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://feeds.dev.azure.com/contoso/_apis/packaging/feeds?api-version=7.1-preview.1");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "my-feed", description: "desc" });
  });

  it("lists packages with protocol filter and $top", async () => {
    const handler = getHandler(ARTIFACTS_TOOLS.list_packages);
    mockFetch.mockResolvedValue(ok('{"value":[]}'));

    await handler({ feedId: "my-feed", protocolType: "npm", top: 10 });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/_apis/packaging/feeds/my-feed/packages?");
    expect(url).toContain("protocolType=npm");
    expect(url).toContain("%24top=10");
  });
});

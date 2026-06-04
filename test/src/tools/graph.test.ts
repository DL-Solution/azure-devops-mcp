// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configureGraphTools, GRAPH_TOOLS } from "../../../src/tools/graph";

describe("configureGraphTools", () => {
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
    configureGraphTools(server, tokenProvider, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
  }

  const ok = (body: string, status = 200) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });

  it("lists users on the vssps host", async () => {
    const handler = getHandler(GRAPH_TOOLS.list_users);
    mockFetch.mockResolvedValue(ok('{"value":[]}'));

    await handler({ subjectTypes: "aad,msa" });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("https://vssps.dev.azure.com/contoso/_apis/graph/users?");
    expect(url).toContain("subjectTypes=aad%2Cmsa");
    expect(init.method).toBe("GET");
  });

  it("returns 404 as an error for get_user", async () => {
    const handler = getHandler(GRAPH_TOOLS.get_user);
    mockFetch.mockResolvedValue(ok("", 404));

    const result = await handler({ userDescriptor: "aad.abc" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("lists memberships with the requested direction", async () => {
    const handler = getHandler(GRAPH_TOOLS.list_memberships);
    mockFetch.mockResolvedValue(ok('{"value":[]}'));

    await handler({ subjectDescriptor: "aad.abc", direction: "down" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("https://vssps.dev.azure.com/contoso/_apis/graph/memberships/aad.abc?");
    expect(url).toContain("direction=down");
  });

  it("adds a membership via PUT", async () => {
    const handler = getHandler(GRAPH_TOOLS.add_membership);
    mockFetch.mockResolvedValue(ok("{}"));

    await handler({ subjectDescriptor: "aad.member", containerDescriptor: "vssgp.group" });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://vssps.dev.azure.com/contoso/_apis/graph/memberships/aad.member/vssgp.group?api-version=7.1-preview.1");
    expect(init.method).toBe("PUT");
  });

  it("removes a membership via DELETE", async () => {
    const handler = getHandler(GRAPH_TOOLS.remove_membership);
    mockFetch.mockResolvedValue(ok(""));

    const result = await handler({ subjectDescriptor: "aad.member", containerDescriptor: "vssgp.group" });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("DELETE");
    expect(result.content[0].text).toContain("Membership removed");
  });
});

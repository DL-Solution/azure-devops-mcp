// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configurePermissionsTools, PERMISSIONS_TOOLS } from "../../../src/tools/permissions";

describe("configurePermissionsTools", () => {
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
    configurePermissionsTools(server, tokenProvider, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
  }

  const ok = (body: string, status = 200) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });

  it("lists all security namespaces", async () => {
    const handler = getHandler(PERMISSIONS_TOOLS.list_security_namespaces);
    mockFetch.mockResolvedValue(ok("[]"));

    await handler({});

    expect(mockFetch.mock.calls[0][0]).toBe("https://dev.azure.com/contoso/_apis/securitynamespaces?api-version=7.1");
  });

  it("gets a single namespace by id", async () => {
    const handler = getHandler(PERMISSIONS_TOOLS.list_security_namespaces);
    mockFetch.mockResolvedValue(ok("[]"));

    await handler({ namespaceId: "ns-123", localOnly: true });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/_apis/securitynamespaces/ns-123?");
    expect(url).toContain("localOnly=true");
  });

  it("gets access control lists with token and descriptors", async () => {
    const handler = getHandler(PERMISSIONS_TOOLS.get_access_control_lists);
    mockFetch.mockResolvedValue(ok('{"value":[]}'));

    await handler({ namespaceId: "ns-123", token: "repoV2/abc", descriptors: "desc1", includeExtendedInfo: true });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/_apis/accesscontrollists/ns-123?");
    expect(url).toContain("token=repoV2%2Fabc");
    expect(url).toContain("descriptors=desc1");
    expect(url).toContain("includeExtendedInfo=true");
  });

  it("surfaces errors", async () => {
    const handler = getHandler(PERMISSIONS_TOOLS.get_access_control_lists);
    mockFetch.mockResolvedValue(ok("denied", 403));

    const result = await handler({ namespaceId: "ns-123" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error fetching access control lists");
  });
});

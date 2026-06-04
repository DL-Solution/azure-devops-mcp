// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configureMemberEntitlementTools, MEMBER_ENTITLEMENT_TOOLS, memberEntitlementBaseUrl } from "../../../src/tools/member-entitlement";

type TokenProviderMock = () => Promise<string>;
type ConnectionProviderMock = () => Promise<WebApi>;

describe("memberEntitlementBaseUrl", () => {
  it("maps the cloud host to vsaex", () => {
    expect(memberEntitlementBaseUrl("https://dev.azure.com/contoso")).toBe("https://vsaex.dev.azure.com/contoso");
  });

  it("maps the legacy visualstudio.com host to vsaex", () => {
    expect(memberEntitlementBaseUrl("https://contoso.visualstudio.com")).toBe("https://contoso.vsaex.visualstudio.com");
  });

  it("falls back to the same host for on-prem", () => {
    expect(memberEntitlementBaseUrl("https://tfs.local/collection")).toBe("https://tfs.local/collection");
  });
});

describe("configureMemberEntitlementTools", () => {
  let server: McpServer;
  let tokenProvider: TokenProviderMock;
  let connectionProvider: ConnectionProviderMock;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    server = { tool: jest.fn() } as unknown as McpServer;
    tokenProvider = jest.fn(() => Promise.resolve("fake-token")) as TokenProviderMock;
    connectionProvider = jest.fn().mockResolvedValue({ serverUrl: "https://dev.azure.com/contoso" } as unknown as WebApi);
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  function getHandler(toolName: string) {
    configureMemberEntitlementTools(server, tokenProvider, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
  }

  function ok(bodyText: string, status = 200) {
    return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(bodyText) };
  }

  it("lists user entitlements against the vsaex host with filters", async () => {
    const handler = getHandler(MEMBER_ENTITLEMENT_TOOLS.list_users);
    mockFetch.mockResolvedValue(ok('{"members":[]}'));

    const result = await handler({ filter: "name eq 'jdoe@contoso.com'", select: "Projects" });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("https://vsaex.dev.azure.com/contoso/_apis/userentitlements?");
    expect(url).toContain("api-version=7.1");
    expect(url).toContain("%24filter=name+eq+%27jdoe%40contoso.com%27");
    expect(url).toContain("select=Projects");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer fake-token");
    expect(result.content[0].text).toBe('{"members":[]}');
  });

  it("gets a user entitlement and surfaces 404 as an error", async () => {
    const handler = getHandler(MEMBER_ENTITLEMENT_TOOLS.get_user);
    mockFetch.mockResolvedValue(ok("", 404));

    const result = await handler({ userId: "abc-guid" });

    expect(mockFetch.mock.calls[0][0]).toBe("https://vsaex.dev.azure.com/contoso/_apis/userentitlements/abc-guid?api-version=7.1");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("adds a user with the advanced (Basic + Test Plans) license", async () => {
    const handler = getHandler(MEMBER_ENTITLEMENT_TOOLS.add_user);
    mockFetch.mockResolvedValue(ok('{"operationResult":{"isSuccess":true}}'));

    await handler({ principalName: "jdoe@contoso.com", accountLicenseType: "advanced" });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://vsaex.dev.azure.com/contoso/_apis/userentitlements?api-version=7.1");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json; charset=utf-8");
    expect(JSON.parse(init.body)).toEqual({
      accessLevel: { accountLicenseType: "advanced" },
      user: { principalName: "jdoe@contoso.com", subjectKind: "user" },
    });
  });

  it("updates a user's license with a JSON Patch document", async () => {
    const handler = getHandler(MEMBER_ENTITLEMENT_TOOLS.update_user_license);
    mockFetch.mockResolvedValue(ok('{"isSuccess":true}'));

    await handler({ userId: "abc-guid", accountLicenseType: "express" });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://vsaex.dev.azure.com/contoso/_apis/userentitlements/abc-guid?api-version=7.1");
    expect(init.method).toBe("PATCH");
    expect(init.headers["Content-Type"]).toBe("application/json-patch+json; charset=utf-8");
    expect(JSON.parse(init.body)).toEqual([{ op: "replace", path: "/accessLevel", value: { accountLicenseType: "express" } }]);
  });

  it("surfaces non-OK responses as errors", async () => {
    const handler = getHandler(MEMBER_ENTITLEMENT_TOOLS.add_user);
    mockFetch.mockResolvedValue(ok("forbidden", 403));

    const result = await handler({ principalName: "x@y.com", accountLicenseType: "express" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error adding user entitlement");
    expect(result.content[0].text).toContain("403");
  });
});

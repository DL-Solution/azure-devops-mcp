// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

jest.mock("../../src/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { logger } from "../../src/logger";
import { callerFromAuthorization, instrumentToolUsage, logToolCatalog, USAGE_EVENTS } from "../../src/shared/usage-stats";

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

describe("callerFromAuthorization", () => {
  it("reads the object id and sign-in name of a person", () => {
    expect(callerFromAuthorization(`Bearer ${jwt({ oid: "o-1", upn: "ann@contoso.com", unique_name: "other" })}`)).toEqual({ userId: "o-1", user: "ann@contoso.com" });
  });

  it("falls back through preferred_username, unique_name, email and the app id", () => {
    expect(callerFromAuthorization(`Bearer ${jwt({ preferred_username: "p@x" })}`).user).toBe("p@x");
    expect(callerFromAuthorization(`Bearer ${jwt({ unique_name: "u@x" })}`).user).toBe("u@x");
    expect(callerFromAuthorization(`Bearer ${jwt({ email: "e@x" })}`).user).toBe("e@x");
    expect(callerFromAuthorization(`bearer ${jwt({ oid: "sp", appid: "app-1" })}`)).toEqual({ userId: "sp", user: "app-1" });
    expect(callerFromAuthorization(`Bearer ${jwt({ azp: "app-2" })}`).user).toBe("app-2");
  });

  it("ignores claims that are not strings", () => {
    expect(callerFromAuthorization(`Bearer ${jwt({ oid: 42, upn: ["a"] })}`)).toEqual({ userId: undefined, user: undefined });
  });

  it("yields nothing for a missing header, another scheme, an opaque token or a broken payload", () => {
    expect(callerFromAuthorization(undefined)).toEqual({});
    expect(callerFromAuthorization("Basic abc")).toEqual({});
    expect(callerFromAuthorization("Bearer opaque-pat")).toEqual({});
    expect(callerFromAuthorization("Bearer a.!!!notjson.c")).toEqual({});
  });
});

describe("instrumentToolUsage", () => {
  async function connectedClient(endpoint: string) {
    const server = new McpServer({ name: "test", version: "1" });
    let clock = 1000;
    instrumentToolUsage(server, endpoint, () => (clock += 5));
    server.registerTool("echo_get", { inputSchema: { text: z.string(), count: z.number().optional() } }, async ({ text }) => ({ content: [{ type: "text", text }] }));
    server.registerTool("echo_fail", { inputSchema: {} }, async () => ({ content: [{ type: "text", text: "Azure DevOps said no" }], isError: true }));
    server.registerTool("echo_throw", { inputSchema: {} }, async () => {
      throw new Error("boom");
    });
    // Handlers other than tools/call pass through untouched.
    server.registerPrompt("hello", {}, () => ({ messages: [] }));

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "client", version: "1" });
    await client.connect(clientTransport);
    return client;
  }

  it("logs a successful call with its endpoint, argument names and duration", async () => {
    const client = await connectedClient("/mcp/dev");
    await client.callTool({ name: "echo_get", arguments: { text: "secret value", count: 2 } });

    expect(toolCallRecords()).toEqual([{ tool: "echo_get", endpoint: "/mcp/dev", argNames: ["count", "text"], client: undefined, outcome: "ok", durationMs: 5 }]);
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain("secret value");
  });

  it("tells error results, thrown handlers, invalid arguments and unknown tools apart", async () => {
    const client = await connectedClient("stdio");
    await client.callTool({ name: "echo_fail", arguments: {} });
    await client.callTool({ name: "echo_throw", arguments: {} });
    await client.callTool({ name: "echo_get", arguments: { text: 5 } });
    await client.callTool({ name: "nope", arguments: {} });

    expect(toolCallRecords().map((r) => [r.tool, r.outcome])).toEqual([
      ["echo_fail", "error"],
      ["echo_throw", "error"],
      ["echo_get", "invalid_args"],
      ["nope", "unknown_tool"],
    ]);
  });

  it("still lists prompts registered after instrumentation", async () => {
    const client = await connectedClient("stdio");
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(["hello"]);
  });
});

describe("logToolCatalog", () => {
  it("logs one line per domain", () => {
    logToolCatalog(
      new Map([
        ["core", ["core_list_projects"]],
        ["wiki", ["wiki_get_page", "wiki_list_pages"]],
      ])
    );
    expect(logger.info).toHaveBeenCalledWith(USAGE_EVENTS.toolCatalog, { domain: "core", tools: ["core_list_projects"] });
    expect(logger.info).toHaveBeenCalledWith(USAGE_EVENTS.toolCatalog, { domain: "wiki", tools: ["wiki_get_page", "wiki_list_pages"] });
  });
});

describe("instrumentToolUsage over HTTP", () => {
  it("labels the call with the caller and client from the request headers", async () => {
    let installed: ((request: unknown, extra: unknown) => Promise<unknown>) | undefined;
    const lowLevel = { setRequestHandler: jest.fn((_schema: unknown, handler: typeof installed) => (installed = handler)) };
    instrumentToolUsage({ server: lowLevel } as unknown as McpServer, "/mcp", () => 0);

    const { CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");
    const sdkHandler = jest.fn().mockResolvedValue({ content: [] });
    (lowLevel as unknown as McpServer["server"]).setRequestHandler(CallToolRequestSchema, sdkHandler);

    const headers = { "authorization": `Bearer ${jwt({ oid: "o-7", upn: "bob@contoso.com" })}`, "user-agent": ["Claude-User", "ignored"] };
    await (installed as NonNullable<typeof installed>)({ params: { name: "core_list_projects" } }, { requestInfo: { headers } });

    expect(toolCallRecords()).toEqual([{ tool: "core_list_projects", endpoint: "/mcp", argNames: [], client: "Claude-User", userId: "o-7", user: "bob@contoso.com", outcome: "ok", durationMs: 0 }]);
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain("signature");
  });

  it("logs a call whose handler rejects, then rethrows", async () => {
    let installed: ((request: unknown, extra: unknown) => Promise<unknown>) | undefined;
    const lowLevel = { setRequestHandler: jest.fn((_schema: unknown, handler: typeof installed) => (installed = handler)) };
    instrumentToolUsage({ server: lowLevel } as unknown as McpServer, "/mcp", () => 0);
    const { CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");
    (lowLevel as unknown as McpServer["server"]).setRequestHandler(CallToolRequestSchema, jest.fn().mockRejectedValue(new Error("elicitation")));

    await expect((installed as NonNullable<typeof installed>)({ params: { name: "x_get", arguments: { a: 1 } } }, undefined)).rejects.toThrow("elicitation");
    expect(toolCallRecords().map((r) => r.outcome)).toEqual(["error"]);
  });
});

function toolCallRecords() {
  return (logger.info as jest.Mock).mock.calls.filter(([event]) => event === USAGE_EVENTS.toolCall).map(([, record]) => record);
}

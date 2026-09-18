// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { slimTool, slimToolList } from "../../src/shared/tool-list";
import { registerTool } from "../../src/shared/tool-registration";

async function listTools(server: McpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await server.connect(serverSide);
  await client.connect(clientSide);
  const result = await client.listTools();
  await client.close();
  return result.tools;
}

describe("slimToolList", () => {
  it("drops $schema and the default execution from every listed tool", async () => {
    const server = new McpServer({ name: "t", version: "1" });
    slimToolList(server);
    registerTool(server, "wit_get_work_item", "Get a work item.", { id: z.number().describe("The id.") }, async () => ({ content: [] }));

    const [tool] = await listTools(server);

    expect(tool.inputSchema).not.toHaveProperty("$schema");
    expect(tool).not.toHaveProperty("execution");
    expect(tool.inputSchema.properties).toEqual({ id: { type: "number", description: "The id." } });
    expect(tool.annotations).toEqual({ readOnlyHint: true });
  });

  it("leaves other request handlers alone", async () => {
    const server = new McpServer({ name: "t", version: "1" });
    slimToolList(server);
    registerTool(server, "core_create_team", "Create a team.", { name: z.string() }, async () => ({ content: [{ type: "text", text: "done" }] }));

    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await server.connect(serverSide);
    await client.connect(clientSide);
    const result = await client.callTool({ name: "core_create_team", arguments: { name: "x" } });
    await client.close();

    expect(result.content).toEqual([{ type: "text", text: "done" }]);
  });
});

describe("slimTool", () => {
  const base: Tool = { name: "x", inputSchema: { type: "object", $schema: "http://json-schema.org/draft-07/schema#", properties: {} } as Tool["inputSchema"] };

  it("keeps an execution that is not the default", () => {
    expect(slimTool({ ...base, execution: { taskSupport: "optional" } }).execution).toEqual({ taskSupport: "optional" });
  });

  it("drops $schema from an output schema too", () => {
    const slim = slimTool({ ...base, outputSchema: { type: "object", $schema: "x" } as Tool["outputSchema"] });
    expect(slim.outputSchema).not.toHaveProperty("$schema");
  });

  it("does not mutate the tool it was given", () => {
    slimTool(base);
    expect(base.inputSchema).toHaveProperty("$schema");
  });
});

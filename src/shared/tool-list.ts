// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Trims what the SDK adds to every entry of a tools/list response but no client
// needs. The full tool list is paid for in model context on every request, so
// per-tool boilerplate multiplies by ~620:
//
//   inputSchema.$schema          the JSON Schema dialect URL        ~8k tokens
//   execution.taskSupport         "forbidden" is what absence means  ~6k tokens
//
// additionalProperties:false stays: strict clients rely on it.

import { ListToolsRequestSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { interceptRequestHandler } from "./request-interception.js";

function withoutDialect<T extends object>(schema: T): T {
  const copy = { ...schema } as T & { $schema?: unknown };
  delete copy.$schema;
  return copy;
}

/** A copy of `tool` without the fields that carry no information. */
export function slimTool(tool: Tool): Tool {
  const slim: Tool = { ...tool, inputSchema: withoutDialect(tool.inputSchema) };
  if (tool.outputSchema) {
    slim.outputSchema = withoutDialect(tool.outputSchema);
  }
  if (!tool.execution?.taskSupport || tool.execution.taskSupport === "forbidden") {
    delete slim.execution;
  }
  return slim;
}

/**
 * Slim every tools/list response of `server`.
 *
 * Must run before the first tool is registered, like instrumentToolUsage:
 * McpServer installs its tools/list handler lazily on the first registration,
 * and this wraps that handler as it is installed.
 */
export function slimToolList(server: McpServer): void {
  interceptRequestHandler(server, ListToolsRequestSchema, (handler) => {
    const listHandler = handler as (...args: unknown[]) => Promise<{ tools: Tool[] }>;
    return async (...args: unknown[]) => {
      const result = await listHandler(...args);
      return { ...result, tools: result.tools.map(slimTool) };
    };
  });
}

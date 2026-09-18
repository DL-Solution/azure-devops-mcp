// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Shared monkey-patch scaffold for wrapping a single low-level request
// handler as McpServer installs it. `instrumentToolUsage` (tools/call, for
// the usage log) and `slimToolList` (tools/list, to trim the response) both
// need this same trick for two different request schemas, so it lives once
// here instead of twice with its own cast-heavy copy in each module.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type AnyHandler = (...args: unknown[]) => Promise<unknown>;

/**
 * Replace the handler `server` installs for `schema` with `wrap(handler)`.
 * A handler installed for any other schema passes through untouched.
 *
 * Must run before the first tool is registered: McpServer installs its
 * request handlers lazily, on the first registration, so the interception
 * has to be in place before that happens in order to see the real handler.
 */
export function interceptRequestHandler(server: McpServer, schema: unknown, wrap: (handler: AnyHandler) => AnyHandler): void {
  const lowLevel = server.server;
  const original = lowLevel.setRequestHandler.bind(lowLevel) as (...args: unknown[]) => void;

  (lowLevel as unknown as { setRequestHandler: (...args: unknown[]) => void }).setRequestHandler = (candidateSchema: unknown, handler: unknown) => {
    if (candidateSchema !== schema || typeof handler !== "function") {
      original(candidateSchema, handler);
      return;
    }
    original(candidateSchema, wrap(handler as AnyHandler));
  };
}

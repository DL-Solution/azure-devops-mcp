// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Tool usage statistics: one structured log line per tool call.
//
// The server exposes hundreds of tools and has no other way to learn which of
// them are used, by whom, and which fail or get called with arguments the
// schema rejects. The lines go to stderr like every other log, so a deployed
// server collects them in Log Analytics with no extra infrastructure; the
// queries that turn them into a report are in docs/USAGE-STATS.md.
//
// What is recorded: the tool name, the endpoint (bare or a preset), the
// outcome, the duration, the *names* of the arguments passed, the client's
// User-Agent and the caller's identity from the bearer token (Entra object id
// and sign-in name), so activity can be split by person and role. Argument
// values, results and the token itself are never logged.

import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { logger } from "../logger.js";
import { interceptRequestHandler } from "./request-interception.js";

/** Who made a call, as far as the bearer token says. */
export interface Caller {
  /** Entra object id — stable per person or service principal. */
  userId?: string;
  /** Sign-in name (UPN) for a person, or the application id for an app-only token. */
  user?: string;
}

export type ToolCallOutcome = "ok" | "error" | "invalid_args" | "unknown_tool";

export interface ToolCallRecord extends Caller {
  tool: string;
  /** The URL path that served the call ("/mcp", "/mcp/dev"), or "stdio" for the local transport. */
  endpoint: string;
  outcome: ToolCallOutcome;
  durationMs: number;
  argNames: string[];
  client?: string;
}

/** Log event names, kept stable because the KQL queries filter on them. */
export const USAGE_EVENTS = { toolCall: "tool_call", toolCatalog: "tool_catalog" } as const;

type Headers = Record<string, string | string[] | undefined>;

function header(headers: Headers | undefined, name: string): string | undefined {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Read the caller's identity from a bearer token's JWT claims.
 *
 * The payload is decoded, not verified: in OAuth mode the provider has already
 * verified the token, in passthrough mode Azure DevOps rejects a forged one on
 * the first API call, and either way the result only labels a log line. Opaque
 * tokens (a PAT sent as bearer) carry no identity and yield `{}`.
 */
export function callerFromAuthorization(authorization: string | undefined): Caller {
  const match = authorization?.match(/^\s*bearer\s+(\S+)\s*$/i);
  const parts = match?.[1].split(".");
  if (!parts || parts.length !== 3) {
    return {};
  }
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const text = (key: string) => (typeof claims[key] === "string" ? (claims[key] as string) : undefined);
    return {
      userId: text("oid"),
      user: text("upn") ?? text("preferred_username") ?? text("unique_name") ?? text("email") ?? text("appid") ?? text("azp"),
    };
  } catch {
    return {};
  }
}

function outcomeOf(result: unknown): ToolCallOutcome {
  const r = result as { isError?: boolean; content?: { text?: unknown }[] } | undefined;
  if (!r?.isError) {
    return "ok";
  }
  // The SDK turns a schema rejection and an unknown tool name into an isError
  // result before any handler runs, from an McpError whose message it prefixes
  // with "MCP error <code>: "; these are the messages it uses.
  const text = typeof r.content?.[0]?.text === "string" ? r.content[0].text : "";
  if (/^MCP error -32602: Input validation error/.test(text)) {
    return "invalid_args";
  }
  if (/^MCP error -32602: Tool \S+ (not found|disabled)$/.test(text)) {
    return "unknown_tool";
  }
  return "error";
}

/**
 * Log one line per `tools/call` handled by `server`.
 *
 * Must run before the first tool is registered: McpServer installs its
 * `tools/call` handler lazily on the first registration, and this wraps that
 * handler as it is installed. Wrapping the request handler rather than each
 * tool callback is what lets it see calls the SDK rejects before any callback
 * runs — invalid arguments and unknown tool names.
 */
export function instrumentToolUsage(server: McpServer, endpoint: string, now: () => number = Date.now): void {
  interceptRequestHandler(server, CallToolRequestSchema, (handler) => {
    const callHandler = handler as (request: { params: { name: string; arguments?: Record<string, unknown> } }, extra: { requestInfo?: { headers?: Headers } }) => Promise<unknown>;
    return async (...args: unknown[]) => {
      const [request, extra] = args as Parameters<typeof callHandler>;
      const started = now();
      const headers = extra?.requestInfo?.headers;
      const base = {
        tool: request.params.name,
        endpoint,
        argNames: Object.keys(request.params.arguments ?? {}).sort(),
        client: header(headers, "user-agent"),
        ...callerFromAuthorization(header(headers, "authorization")),
      };
      try {
        const result = await callHandler(request, extra);
        logToolCall({ ...base, outcome: outcomeOf(result), durationMs: now() - started });
        return result;
      } catch (error) {
        // Only URL-elicitation errors escape the SDK's handler; still a call.
        logToolCall({ ...base, outcome: "error", durationMs: now() - started });
        throw error;
      }
    };
  });
}

export function logToolCall(record: ToolCallRecord): void {
  logger.info(USAGE_EVENTS.toolCall, record);
}

/**
 * Log the tools each domain registers, one line per domain, so a report can
 * list the tools that were never called. One line per domain keeps every line
 * well under the container log line limit.
 */
export function logToolCatalog(toolsByDomain: ReadonlyMap<string, readonly string[]>): void {
  for (const [domain, tools] of toolsByDomain) {
    logger.info(USAGE_EVENTS.toolCatalog, { domain, tools });
  }
}

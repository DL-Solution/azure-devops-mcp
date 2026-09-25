// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ZodRawShape } from "zod";
import { McpServer, RegisteredTool, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

// Categories that map to MCP tool annotations. Clients (e.g. the Claude tool
// permissions UI) bucket tools using these hints:
//   read        -> readOnlyHint: true                      ("Read-only tools")
//   write        -> readOnlyHint: false, destructiveHint: false ("Other tools")
//   destructive  -> readOnlyHint: false, destructiveHint: true  ("Write/delete tools")
export type ToolCategory = "read" | "write" | "destructive";

const CATEGORY_ANNOTATIONS: Record<ToolCategory, ToolAnnotations> = {
  read: { readOnlyHint: true },
  write: { readOnlyHint: false, destructiveHint: false },
  destructive: { readOnlyHint: false, destructiveHint: true },
};

// Verb segments (matched against the underscore-delimited tool name) used to
// infer a category. Order of evaluation in categorizeTool: destructive first,
// then read, otherwise write.
const DESTRUCTIVE_VERBS = new Set(["delete", "remove", "unlink", "destroy"]);
const READ_VERBS = new Set(["list", "get", "show", "search", "find", "query", "my", "read"]);

// Verbs whose second call with the same arguments changes nothing more: setting
// or replacing a value, deleting or locking something. Clients may retry these.
const IDEMPOTENT_VERBS = new Set(["set", "replace", "delete", "remove", "destroy", "unlink", "lock", "unlock"]);

// Explicit overrides for tools whose name does not imply the correct category.
const CATEGORY_OVERRIDES: Record<string, ToolCategory> = {
  // A connectivity check with no side effects.
  mcp_apps_ping: "read",
  // "compare" names no verb the heuristics know, but the tool only reads a diff.
  repo_compare_commits: "read",
  // "lookup" only resolves descriptors to subjects.
  graph_lookup_subjects: "read",
  // "set" reads as an ordinary write, but a deny bit or a merge=false replace
  // can lock every user out of a resource, so clients should confirm it.
  permissions_set_access_control_entries: "destructive",
  // Same risk for feeds: role "none" on the last administrator locks everyone out of a feed,
  // and the global variant decides who may create or administer any feed at all.
  artifacts_set_feed_permissions: "destructive",
  artifacts_set_global_permissions: "destructive",
  // Opening a protected resource (a production environment, a service connection) to every
  // pipeline removes a security boundary just as surely as deleting a check does.
  approvals_set_pipeline_permissions: "destructive",
  // Sharing a service connection hands its credentials to every pipeline of another project.
  serviceendpoint_share_service_endpoint: "destructive",
  // Switching off secret scanning or push protection removes a safeguard; switching a plan on starts billing.
  advsec_update_enablement: "destructive",
  // Moving a project to another process rewrites its work item types, states and fields.
  wit_migrate_project_process: "destructive",
  // Can make a private project public, or rename it under every link that points at it.
  core_update_project: "destructive",
  // Creates a project for the whole organization, with its own permissions and billing footprint.
  core_create_project: "destructive",
  // A field is organization-wide and every process sees it; it cannot be renamed later.
  wit_create_field: "destructive",
};

export function categorizeTool(name: string): ToolCategory {
  if (name in CATEGORY_OVERRIDES) {
    return CATEGORY_OVERRIDES[name];
  }
  const segments = name.split("_");
  if (segments.some((segment) => DESTRUCTIVE_VERBS.has(segment))) {
    return "destructive";
  }
  if (segments.some((segment) => READ_VERBS.has(segment))) {
    return "read";
  }
  return "write";
}

// Registers a tool with the MCP annotations for its inferred category.
//
// Goes through `server.registerTool`, which takes the annotations as part of
// the registration. The positional `server.tool(name, description, schema, cb)`
// overloads this used to call are deprecated in the SDK.
export function registerTool<Args extends ZodRawShape>(server: McpServer, name: string, description: string, paramsSchema: Args, cb: ToolCallback<Args>): RegisteredTool {
  return server.registerTool(name, { description, inputSchema: paramsSchema, annotations: toolAnnotations(name) }, cb);
}

export function toolAnnotations(name: string): ToolAnnotations {
  const category = categorizeTool(name);
  // The hint only means something for a tool that writes; a read is idempotent by definition.
  const idempotent = category !== "read" && name.split("_").some((segment) => IDEMPOTENT_VERBS.has(segment));
  return idempotent ? { ...CATEGORY_ANNOTATIONS[category], idempotentHint: true } : CATEGORY_ANNOTATIONS[category];
}

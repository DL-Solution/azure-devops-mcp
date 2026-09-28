// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// The two shapes almost every tool handler returns. Each tool module used to
// spell them out inline — 328 identical catch blocks and seven local copies of
// an ok/failed pair — so they live here once.

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { enumName, type FieldInfo, type TypeInfoLike, typeInfoOf } from "./enum-names.js";

// Deeper than any Azure DevOps payload; past it the value is serialized as is.
const MAX_DEPTH = 64;

/**
 * `value` as a model should read it:
 *
 * - HAL `_links` go. They were 40–75% of a work item or a Graph membership and
 *   only repeat URLs the model can build or does not need. The one a person
 *   wants — the page in the web UI (`_links.web` / `_links.html`) — stays as
 *   `webUrl`, unless the object already has one. Plain `url` fields stay:
 *   relation and attachment URLs are data.
 * - Enum fields of a node-api result are written by name, as the REST API
 *   itself writes them (see enum-names.ts).
 *
 * The input is not modified. A cycle is left in place, so JSON.stringify still
 * rejects it as it did before.
 */
export function shapeForOutput(value: unknown): unknown {
  return shape(value, undefined, 0, new Set());
}

function shape(value: unknown, typeInfo: TypeInfoLike | undefined, depth: number, ancestors: Set<object>): unknown {
  if (typeof value !== "object" || value === null || depth > MAX_DEPTH || ancestors.has(value)) return value;
  // Dates and anything else that serializes itself.
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") return value;

  const type = typeInfo ?? typeInfoOf(value);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => shape(item, type, depth + 1, ancestors));
    }
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      if (key === "_links") {
        const webUrl = webUrlOf(source._links);
        if (webUrl && !Object.hasOwn(source, "webUrl")) out.webUrl = webUrl;
        continue;
      }
      out[key] = shapeField(source[key], type?.fields?.[key], depth + 1, ancestors);
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

function shapeField(value: unknown, field: FieldInfo | undefined, depth: number, ancestors: Set<object>): unknown {
  if (!field) return shape(value, undefined, depth, ancestors);
  if (field.isArray && Array.isArray(value)) {
    return field.enumType ? value.map((item) => enumName(field.enumType, item)) : shape(value, field.typeInfo, depth, ancestors);
  }
  if (field.isDictionary && typeof value === "object" && value !== null && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const name = field.dictionaryKeyEnumType && /^-?\d+$/.test(key) ? enumName(field.dictionaryKeyEnumType, Number(key)) : key;
      out[String(name)] = field.dictionaryValueEnumType
        ? enumName(field.dictionaryValueEnumType, item)
        : field.dictionaryValueFieldInfo
          ? shapeField(item, field.dictionaryValueFieldInfo, depth + 1, ancestors)
          : shape(item, field.dictionaryValueTypeInfo, depth + 1, ancestors);
    }
    return out;
  }
  if (field.enumType) return enumName(field.enumType, value);
  return shape(value, field.typeInfo, depth, ancestors);
}

function webUrlOf(links: unknown): string | undefined {
  const all = links as { web?: { href?: unknown }; html?: { href?: unknown } } | null | undefined;
  const href = all?.web?.href ?? all?.html?.href;
  return typeof href === "string" && href ? href : undefined;
}

/**
 * A successful result carrying `value` as JSON. Compact on purpose: the reader
 * is a model, and indentation made typical Azure DevOps payloads 13–15% longer.
 * The value is shaped for that reader first (see `shapeForOutput`).
 */
export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(shapeForOutput(value)) }] };
}

/**
 * A REST response body as the model should read it: JSON with `_links` is
 * shaped like `jsonResult` output; anything else — a body without links,
 * an empty body, or text that is not JSON — comes back unchanged.
 */
export function compactJsonText(text: string): string {
  if (!text.includes('"_links"')) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  return typeof parsed === "object" && parsed !== null ? JSON.stringify(shapeForOutput(parsed)) : text;
}

/** A successful result carrying a REST response body (see `compactJsonText`). */
export function jsonTextResult(text: string): CallToolResult {
  return { content: [{ type: "text", text: compactJsonText(text) }] };
}

/** The text to show for something a handler caught. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown error occurred";
}

/** A failed result: `Error <action>: <message>`. */
export function toolError(action: string, error: unknown): CallToolResult {
  return { content: [{ type: "text", text: `Error ${action}: ${errorMessage(error)}` }], isError: true };
}

/** The sentence a paged tool's description ends with, so the model knows to ask for the next page. */
export const PAGED_RESULT_NOTE = "Returns {hasMore, continuationToken, items}; while hasMore is true, pass continuationToken back to get the next page.";

/**
 * One page of a paged list: `{hasMore, continuationToken?, items}`. The token
 * comes first so a reader sees it even when a long page gets cut off; pass it
 * back as the tool's `continuationToken` for the next page.
 */
export function pagedResult(items: unknown, continuationToken?: string): CallToolResult {
  return jsonResult(continuationToken ? { hasMore: true, continuationToken, items } : { hasMore: false, items });
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Azure DevOps answers with enum *names* ("visibility": "private",
// "status": "active"), but azure-devops-node-api turns them into numbers: every
// client method ends with `this.formatResponse(res.result, TypeInfo.X, …)`,
// whose ContractSerializer.deserialize maps each enum field through
// `TypeInfo.X.fields[f].enumType.enumValues`. A model reading the tool output
// then sees `"visibility": 0` and has to guess.
//
// This makes every REST client the connection hands out remember which TypeInfo
// its `formatResponse` applied to each result (a WeakMap keyed by the returned
// object — for a wrapped collection that is the array `body.value`), so
// `jsonResult` can turn the numbers back into names when it serializes. Inside a
// handler the values stay numbers, so code comparing them against the enums
// keeps working. A projection a handler builds by hand loses the link; it can
// restore it with `withEnumNames(value, TypeInfo.X)`.
//
// continuation.ts wraps the same `formatResponse`. Both wrappers call through to
// whatever was there before and return the very object it returned, each
// guards against patching the same client twice, and neither depends on the
// other — so they compose in either order.

import { WebApi } from "azure-devops-node-api";

/** The part of node-api's TypeInfo metadata this module reads (see Serialization.js). */
export interface FieldInfo {
  isArray?: boolean;
  isDictionary?: boolean;
  enumType?: EnumInfo;
  typeInfo?: TypeInfoLike;
  dictionaryKeyEnumType?: EnumInfo;
  dictionaryValueEnumType?: EnumInfo;
  dictionaryValueTypeInfo?: TypeInfoLike;
  dictionaryValueFieldInfo?: FieldInfo;
}

export interface TypeInfoLike {
  fields?: Record<string, FieldInfo>;
}

export interface EnumInfo {
  enumValues?: Record<string, number>;
}

interface ClientInternals {
  formatResponse?: (data: unknown, typeInfo?: unknown, ...args: unknown[]) => unknown;
}

const typeInfos = new WeakMap<object, TypeInfoLike>();
const patched = new WeakSet<object>();
const reverseMaps = new WeakMap<EnumInfo, [number, string][]>();

// getCoreApi, getBuildApi, … — every factory that hands out a REST client.
const API_FACTORIES = Object.getOwnPropertyNames(WebApi.prototype).filter((name) => /^get\w+Api$/.test(name));

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/**
 * Mark `value` (an object or array) as an instance of `typeInfo` — for an array,
 * each element is one — so `jsonResult` writes its enum fields as names. Returns `value`.
 */
export function withEnumNames<T>(value: T, typeInfo: unknown): T {
  if (isObject(value) && isObject(typeInfo)) typeInfos.set(value, typeInfo as TypeInfoLike);
  return value;
}

/** The TypeInfo node-api deserialized `value` with, if known. */
export function typeInfoOf(value: unknown): TypeInfoLike | undefined {
  return isObject(value) ? typeInfos.get(value) : undefined;
}

function entriesOf(enumType: EnumInfo): [number, string][] {
  let entries = reverseMaps.get(enumType);
  if (!entries) {
    entries = [];
    const seen = new Set<number>();
    for (const [name, value] of Object.entries(enumType.enumValues ?? {})) {
      // The first name listed for a value wins, as in the REST API's own output.
      if (typeof value === "number" && !seen.has(value)) {
        seen.add(value);
        entries.push([value, name]);
      }
    }
    reverseMaps.set(enumType, entries);
  }
  return entries;
}

/**
 * The name of `value` in `enumType`. A value no single member has is read as a
 * set of flags ("edit, rename", the way the REST API writes a flags enum);
 * a number that neither explains is returned unchanged.
 */
export function enumName(enumType: EnumInfo | undefined, value: unknown): unknown {
  if (!enumType || typeof value !== "number") return value;
  const entries = entriesOf(enumType);
  const exact = entries.find(([member]) => member === value);
  if (exact) return exact[1];
  if (!Number.isInteger(value) || value <= 0) return value;

  // Largest members first, like .NET's Enum.ToString for a [Flags] enum.
  let remaining = value;
  const names: string[] = [];
  for (const [member, name] of [...entries].sort((a, b) => b[0] - a[0])) {
    if (member > 0 && (remaining & member) === member) {
      names.unshift(name);
      remaining &= ~member;
    }
  }
  return remaining === 0 && names.length > 0 ? names.join(", ") : value;
}

function recordTypeInfo<T>(client: T): T {
  const internals = client as ClientInternals | undefined;
  const formatResponse = internals?.formatResponse;
  if (!internals || typeof formatResponse !== "function" || patched.has(internals)) {
    return client;
  }
  patched.add(internals);

  internals.formatResponse = function (this: unknown, data: unknown, typeInfo?: unknown, ...args: unknown[]) {
    return withEnumNames(formatResponse.call(this, data, typeInfo, ...args), typeInfo);
  };
  return client;
}

/** Make every REST client `connection` hands out remember the TypeInfo of each result, so its enums serialize as names. Returns the same object. */
export function captureEnumTypes(connection: WebApi): WebApi {
  const factories = connection as unknown as Record<string, unknown>;
  for (const factory of API_FACTORIES) {
    const original = factories[factory];
    if (typeof original === "function") {
      factories[factory] = async (...args: unknown[]) => recordTypeInfo(await original.apply(connection, args));
    }
  }
  return connection;
}

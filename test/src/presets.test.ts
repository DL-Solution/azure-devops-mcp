// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, jest } from "@jest/globals";

// domains.ts pulls in the winston logger, whose Azure dependency confuses the
// suite's ".js" -> ".ts" module mapping.
jest.mock("../../src/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { Domain } from "../../src/shared/domains";
import { ADMIN_ONLY_TOOLS, PRESET_NAMES, resolvePreset, resolvePresetTools, TOOL_PRESETS } from "../../src/shared/presets";

const ALL_DOMAINS = Object.values(Domain) as string[];

describe("TOOL_PRESETS", () => {
  it.each(PRESET_NAMES)("'%s' names only real domains and has no duplicates", (name) => {
    const domains = TOOL_PRESETS[name];
    expect(domains.length).toBeGreaterThan(0);
    expect(domains.every((d) => ALL_DOMAINS.includes(d))).toBe(true);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it.each(PRESET_NAMES)("'%s' carries the project, identity and search entry points", (name) => {
    const domains = new Set<string>(TOOL_PRESETS[name]);
    expect(domains.has(Domain.CORE)).toBe(true);
    expect(domains.has(Domain.PROFILE)).toBe(true);
    expect(domains.has(Domain.SEARCH)).toBe(true);
  });

  // A preset exists to serve fewer tools than the full endpoint; one that grew
  // to cover everything would cost the caller context for nothing.
  it.each(PRESET_NAMES)("'%s' is strictly smaller than the full domain list", (name) => {
    expect(TOOL_PRESETS[name].length).toBeLessThan(ALL_DOMAINS.length);
  });

  // Every domain must be reachable from some preset, or a client that picks
  // presets can never get to it.
  it("covers every domain between them, except the opt-in mcp-apps domain", () => {
    const covered = new Set<string>(PRESET_NAMES.flatMap((name) => TOOL_PRESETS[name]));
    const uncovered = ALL_DOMAINS.filter((d) => !covered.has(d));
    expect(uncovered).toEqual([Domain.MCP_APPS]);
  });
});

describe("resolvePreset", () => {
  it("resolves a known preset to its domains", () => {
    const domains = resolvePreset("dev");
    expect(domains?.has(Domain.REPOSITORIES)).toBe(true);
    expect(domains?.has(Domain.WIT_PROCESS)).toBe(false);
  });

  it("ignores surrounding whitespace and case", () => {
    expect(resolvePreset("  ADMIN ")).toEqual(resolvePreset("admin"));
  });

  it("returns undefined for an unknown name so the caller can answer 404", () => {
    expect(resolvePreset("nope")).toBeUndefined();
    expect(resolvePreset("")).toBeUndefined();
    expect(resolvePreset("constructor")).toBeUndefined();
  });

  it("narrows a preset to the domains the server enabled", () => {
    const enabled = new Set<string>([Domain.CORE, Domain.REPOSITORIES]);
    expect(resolvePreset("dev", enabled)).toEqual(new Set([Domain.CORE, Domain.REPOSITORIES]));
    expect(resolvePreset("admin", enabled)).toEqual(new Set([Domain.CORE]));
  });

  it("still refuses an unknown preset when narrowing", () => {
    expect(resolvePreset("nope", new Set<string>([Domain.CORE]))).toBeUndefined();
  });
});

describe("resolvePresetTools", () => {
  it.each(["dev", "plan", "ops"])("'%s' leaves out every admin-only tool", (name) => {
    const tools = resolvePresetTools(name);
    for (const [tool, domain] of Object.entries(ADMIN_ONLY_TOOLS)) {
      expect(tools?.allows(tool, domain)).toBe(false);
    }
    expect(tools?.allows("core_list_projects", Domain.CORE)).toBe(true);
    expect(tools?.domains).toEqual(resolvePreset(name));
  });

  it("gives admin the admin-only tools of domains it does not otherwise serve", () => {
    const tools = resolvePresetTools("admin");
    expect(tools?.domains.has(Domain.WORK_ITEMS)).toBe(true);
    expect(tools?.allows("wit_migrate_project_process", Domain.WORK_ITEMS)).toBe(true);
    expect(tools?.allows("wit_create_work_item", Domain.WORK_ITEMS)).toBe(false);
    expect(tools?.allows("core_delete_project", Domain.CORE)).toBe(true);
    expect(tools?.allows("graph_list_users", Domain.GRAPH)).toBe(true);
  });

  it("does not borrow a domain the server has not enabled", () => {
    const tools = resolvePresetTools("admin", new Set<string>([Domain.CORE, Domain.GRAPH]));
    expect(tools?.domains).toEqual(new Set([Domain.CORE, Domain.GRAPH]));
  });

  it("returns undefined for an unknown preset", () => {
    expect(resolvePresetTools("nope")).toBeUndefined();
  });
});

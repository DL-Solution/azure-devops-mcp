// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Named subsets of the tool domains, served from their own URL path.
//
// The full server registers about 620 tools, and their schemas cost roughly 136k
// tokens in the model's context on every request — enough to crowd out the
// work itself and to make the choice between 600 near-neighbours noisier than
// it needs to be. MCP has no notion of tool groups, so the only way to hand a
// client a smaller surface is to serve fewer tools.
//
// The HTTP transport is stateless (a fresh McpServer per request), so the
// preset can simply be a path segment: "/mcp" serves whatever --domains
// configured, "/mcp/dev" serves the developer subset. Nothing is remembered
// between requests, and a client picks its preset by registering that URL.
//
// Presets are cut by role rather than by API area: each one is meant to cover
// a whole working session for someone in that role, because a preset that
// forces a switch mid-task is worse than no preset at all.

import { Domain } from "./domains.js";

/** Carried by every preset: you cannot do anything without finding the project first. */
const BASE: Domain[] = [Domain.CORE, Domain.PROFILE, Domain.SEARCH];

export const TOOL_PRESETS: Readonly<Record<string, readonly Domain[]>> = {
  /** Writing code: repositories, pull requests, the work items they close, docs. */
  dev: [...BASE, Domain.REPOSITORIES, Domain.WORK_ITEMS, Domain.WIKI, Domain.PIPELINES, Domain.APPROVALS],

  /** Running the board: backlogs, sprints, capacity, plans, reporting. */
  plan: [...BASE, Domain.WORK, Domain.WORK_ITEMS, Domain.DASHBOARDS, Domain.ANALYTICS, Domain.PROJECT_ANALYSIS, Domain.TEST_PLANS, Domain.WIKI, Domain.APPROVALS],

  /** Delivery: pipelines, releases, agents, service connections, packages, alerts. */
  ops: [
    ...BASE,
    Domain.PIPELINES,
    Domain.RELEASE,
    Domain.TASK_AGENT,
    Domain.SERVICE_ENDPOINT,
    Domain.SERVICE_HOOKS,
    Domain.ARTIFACTS,
    Domain.ADVANCED_SECURITY,
    Domain.POLICY,
    Domain.TEST_RESULTS,
    Domain.ANALYTICS,
    Domain.APPROVALS,
    Domain.OPERATIONS,
  ],

  /** Administering the organization: process customization, identity, access, auditing. */
  admin: [
    ...BASE,
    Domain.WIT_PROCESS,
    Domain.MEMBER_ENTITLEMENT,
    Domain.GRAPH,
    Domain.PERMISSIONS,
    Domain.SECURITY_ROLES,
    Domain.AUDIT,
    Domain.NOTIFICATION,
    Domain.EXTENSIONS,
    Domain.FEATURE_MANAGEMENT,
    Domain.GALLERY,
    Domain.OPERATIONS,
  ],
};

export const PRESET_NAMES: readonly string[] = Object.keys(TOOL_PRESETS);

/**
 * Resolve a preset name to the domains it enables.
 *
 * Returns undefined for an unknown name so the caller can answer 404 rather
 * than silently serving something the client did not ask for. With `enabled`
 * (the domains --domains switched on) the result is narrowed to those: a preset
 * picks a smaller surface, it must never widen the one the operator configured.
 */
export function resolvePreset(name: string, enabled?: ReadonlySet<string>): Set<string> | undefined {
  // The name arrives from a URL path, so look it up as an own property:
  // a plain index would resolve "constructor" and friends off Object.prototype.
  const key = name.trim().toLowerCase();
  if (!Object.hasOwn(TOOL_PRESETS, key)) {
    return undefined;
  }
  const domains: readonly string[] = TOOL_PRESETS[key];
  return new Set(enabled ? domains.filter((domain) => enabled.has(domain)) : domains);
}

/**
 * Changes to a whole project or to the organization. The role presets leave
 * them out and the admin preset serves them, even where the domain they belong
 * to is otherwise not part of it; the bare endpoint serves everything.
 *
 * This is not access control — every caller acts with their own Azure DevOps
 * permissions, and /mcp stays open to all of them. It keeps a model working on
 * code or a sprint from reaching a project-wide change by mistake or through
 * instructions planted in a work item it read.
 */
export const ADMIN_ONLY_TOOLS: Readonly<Record<string, Domain>> = {
  core_create_project: Domain.CORE,
  core_update_project: Domain.CORE,
  core_delete_project: Domain.CORE,
  core_set_project_properties: Domain.CORE,
  wit_migrate_project_process: Domain.WORK_ITEMS,
  wit_create_field: Domain.WORK_ITEMS,
  wit_delete_field: Domain.WORK_ITEMS,
  wit_restore_field: Domain.WORK_ITEMS,
};

const ADMIN_PRESET = "admin";

/** What a preset endpoint registers: the domains to configure and, of their tools, which to keep. */
export interface PresetTools {
  domains: Set<string>;
  allows: (tool: string, domain: string) => boolean;
}

export function resolvePresetTools(name: string, enabled?: ReadonlySet<string>): PresetTools | undefined {
  const own = resolvePreset(name, enabled);
  if (!own) {
    return undefined;
  }
  const isAdminOnly = (tool: string) => Object.hasOwn(ADMIN_ONLY_TOOLS, tool);
  if (name.trim().toLowerCase() !== ADMIN_PRESET) {
    return { domains: own, allows: (tool) => !isAdminOnly(tool) };
  }
  const borrowed = Object.values(ADMIN_ONLY_TOOLS).filter((domain) => !enabled || enabled.has(domain));
  return { domains: new Set([...own, ...borrowed]), allows: (tool, domain) => own.has(domain) || isAdminOnly(tool) };
}

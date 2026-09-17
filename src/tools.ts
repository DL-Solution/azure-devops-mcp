// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { WebApi } from "azure-devops-node-api";

import { wrapExternalToolResponse } from "./shared/content-safety.js";
import { Domain } from "./shared/domains.js";
import { configureAdvSecTools } from "./tools/advanced-security.js";
import { configureMcpAppsTools } from "./tools/mcp-apps.js";
import { configurePipelineTools } from "./tools/pipelines.js";
import { configureCoreTools } from "./tools/core.js";
import { configureRepoTools } from "./tools/repositories.js";
import { configureSearchTools } from "./tools/search.js";
import { configureTestPlanTools } from "./tools/test-plans.js";
import { configureTestResultsTools } from "./tools/test-results.js";
import { configureWikiTools } from "./tools/wiki.js";
import { configureWorkTools } from "./tools/work.js";
import { configureWorkItemTools } from "./tools/work-items.js";
import { configureDashboardTools } from "./tools/dashboards.js";
import { configurePolicyTools } from "./tools/policy.js";
import { configureTaskAgentTools } from "./tools/task-agent.js";
import { configureReleaseTools } from "./tools/release.js";
import { configureWitProcessTools } from "./tools/wit-process.js";
import { configureNotificationTools } from "./tools/notification.js";
import { configureSecurityRolesTools } from "./tools/security-roles.js";
import { configureProjectAnalysisTools } from "./tools/project-analysis.js";
import { configureMemberEntitlementTools } from "./tools/member-entitlement.js";
import { configureServiceEndpointTools } from "./tools/service-endpoint.js";
import { configureServiceHooksTools } from "./tools/service-hooks.js";
import { configureGraphTools } from "./tools/graph.js";
import { configureArtifactsTools } from "./tools/artifacts.js";
import { configureAuditTools } from "./tools/audit.js";
import { configurePermissionsTools } from "./tools/permissions.js";
import { configureOperationsTools } from "./tools/operations.js";
import { configureExtensionsTools } from "./tools/extensions.js";
import { configureFeatureManagementTools } from "./tools/feature-management.js";
import { configureGalleryTools } from "./tools/gallery.js";
import { configureProfileTools } from "./tools/profile.js";
import { configureApprovalsTools } from "./tools/approvals.js";
import { configureAnalyticsTools } from "./tools/analytics.js";

function configureAllTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string, enabledDomains: Set<string>) {
  const configureIfDomainEnabled = (domain: string, configureFn: () => void) => {
    if (enabledDomains.has(domain)) {
      configureToolsWithContentSafety(server, domain, configureFn);
    }
  };

  configureIfDomainEnabled(Domain.CORE, () => configureCoreTools(server, tokenProvider, connectionProvider, userAgentProvider));
  // A local health check: its response carries no Azure DevOps content.
  if (enabledDomains.has(Domain.MCP_APPS)) configureMcpAppsTools(server);
  configureIfDomainEnabled(Domain.WORK, () => configureWorkTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.PIPELINES, () => configurePipelineTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.REPOSITORIES, () => configureRepoTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.WORK_ITEMS, () => configureWorkItemTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.WIKI, () => configureWikiTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.TEST_PLANS, () => configureTestPlanTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.TEST_RESULTS, () => configureTestResultsTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.SEARCH, () => configureSearchTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.ADVANCED_SECURITY, () => configureAdvSecTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.DASHBOARDS, () => configureDashboardTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.POLICY, () => configurePolicyTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.TASK_AGENT, () => configureTaskAgentTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.RELEASE, () => configureReleaseTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.WIT_PROCESS, () => configureWitProcessTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.NOTIFICATION, () => configureNotificationTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.SECURITY_ROLES, () => configureSecurityRolesTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.PROJECT_ANALYSIS, () => configureProjectAnalysisTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.MEMBER_ENTITLEMENT, () => configureMemberEntitlementTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.SERVICE_ENDPOINT, () => configureServiceEndpointTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.SERVICE_HOOKS, () => configureServiceHooksTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.GRAPH, () => configureGraphTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.ARTIFACTS, () => configureArtifactsTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.AUDIT, () => configureAuditTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.PERMISSIONS, () => configurePermissionsTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.OPERATIONS, () => configureOperationsTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.EXTENSIONS, () => configureExtensionsTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.FEATURE_MANAGEMENT, () => configureFeatureManagementTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.GALLERY, () => configureGalleryTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.PROFILE, () => configureProfileTools(server, tokenProvider, connectionProvider));
  configureIfDomainEnabled(Domain.APPROVALS, () => configureApprovalsTools(server, tokenProvider, connectionProvider, userAgentProvider));
  configureIfDomainEnabled(Domain.ANALYTICS, () => configureAnalyticsTools(server, tokenProvider, connectionProvider, userAgentProvider));
}

/**
 * Every response from an Azure DevOps tool is untrusted: titles, descriptions,
 * commit messages, file contents and identity names are all text someone else
 * wrote. Rather than relying on each tool to remember that, the registration
 * method is wrapped for the duration of one domain's configuration, so every
 * handler it registers has its text spotlighted on the way out.
 *
 * Registration is synchronous, so the original method is back in place before
 * this returns. Ported from upstream microsoft/azure-devops-mcp#1570.
 */
function configureToolsWithContentSafety(server: McpServer, domain: string, configureFn: () => void): void {
  const originalTool = server.tool;
  const originalRegisterTool = server.registerTool;

  const wrapRegistration = <T extends (...args: never[]) => unknown>(registration: T): T =>
    new Proxy(registration, {
      apply(target, thisArg, argumentsList: unknown[]) {
        const callbackIndex = argumentsList.length - 1;
        const callback = argumentsList[callbackIndex];
        if (typeof callback === "function") {
          argumentsList[callbackIndex] = async (...callbackArgs: unknown[]) => {
            const response = (await Reflect.apply(callback, undefined, callbackArgs)) as CallToolResult;
            return wrapExternalToolResponse(response, `Azure DevOps ${domain}`);
          };
        }
        return Reflect.apply(target, thisArg, argumentsList);
      },
    });

  server.tool = wrapRegistration(originalTool);
  server.registerTool = wrapRegistration(originalRegisterTool);
  try {
    configureFn();
  } finally {
    server.tool = originalTool;
    server.registerTool = originalRegisterTool;
  }
}

export { configureAllTools };

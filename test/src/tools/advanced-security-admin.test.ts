// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configureAdvSecTools, ADVSEC_TOOLS } from "../../../src/tools/advanced-security";
import { createToolServer } from "../../mocks/tool-server";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

describe("Advanced Security management and reporting", () => {
  let server: McpServer;
  let mockFetch: jest.Mock;
  const base = "https://advsec.dev.azure.com/contoso";

  beforeEach(() => {
    server = createToolServer() as unknown as McpServer;
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    configureAdvSecTools(
      server,
      () => Promise.resolve("fake-token"),
      () => Promise.resolve({ serverUrl: "https://dev.azure.com/contoso" } as unknown as WebApi),
      () => "Jest"
    );
  });

  function tool(name: string): Handler {
    const call = (server.tool as jest.Mock).mock.calls.find(([registered]) => registered === name);
    if (!call) throw new Error(`${name} not registered`);
    return call[3] as Handler;
  }

  const respond = (body: string, status = 200, headers: Record<string, string> = {}) =>
    mockFetch.mockResolvedValue({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body), headers: new Headers(headers) });

  const sent = (index = 0) => {
    const [url, init] = mockFetch.mock.calls[index] as [string, { method: string; body?: string }];
    return { url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) };
  };

  describe("alerts", () => {
    it("dismisses an alert with a reason", async () => {
      respond('{"alertId":5}');

      await tool(ADVSEC_TOOLS.update_alert)({ project: "P", repository: "repo", alertId: 5, state: "dismissed", dismissedReason: "falsePositive", dismissedComment: "test data" });

      expect(sent()).toEqual({
        url: `${base}/P/_apis/alert/repositories/repo/alerts/5?api-version=7.2-preview.1`,
        method: "PATCH",
        body: { state: "dismissed", dismissedReason: "falsePositive", dismissedComment: "test data" },
      });
    });

    it("refuses to dismiss without a reason", async () => {
      const result = await tool(ADVSEC_TOOLS.update_alert)({ project: "P", repository: "repo", alertId: 5, state: "dismissed" });

      expect(result.isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("reads instances, metadata and analyzed branches", async () => {
      respond('{"value":[]}');

      await tool(ADVSEC_TOOLS.list_alert_instances)({ project: "P", repository: "repo", alertId: 5, ref: "refs/heads/main" });
      await tool(ADVSEC_TOOLS.get_alert_metadata)({ project: "P", repository: "repo", alertId: 5 });
      await tool(ADVSEC_TOOLS.list_analyzed_branches)({ project: "P", repository: "repo", alertType: "code", branchNameContains: "rel", top: 10 });

      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        `${base}/P/_apis/alert/repositories/repo/alerts/5/instances?api-version=7.2-preview.1&ref=refs%2Fheads%2Fmain`,
        `${base}/P/_apis/alert/repositories/repo/alerts/5/metadata?api-version=7.2-preview.1`,
        `${base}/P/_apis/alert/repositories/repo/filters/branches?api-version=7.2-preview.1&alertType=code&branchNameContains=rel&top=10`,
      ]);
    });

    it("deletes the analysis of one pipeline or of all pipelines", async () => {
      respond("");

      await tool(ADVSEC_TOOLS.delete_pipeline_analysis)({ project: "P", repository: "repo", pipelineId: 12 });
      const result = await tool(ADVSEC_TOOLS.delete_pipeline_analysis)({ project: "P", repository: "repo" });

      expect(sent(0)).toMatchObject({ url: `${base}/P/_apis/alert/repositories/repo/pipelineAnalysis/12?api-version=7.2-preview.1`, method: "DELETE" });
      expect(sent(1).url).toBe(`${base}/P/_apis/alert/repositories/repo/pipelineAnalyses?api-version=7.2-preview.1`);
      expect(result.content[0].text).toBe("Done.");
    });

    it("surfaces API errors", async () => {
      respond('{"message":"VS2150009: Advanced Security is not enabled for this repository."}', 400);

      const result = await tool(ADVSEC_TOOLS.get_alert_metadata)({ project: "P", repository: "repo", alertId: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error getting metadata of alert 1: 400:");
    });

    it("reports thrown errors", async () => {
      mockFetch.mockRejectedValue("offline");

      const result = await tool(ADVSEC_TOOLS.get_alert_metadata)({ project: "P", repository: "repo", alertId: 1 });

      expect(result.content[0].text).toBe("Error getting metadata of alert 1: offline");
    });
  });

  describe("enablement and billing", () => {
    it("reads enablement at organization, project and repository level", async () => {
      respond("{}");

      await tool(ADVSEC_TOOLS.get_enablement)({ includeAllProperties: true });
      await tool(ADVSEC_TOOLS.get_enablement)({ project: "My Project" });
      await tool(ADVSEC_TOOLS.get_enablement)({ project: "P", repository: "repo" });

      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        `${base}/_apis/management/enablement?api-version=7.2-preview.3&includeAllProperties=true`,
        `${base}/My%20Project/_apis/management/enablement?api-version=7.2-preview.3`,
        `${base}/P/_apis/management/repositories/repo/enablement?api-version=7.2-preview.3`,
      ]);
    });

    it("needs the project of a repository", async () => {
      const result = await tool(ADVSEC_TOOLS.get_enablement)({ repository: "repo" });

      expect(result.isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("updates repository features", async () => {
      respond("");

      await tool(ADVSEC_TOOLS.update_enablement)({ project: "P", repository: "repo", secretProtection: { secretProtectionEnabled: true, blockPushes: true } });

      expect(sent()).toEqual({
        url: `${base}/P/_apis/management/repositories/repo/enablement?api-version=7.2-preview.3`,
        method: "PATCH",
        body: { secretProtectionFeatures: { secretProtectionEnabled: true, blockPushes: true } },
      });
    });

    it("updates the settings for new repositories of a project", async () => {
      respond("");

      await tool(ADVSEC_TOOLS.update_enablement)({ project: "P", onCreate: { enableSecretProtectionOnCreate: true }, codeSecurity: { codeSecurityEnabled: false } });

      expect(sent().body).toEqual({ codeSecurityFeatures: { codeSecurityEnabled: false }, enablementOnCreateSettings: { enableSecretProtectionOnCreate: true } });
    });

    it("refuses empty, unscoped or misplaced enablement updates", async () => {
      expect((await tool(ADVSEC_TOOLS.update_enablement)({ project: "P" })).isError).toBe(true);
      expect((await tool(ADVSEC_TOOLS.update_enablement)({ repository: "repo", codeSecurity: {} })).isError).toBe(true);
      expect((await tool(ADVSEC_TOOLS.update_enablement)({ project: "P", repository: "repo", onCreate: {} })).isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("estimates committers and reads meter usage", async () => {
      respond("{}");

      await tool(ADVSEC_TOOLS.get_committer_estimate)({ plan: "all" });
      await tool(ADVSEC_TOOLS.get_committer_estimate)({ project: "P", repository: "repo" });
      await tool(ADVSEC_TOOLS.get_meter_usage)({ plan: "secretProtection", billingDate: "2026-09-01" });

      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        `${base}/_apis/management/meterUsageEstimate/default?api-version=7.2-preview.3&plan=all`,
        `${base}/P/_apis/management/repositories/repo/meterUsageEstimate/default?api-version=7.2-preview.3`,
        `${base}/_apis/management/meterusage/default?api-version=7.2-preview.3&plan=secretProtection&billingDate=2026-09-01`,
      ]);
    });

    it("refuses a committer estimate for a repository without its project", async () => {
      expect((await tool(ADVSEC_TOOLS.get_committer_estimate)({ repository: "repo" })).isError).toBe(true);
      expect((await tool(ADVSEC_TOOLS.update_enablement)({ repository: "repo" })).isError).toBe(true);
    });
  });

  describe("organization reporting", () => {
    it("summarizes alerts with comma-separated criteria", async () => {
      respond('{"projects":[]}');

      await tool(ADVSEC_TOOLS.get_alert_summary)({ severities: ["critical", "high"], alertTypes: ["dependency"], period: "last7Days", projects: [] });

      expect(sent().url).toBe(`${base}/_apis/reporting/summary/alerts?api-version=7.2-preview.1&criteria.alertTypes=dependency&criteria.severities=critical%2Chigh&criteria.period=last7Days`);
    });

    it("summarizes enablement", async () => {
      respond('{"projects":[]}');

      await tool(ADVSEC_TOOLS.get_enablement_summary)({ projects: ["P"], pushProtection: false });

      expect(sent().url).toBe(`${base}/_apis/reporting/summary/enablement?api-version=7.2-preview.1&criteria.projects=P&criteria.states.pushProtection=false`);
    });

    it("lists organization alerts and reports the continuation token", async () => {
      respond('{"value":[]}', 200, { "x-ms-continuationtoken": "abc" });

      const result = await tool(ADVSEC_TOOLS.list_organization_alerts)({ alertType: "dependency", state: "open", componentNames: ["lodash"], top: 50 });

      expect(sent().url).toBe(`${base}/_apis/reporting/summary/alertsbatch?api-version=7.2-preview.1&criteria.alertType=dependency&criteria.state=open&criteria.componentNames=lodash&top=50`);
      expect(result.content[0].text).toContain("pass continuationToken abc");
    });
  });
});

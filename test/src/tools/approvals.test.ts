// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configureApprovalsTools, APPROVALS_TOOLS } from "../../../src/tools/approvals";
import { createToolServer } from "../../mocks/tool-server";

describe("configureApprovalsTools", () => {
  let server: McpServer;
  let tokenProvider: () => Promise<string>;
  let connectionProvider: () => Promise<WebApi>;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    server = createToolServer() as unknown as McpServer;
    tokenProvider = jest.fn(() => Promise.resolve("fake-token")) as () => Promise<string>;
    connectionProvider = jest.fn().mockResolvedValue({ serverUrl: "https://dev.azure.com/contoso" } as unknown as WebApi) as () => Promise<WebApi>;
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  function getHandler(toolName: string) {
    configureApprovalsTools(server, tokenProvider, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
  }

  const ok = (body: string, status = 200) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });

  it("registers all three tools", () => {
    configureApprovalsTools(server, tokenProvider, connectionProvider, () => "Jest");
    const names = (server.tool as jest.Mock).mock.calls.map(([name]) => name);
    expect(names).toEqual(expect.arrayContaining([APPROVALS_TOOLS.list, APPROVALS_TOOLS.get, APPROVALS_TOOLS.update]));
  });

  describe("approvals_list", () => {
    it("queries the project-scoped approvals endpoint", async () => {
      const handler = getHandler(APPROVALS_TOOLS.list);
      mockFetch.mockResolvedValue(ok('{"count":0,"value":[]}'));

      const result = await handler({ project: "Contoso" });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://dev.azure.com/contoso/Contoso/_apis/pipelines/approvals?api-version=7.2-preview.2");
      expect(init.method).toBe("GET");
      expect(init.headers.Authorization).toBe("Bearer fake-token");
      expect(result.content[0].text).toContain("count");
    });

    it("passes the optional filters through as query parameters", async () => {
      const handler = getHandler(APPROVALS_TOOLS.list);
      mockFetch.mockResolvedValue(ok("{}"));

      await handler({ project: "Contoso", approvalIds: ["a1", "a2"], assignedTo: ["ada@contoso.com"], state: "pending", top: 5, expand: "steps" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("approvalIds=a1%2Ca2");
      expect(url).toContain("assignedTo=ada%40contoso.com");
      expect(url).toContain("state=pending");
      expect(url).toContain("top=5");
      expect(url).toContain("%24expand=steps");
    });

    it("surfaces a failed request as an error result", async () => {
      const handler = getHandler(APPROVALS_TOOLS.list);
      mockFetch.mockResolvedValue(ok("forbidden", 403));

      const result = await handler({ project: "Contoso" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Failed to list approvals (403)");
    });
  });

  describe("approvals_get", () => {
    it("gets a single approval by id", async () => {
      const handler = getHandler(APPROVALS_TOOLS.get);
      mockFetch.mockResolvedValue(ok('{"id":"ee14f612","status":"pending"}'));

      const result = await handler({ project: "Contoso", approvalId: "ee14f612" });

      expect(mockFetch.mock.calls[0][0]).toBe("https://dev.azure.com/contoso/Contoso/_apis/pipelines/approvals/ee14f612?api-version=7.2-preview.2");
      expect(result.content[0].text).toContain("pending");
    });

    it("reports a missing approval as an error", async () => {
      const handler = getHandler(APPROVALS_TOOLS.get);
      mockFetch.mockResolvedValue(ok("", 404));

      const result = await handler({ project: "Contoso", approvalId: "missing" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("approvals_update", () => {
    it("PATCHes an array with the approval decision", async () => {
      const handler = getHandler(APPROVALS_TOOLS.update);
      mockFetch.mockResolvedValue(ok('{"count":1,"value":[{"status":"approved"}]}'));

      const result = await handler({ project: "Contoso", approvalId: "aab27959", status: "approved", comment: "Approving" });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://dev.azure.com/contoso/Contoso/_apis/pipelines/approvals?api-version=7.2-preview.2");
      expect(init.method).toBe("PATCH");
      expect(init.headers["Content-Type"]).toBe("application/json; charset=utf-8");
      expect(JSON.parse(init.body)).toEqual([{ approvalId: "aab27959", status: "approved", comment: "Approving" }]);
      expect(result.content[0].text).toContain("approved");
    });

    it("wraps reassignTo as an identity reference and keeps deferredTo", async () => {
      const handler = getHandler(APPROVALS_TOOLS.update);
      mockFetch.mockResolvedValue(ok("{}"));

      await handler({ project: "Contoso", approvalId: "a1", status: "deferred", deferredTo: "2026-10-01T00:00:00Z", reassignTo: "user-guid" });

      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual([{ approvalId: "a1", status: "deferred", deferredTo: "2026-10-01T00:00:00Z", reassignTo: { id: "user-guid" } }]);
    });

    it("surfaces a rejected update as an error result", async () => {
      const handler = getHandler(APPROVALS_TOOLS.update);
      mockFetch.mockResolvedValue(ok("not an approver", 401));

      const result = await handler({ project: "Contoso", approvalId: "a1", status: "approved" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Failed to update approval (401)");
    });
  });

  describe("checks and pipeline permissions", () => {
    const BASE = "https://dev.azure.com/contoso/Contoso/_apis/pipelines";
    const V = "api-version=7.1-preview.1";
    const sent = () => {
      const [url, init] = mockFetch.mock.calls[0] as [string, { method: string; body?: string }];
      return { url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) };
    };

    it("lists the checks of one resource with a GET", async () => {
      mockFetch.mockResolvedValue(ok('{"count":1}'));

      const result = await getHandler(APPROVALS_TOOLS.list_check_configurations)({ project: "Contoso", resources: [{ type: "environment", id: "4" }], includeSettings: true });

      expect(sent()).toEqual({ url: `${BASE}/checks/configurations?resourceType=environment&resourceId=4&$expand=settings&${V}`, method: "GET", body: undefined });
      expect(result.content[0].text).toBe('{"count":1}');
    });

    it("lists the checks of several resources with one query, without settings", async () => {
      mockFetch.mockResolvedValue(ok("{}"));
      const resources = [
        { type: "queue", id: "80" },
        { type: "endpoint", id: "se-1" },
      ];

      await getHandler(APPROVALS_TOOLS.list_check_configurations)({ project: "Contoso", resources, includeSettings: false });

      expect(sent()).toEqual({ url: `${BASE}/checks/queryconfigurations?${V}`, method: "POST", body: resources });
    });

    it("gets a check with its settings", async () => {
      mockFetch.mockResolvedValue(ok('{"id":12}'));

      await getHandler(APPROVALS_TOOLS.get_check_configuration)({ project: "Contoso", checkId: 12 });

      expect(sent().url).toBe(`${BASE}/checks/configurations/12?$expand=settings&${V}`);
    });

    it("adds an approval check to an environment", async () => {
      mockFetch.mockResolvedValue(ok('{"id":13}'));
      const settings = { approvers: [{ id: "u1" }], minRequiredApprovers: 1 };

      await getHandler(APPROVALS_TOOLS.add_check_configuration)({
        project: "Contoso",
        resourceType: "environment",
        resourceId: "4",
        checkTypeId: "8C6F20A7-A545-4486-9777-F762FAFE0D4D",
        settings,
        timeoutMinutes: 1440,
      });

      expect(sent()).toEqual({
        url: `${BASE}/checks/configurations?${V}`,
        method: "POST",
        body: { type: { id: "8C6F20A7-A545-4486-9777-F762FAFE0D4D" }, settings, resource: { type: "environment", id: "4" }, timeout: 1440 },
      });
    });

    it("replaces a check's settings", async () => {
      mockFetch.mockResolvedValue(ok('{"id":13}'));

      await getHandler(APPROVALS_TOOLS.update_check_configuration)({ project: "Contoso", checkId: 13, resourceType: "environment", resourceId: "4", checkTypeId: "t", settings: { a: 1 } });

      expect(sent()).toEqual({
        url: `${BASE}/checks/configurations/13?${V}`,
        method: "PATCH",
        body: { id: 13, type: { id: "t" }, settings: { a: 1 }, resource: { type: "environment", id: "4" } },
      });
    });

    it("deletes a check, confirming an empty response", async () => {
      mockFetch.mockResolvedValue(ok("", 204));

      const result = await getHandler(APPROVALS_TOOLS.delete_check_configuration)({ project: "Contoso", checkId: 13 });

      expect(sent()).toMatchObject({ url: `${BASE}/checks/configurations/13?${V}`, method: "DELETE" });
      expect(result.content[0].text).toBe("Done.");
    });

    it("gets a check run, optionally with its resources", async () => {
      mockFetch.mockResolvedValue(ok("{}"));
      await getHandler(APPROVALS_TOOLS.get_check_run)({ project: "Contoso", checkSuiteId: "cs-1", includeResources: true });
      expect(sent().url).toBe(`${BASE}/checks/runs/cs-1?$expand=resources&${V}`);

      mockFetch.mockClear();
      mockFetch.mockResolvedValue(ok("{}"));
      await getHandler(APPROVALS_TOOLS.get_check_run)({ project: "Contoso", checkSuiteId: "cs-1", includeResources: false });
      expect(sent().url).toBe(`${BASE}/checks/runs/cs-1?${V}`);
    });

    it("reads pipeline permissions of a resource", async () => {
      mockFetch.mockResolvedValue(ok('{"pipelines":[]}'));

      await getHandler(APPROVALS_TOOLS.get_pipeline_permissions)({ project: "Contoso", resourceType: "endpoint", resourceId: "se-1" });

      expect(sent()).toMatchObject({ url: `${BASE}/pipelinepermissions/endpoint/se-1?${V}`, method: "GET" });
    });

    it("authorizes pipelines individually and for all", async () => {
      mockFetch.mockResolvedValue(ok("{}"));

      await getHandler(APPROVALS_TOOLS.set_pipeline_permissions)({
        project: "Contoso",
        resourceType: "queue",
        resourceId: "80",
        pipelines: [{ id: 3, authorized: true }],
        allPipelinesAuthorized: false,
      });

      expect(sent()).toEqual({
        url: `${BASE}/pipelinepermissions/queue/80?${V}`,
        method: "PATCH",
        body: { resource: { type: "queue", id: "80" }, pipelines: [{ id: 3, authorized: true }], allPipelines: { authorized: false } },
      });
    });

    it("leaves allPipelines out when only individual pipelines change", async () => {
      mockFetch.mockResolvedValue(ok("{}"));

      await getHandler(APPROVALS_TOOLS.set_pipeline_permissions)({ project: "Contoso", resourceType: "queue", resourceId: "80", pipelines: [{ id: 3, authorized: false }] });

      expect(sent().body).toEqual({ resource: { type: "queue", id: "80" }, pipelines: [{ id: 3, authorized: false }] });
    });

    it("refuses a permission change with nothing in it", async () => {
      const result = await getHandler(APPROVALS_TOOLS.set_pipeline_permissions)({ project: "Contoso", resourceType: "queue", resourceId: "80", pipelines: [] });

      expect(result.isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("surfaces an API error with its status and body", async () => {
      mockFetch.mockResolvedValue(ok('{"message":"does not exist"}', 404));

      const result = await getHandler(APPROVALS_TOOLS.get_check_configuration)({ project: "Contoso", checkId: 99 });

      expect(result).toEqual({ content: [{ type: "text", text: 'Error getting check configuration 99: 404: {"message":"does not exist"}' }], isError: true });
    });

    it("surfaces a network failure", async () => {
      mockFetch.mockRejectedValue("socket hang up");

      const result = await getHandler(APPROVALS_TOOLS.delete_check_configuration)({ project: "Contoso", checkId: 1 });

      expect(result.content[0].text).toBe("Error deleting check configuration 1: socket hang up");
    });
  });
});

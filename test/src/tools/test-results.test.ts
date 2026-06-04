// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configureTestResultsTools, TEST_RESULTS_TOOLS } from "../../../src/tools/test-results";
import { ResultDetails, TestOutcome } from "azure-devops-node-api/interfaces/TestInterfaces.js";

type TokenProviderMock = () => Promise<string>;
type ConnectionProviderMock = () => Promise<WebApi>;

describe("configureTestResultsTools", () => {
  let server: McpServer;
  let tokenProvider: TokenProviderMock;
  let connectionProvider: ConnectionProviderMock;
  let mockTestApi: {
    getTestRuns: jest.Mock;
    getTestRunById: jest.Mock;
    getTestResults: jest.Mock;
    getTestResultById: jest.Mock;
  };

  beforeEach(() => {
    server = { tool: jest.fn() } as unknown as McpServer;
    tokenProvider = jest.fn();
    mockTestApi = {
      getTestRuns: jest.fn(),
      getTestRunById: jest.fn(),
      getTestResults: jest.fn(),
      getTestResultById: jest.fn(),
    };
    const mockConnection = { getTestApi: jest.fn().mockResolvedValue(mockTestApi) };
    connectionProvider = jest.fn().mockResolvedValue(mockConnection as unknown as WebApi);
  });

  function getHandler(toolName: string) {
    configureTestResultsTools(server, tokenProvider, connectionProvider);
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
  }

  it("registers the test-results tools", () => {
    configureTestResultsTools(server, tokenProvider, connectionProvider);
    const names = (server.tool as jest.Mock).mock.calls.map(([name]) => name);
    expect(names).toEqual(expect.arrayContaining(Object.values(TEST_RESULTS_TOOLS)));
  });

  describe("list_test_runs", () => {
    it("passes filters through to getTestRuns", async () => {
      const handler = getHandler(TEST_RESULTS_TOOLS.list_test_runs);
      mockTestApi.getTestRuns.mockResolvedValue([{ id: 1 }]);

      const result = await handler({ project: "proj", planId: 42, automated: true, includeRunDetails: true, top: 25, skip: 5 });

      // getTestRuns(project, buildUri, owner, tmiRunId, planId, includeRunDetails, automated, skip, top)
      expect(mockTestApi.getTestRuns).toHaveBeenCalledWith("proj", undefined, undefined, undefined, 42, true, true, 5, 25);
      expect(result.content[0].text).toContain('"id": 1');
    });

    it("handles API errors", async () => {
      const handler = getHandler(TEST_RESULTS_TOOLS.list_test_runs);
      mockTestApi.getTestRuns.mockRejectedValue(new Error("boom"));

      const result = await handler({ project: "proj" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error listing test runs: boom");
    });
  });

  describe("get_test_run", () => {
    it("fetches a run by id with includeDetails default true", async () => {
      const handler = getHandler(TEST_RESULTS_TOOLS.get_test_run);
      mockTestApi.getTestRunById.mockResolvedValue({ id: 7 });

      await handler({ project: "proj", runId: 7 });

      expect(mockTestApi.getTestRunById).toHaveBeenCalledWith("proj", 7, true);
    });

    it("returns isError when run not found", async () => {
      const handler = getHandler(TEST_RESULTS_TOOLS.get_test_run);
      mockTestApi.getTestRunById.mockResolvedValue(null);

      const result = await handler({ project: "proj", runId: 7 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("list_test_results", () => {
    it("maps outcome and detail enums before calling getTestResults", async () => {
      const handler = getHandler(TEST_RESULTS_TOOLS.list_test_results);
      mockTestApi.getTestResults.mockResolvedValue([{ id: 1 }]);

      await handler({ project: "proj", runId: 7, outcomes: ["Failed", "Passed"], detailsToInclude: "iterations", top: 10, skip: 2 });

      // getTestResults(project, runId, detailsToInclude, skip, top, outcomes)
      expect(mockTestApi.getTestResults).toHaveBeenCalledWith("proj", 7, ResultDetails.Iterations, 2, 10, [TestOutcome.Failed, TestOutcome.Passed]);
    });

    it("passes undefined for unspecified enum filters", async () => {
      const handler = getHandler(TEST_RESULTS_TOOLS.list_test_results);
      mockTestApi.getTestResults.mockResolvedValue([]);

      await handler({ project: "proj", runId: 7, top: 100 });

      expect(mockTestApi.getTestResults).toHaveBeenCalledWith("proj", 7, undefined, undefined, 100, undefined);
    });
  });

  describe("get_test_result", () => {
    it("fetches a single result by id", async () => {
      const handler = getHandler(TEST_RESULTS_TOOLS.get_test_result);
      mockTestApi.getTestResultById.mockResolvedValue({ id: 99 });

      await handler({ project: "proj", runId: 7, testCaseResultId: 99, detailsToInclude: "workItems" });

      expect(mockTestApi.getTestResultById).toHaveBeenCalledWith("proj", 7, 99, ResultDetails.WorkItems);
    });

    it("handles API errors", async () => {
      const handler = getHandler(TEST_RESULTS_TOOLS.get_test_result);
      mockTestApi.getTestResultById.mockRejectedValue(new Error("denied"));

      const result = await handler({ project: "proj", runId: 7, testCaseResultId: 99 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error fetching test result: denied");
    });
  });
});

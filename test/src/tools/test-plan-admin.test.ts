// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Plan and suite management, recycle bins, cloning, suite entries, test case
// removal, configurations and variables. The original tools are covered by
// test-plan.test.ts.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { SuiteEntryTypes } from "azure-devops-node-api/interfaces/TestPlanInterfaces.js";

import { configureTestPlanTools, Test_Plan_Tools as T } from "../../../src/tools/test-plans";
import { createToolServer } from "../../mocks/tool-server";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

describe("test plan management tools", () => {
  let server: McpServer;
  let api: Record<string, jest.Mock>;
  let connectionProvider: () => Promise<WebApi>;

  beforeEach(() => {
    server = createToolServer() as unknown as McpServer;
    api = Object.fromEntries(
      [
        "getTestPlanById",
        "updateTestPlan",
        "deleteTestPlan",
        "getDeletedTestPlans",
        "restoreDeletedTestPlan",
        "cloneTestPlan",
        "getCloneInformation",
        "getSuiteCloneInformation",
        "getTestCaseCloneInformation",
        "getTestSuiteById",
        "updateTestSuite",
        "deleteTestSuite",
        "getDeletedTestSuitesForPlan",
        "getDeletedTestSuitesForProject",
        "restoreDeletedTestSuite",
        "cloneTestSuite",
        "getSuitesByTestCaseId",
        "getSuiteEntries",
        "reorderSuiteEntries",
        "getTestCase",
        "removeTestCasesFromSuite",
        "deleteTestCase",
        "cloneTestCase",
        "getTestConfigurations",
        "getTestConfigurationById",
        "createTestConfiguration",
        "updateTestConfiguration",
        "deleteTestConfguration",
        "getTestVariables",
        "getTestVariableById",
        "createTestVariable",
        "updateTestVariable",
        "deleteTestVariable",
      ].map((name) => [name, jest.fn()])
    );
    connectionProvider = jest.fn().mockResolvedValue({ getTestPlanApi: jest.fn().mockResolvedValue(api) } as unknown as WebApi) as () => Promise<WebApi>;
  });

  function handlerFor(toolName: string): Handler {
    configureTestPlanTools(server, jest.fn() as () => Promise<string>, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as Handler;
  }

  const parsed = (result: { content: { text: string }[] }) => JSON.parse(result.content[0].text);
  const P = { project: "Contoso" };

  describe("plans", () => {
    it("gets a plan, or reports it missing", async () => {
      api.getTestPlanById.mockResolvedValue({ id: 7 });
      expect(parsed(await handlerFor(T.get_test_plan)({ ...P, planId: 7 }))).toEqual({ id: 7 });
      expect(api.getTestPlanById).toHaveBeenCalledWith("Contoso", 7);

      api.getTestPlanById.mockResolvedValue(null);
      expect(await handlerFor(T.get_test_plan)({ ...P, planId: 8 })).toEqual({ content: [{ type: "text", text: "Test plan 8 not found" }], isError: true });
    });

    it("updates only the given plan fields", async () => {
      api.updateTestPlan.mockResolvedValue({ id: 7 });
      const endDate = new Date("2026-10-01T00:00:00Z");

      await handlerFor(T.update_test_plan)({ ...P, planId: 7, name: "Release 2", endDate, state: "Inactive" });

      expect(api.updateTestPlan).toHaveBeenCalledWith({ name: "Release 2", endDate, state: "Inactive" }, "Contoso", 7);
    });

    it("refuses a plan update with nothing to change", async () => {
      const result = await handlerFor(T.update_test_plan)({ ...P, planId: 7 });

      expect(result.isError).toBe(true);
      expect(api.updateTestPlan).not.toHaveBeenCalled();
    });

    it("deletes, lists deleted and restores plans", async () => {
      api.deleteTestPlan.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(T.delete_test_plan)({ ...P, planId: 7 }))).toEqual({ deleted: 7 });

      api.getDeletedTestPlans.mockResolvedValue(null);
      expect(parsed(await handlerFor(T.list_deleted_test_plans)({ ...P, continuationToken: "t" }))).toEqual([]);
      expect(api.getDeletedTestPlans).toHaveBeenCalledWith("Contoso", "t");

      api.restoreDeletedTestPlan.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(T.restore_test_plan)({ ...P, planId: 7 }))).toEqual({ restored: 7 });
      expect(api.restoreDeletedTestPlan).toHaveBeenCalledWith({ isDeleted: false }, "Contoso", 7);
    });

    it("clones a plan with chosen suites and options", async () => {
      api.cloneTestPlan.mockResolvedValue({ cloneOperationResponse: { opId: 12 } });

      await handlerFor(T.clone_test_plan)({
        ...P,
        sourcePlanId: 7,
        suiteIds: [8],
        name: "Release 3",
        iteration: "Contoso\\Sprint 9",
        destinationProject: "Other",
        deepClone: true,
        cloneOptions: { copyAncestorHierarchy: true },
      });

      expect(api.cloneTestPlan).toHaveBeenCalledWith(
        {
          sourceTestPlan: { id: 7, suiteIds: [8] },
          destinationTestPlan: { name: "Release 3", areaPath: undefined, iteration: "Contoso\\Sprint 9", project: "Other" },
          cloneOptions: { copyAncestorHierarchy: true },
        },
        "Contoso",
        true
      );
    });

    it.each([
      ["plan", "getCloneInformation"],
      ["suite", "getSuiteCloneInformation"],
      ["testCase", "getTestCaseCloneInformation"],
    ])("reads a %s clone operation", async (kind, method) => {
      api[method].mockResolvedValue({ state: "succeeded" });

      const result = await handlerFor(T.get_clone_operation)({ ...P, kind, cloneOperationId: 12 });

      expect(api[method]).toHaveBeenCalledWith("Contoso", 12);
      expect(parsed(result)).toEqual({ state: "succeeded" });
    });

    it("reports a missing clone operation", async () => {
      api.getCloneInformation.mockResolvedValue(null);

      const result = await handlerFor(T.get_clone_operation)({ ...P, kind: "plan", cloneOperationId: 99 });

      expect(result.content[0].text).toBe("Clone operation 99 not found");
    });
  });

  describe("suites", () => {
    it("gets a suite, or reports it missing", async () => {
      api.getTestSuiteById.mockResolvedValue({ id: 8 });
      await handlerFor(T.get_test_suite)({ ...P, planId: 7, suiteId: 8 });
      expect(api.getTestSuiteById).toHaveBeenCalledWith("Contoso", 7, 8);

      api.getTestSuiteById.mockResolvedValue(undefined);
      expect((await handlerFor(T.get_test_suite)({ ...P, planId: 7, suiteId: 9 })).content[0].text).toBe("Test suite 9 not found in plan 7");
    });

    it("updates a suite with its revision, parent and default configurations", async () => {
      api.updateTestSuite.mockResolvedValue({ id: 8 });

      await handlerFor(T.update_test_suite)({ ...P, planId: 7, suiteId: 8, revision: 3, name: "Smoke", parentSuiteId: 2, defaultConfigurationIds: [5] });

      expect(api.updateTestSuite).toHaveBeenCalledWith(
        { revision: 3, name: "Smoke", parentSuite: { id: 2 }, queryString: undefined, defaultConfigurations: [{ id: 5 }], inheritDefaultConfigurations: undefined },
        "Contoso",
        7,
        8
      );
    });

    it("deletes and restores a suite", async () => {
      api.deleteTestSuite.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(T.delete_test_suite)({ ...P, planId: 7, suiteId: 8 }))).toEqual({ deleted: 8 });
      expect(api.deleteTestSuite).toHaveBeenCalledWith("Contoso", 7, 8);

      api.restoreDeletedTestSuite.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(T.restore_test_suite)({ ...P, suiteId: 8 }))).toEqual({ restored: 8 });
      expect(api.restoreDeletedTestSuite).toHaveBeenCalledWith({ isDeleted: false }, "Contoso", 8);
    });

    it("lists deleted suites of a plan or of the project", async () => {
      api.getDeletedTestSuitesForPlan.mockResolvedValue([{ id: 8 }]);
      await handlerFor(T.list_deleted_test_suites)({ ...P, planId: 7 });
      expect(api.getDeletedTestSuitesForPlan).toHaveBeenCalledWith("Contoso", 7, undefined, undefined);

      api.getDeletedTestSuitesForProject.mockResolvedValue(null);
      expect(parsed(await handlerFor(T.list_deleted_test_suites)({ ...P, continuationToken: "t" }))).toEqual([]);
      expect(api.getDeletedTestSuitesForProject).toHaveBeenCalledWith("Contoso", undefined, "t");
    });

    it("clones a suite into another", async () => {
      api.cloneTestSuite.mockResolvedValue({});

      await handlerFor(T.clone_test_suite)({ ...P, sourceSuiteId: 8, destinationSuiteId: 20, deepClone: false });

      expect(api.cloneTestSuite).toHaveBeenCalledWith({ sourceTestSuite: { id: 8 }, destinationTestSuite: { id: 20, project: undefined }, cloneOptions: undefined }, "Contoso", false);
    });

    it("lists the suites containing a test case", async () => {
      api.getSuitesByTestCaseId.mockResolvedValue(null);

      expect(parsed(await handlerFor(T.list_suites_for_test_case)({ testCaseId: 42 }))).toEqual([]);
      expect(api.getSuitesByTestCaseId).toHaveBeenCalledWith(42);
    });

    it("lists and reorders suite entries by named entry type", async () => {
      api.getSuiteEntries.mockResolvedValue([]);
      await handlerFor(T.list_suite_entries)({ ...P, suiteId: 8, entryType: "Suite" });
      expect(api.getSuiteEntries).toHaveBeenCalledWith("Contoso", 8, SuiteEntryTypes.Suite);

      api.reorderSuiteEntries.mockResolvedValue([]);
      await handlerFor(T.reorder_suite_entries)({ ...P, suiteId: 8, entries: [{ id: 42, entryType: "TestCase", sequenceNumber: 0 }] });
      expect(api.reorderSuiteEntries).toHaveBeenCalledWith([{ id: 42, sequenceNumber: 0, suiteEntryType: SuiteEntryTypes.TestCase }], "Contoso", 8);
    });
  });

  describe("test cases", () => {
    it("gets one test case of a suite, or says it is not there", async () => {
      api.getTestCase.mockResolvedValue([{ workItem: { id: 42 } }]);
      expect(parsed(await handlerFor(T.get_suite_test_case)({ ...P, planId: 7, suiteId: 8, testCaseId: 42, witFields: "System.Title" }))).toEqual({ workItem: { id: 42 } });
      expect(api.getTestCase).toHaveBeenCalledWith("Contoso", 7, 8, "42", "System.Title");

      api.getTestCase.mockResolvedValue([]);
      expect((await handlerFor(T.get_suite_test_case)({ ...P, planId: 7, suiteId: 8, testCaseId: 43 })).content[0].text).toBe("Test case 43 is not in suite 8");
    });

    it("removes test cases from a suite as a comma-separated list", async () => {
      api.removeTestCasesFromSuite.mockResolvedValue(undefined);

      const result = await handlerFor(T.remove_test_cases_from_suite)({ ...P, planId: 7, suiteId: 8, testCaseIds: [42, 43] });

      expect(api.removeTestCasesFromSuite).toHaveBeenCalledWith("Contoso", 7, 8, "42,43");
      expect(parsed(result)).toEqual({ removed: [42, 43], suiteId: 8 });
    });

    it("deletes a test case", async () => {
      api.deleteTestCase.mockResolvedValue(undefined);

      expect(parsed(await handlerFor(T.delete_test_case)({ ...P, testCaseId: 42 }))).toEqual({ deleted: 42 });
      expect(api.deleteTestCase).toHaveBeenCalledWith("Contoso", 42);
    });

    it("clones test cases between suites", async () => {
      api.cloneTestCase.mockResolvedValue({});

      await handlerFor(T.clone_test_cases)({ ...P, sourcePlanId: 7, sourceSuiteId: 8, testCaseIds: [42], destinationPlanId: 9, destinationSuiteId: 10, relatedLinkComment: "copied" });

      expect(api.cloneTestCase).toHaveBeenCalledWith(
        {
          sourceTestPlan: { id: 7 },
          sourceTestSuite: { id: 8 },
          testCaseIds: [42],
          destinationTestPlan: { id: 9 },
          destinationTestSuite: { id: 10, project: undefined },
          cloneOptions: { relatedLinkComment: "copied" },
        },
        "Contoso"
      );
    });
  });

  describe("configurations and variables", () => {
    it("lists, gets, creates, updates and deletes configurations, mapping the state name", async () => {
      api.getTestConfigurations.mockResolvedValue(null);
      expect(parsed(await handlerFor(T.list_test_configurations)(P))).toEqual([]);

      api.getTestConfigurationById.mockResolvedValue(null);
      expect((await handlerFor(T.get_test_configuration)({ ...P, configurationId: 1 })).content[0].text).toBe("Test configuration 1 not found");

      api.createTestConfiguration.mockResolvedValue({ id: 3 });
      await handlerFor(T.create_test_configuration)({ ...P, name: "Win 11 + Edge", values: [{ name: "Browser", value: "Edge" }], state: "Active" });
      expect(api.createTestConfiguration).toHaveBeenCalledWith({ name: "Win 11 + Edge", values: [{ name: "Browser", value: "Edge" }], state: 1 }, "Contoso");

      api.updateTestConfiguration.mockResolvedValue({ id: 3 });
      await handlerFor(T.update_test_configuration)({ ...P, configurationId: 3, name: "Win 11 + Edge", state: "Inactive" });
      expect(api.updateTestConfiguration).toHaveBeenCalledWith({ name: "Win 11 + Edge", state: 2 }, "Contoso", 3);

      await handlerFor(T.update_test_configuration)({ ...P, configurationId: 3, name: "Renamed" });
      expect(api.updateTestConfiguration).toHaveBeenLastCalledWith({ name: "Renamed", state: undefined }, "Contoso", 3);

      api.deleteTestConfguration.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(T.delete_test_configuration)({ ...P, configurationId: 3 }))).toEqual({ deleted: 3 });
    });

    it("lists, gets, creates, updates and deletes variables", async () => {
      api.getTestVariables.mockResolvedValue([{ id: 5 }]);
      await handlerFor(T.list_test_variables)({ ...P, continuationToken: "t" });
      expect(api.getTestVariables).toHaveBeenCalledWith("Contoso", "t");

      api.getTestVariableById.mockResolvedValue({ id: 5 });
      await handlerFor(T.get_test_variable)({ ...P, variableId: 5 });
      expect(api.getTestVariableById).toHaveBeenCalledWith("Contoso", 5);

      api.createTestVariable.mockResolvedValue({ id: 6 });
      await handlerFor(T.create_test_variable)({ ...P, name: "Browser", values: ["Edge", "Chrome"] });
      expect(api.createTestVariable).toHaveBeenCalledWith({ name: "Browser", values: ["Edge", "Chrome"] }, "Contoso");

      api.updateTestVariable.mockResolvedValue({ id: 6 });
      await handlerFor(T.update_test_variable)({ ...P, variableId: 6, name: "Browser", values: ["Edge"] });
      expect(api.updateTestVariable).toHaveBeenCalledWith({ name: "Browser", values: ["Edge"] }, "Contoso", 6);

      api.deleteTestVariable.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(T.delete_test_variable)({ ...P, variableId: 6 }))).toEqual({ deleted: 6 });
    });
  });

  it.each([
    [T.get_test_plan, "getTestPlanById", { planId: 1 }, "getting test plan 1"],
    [T.clone_test_plan, "cloneTestPlan", { sourcePlanId: 1, name: "n", iteration: "i", deepClone: false }, "cloning test plan 1"],
    [T.update_test_suite, "updateTestSuite", { planId: 1, suiteId: 2, revision: 0 }, "updating test suite 2"],
    [T.list_suite_entries, "getSuiteEntries", { suiteId: 2 }, "listing entries of test suite 2"],
    [T.remove_test_cases_from_suite, "removeTestCasesFromSuite", { planId: 1, suiteId: 2, testCaseIds: [3] }, "removing test cases from suite 2"],
    [T.create_test_variable, "createTestVariable", { name: "v" }, "creating test variable 'v'"],
  ])("%s surfaces an API failure", async (tool, method, args, action) => {
    api[method].mockRejectedValue(new Error("TF400499"));

    const result = await handlerFor(tool)({ ...P, ...args });

    expect(result).toEqual({ content: [{ type: "text", text: `Error ${action}: TF400499` }], isError: true });
  });

  it("surfaces a non-Error failure as text", async () => {
    api.deleteTestVariable.mockRejectedValue("boom");

    const result = await handlerFor(T.delete_test_variable)({ ...P, variableId: 1 });

    expect(result.content[0].text).toBe("Error deleting test variable 1: boom");
  });
});

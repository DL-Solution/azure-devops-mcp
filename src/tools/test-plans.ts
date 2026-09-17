// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { Outcome, SuiteEntryTypes, TestPlanCreateParams, TestPlanReference, TestPlanUpdateParams, TestSuiteUpdateParams } from "azure-devops-node-api/interfaces/TestPlanInterfaces.js";
import { z } from "zod";
import { apiVersion, safeEnumConvert } from "../utils.js";
import { requiredProject, requiredProjectWith } from "../shared/common-params.js";

const Test_Plan_Tools = {
  create_test_plan: "testplan_create_test_plan",
  create_test_case: "testplan_create_test_case",
  update_test_case_steps: "testplan_update_test_case_steps",
  add_test_cases_to_suite: "testplan_add_test_cases_to_suite",
  test_results_from_build_id: "testplan_show_test_results_from_build_id",
  list_test_cases: "testplan_list_test_cases",
  list_test_plans: "testplan_list_test_plans",
  list_test_suites: "testplan_list_test_suites",
  create_test_suite: "testplan_create_test_suite",
  list_test_points: "testplan_list_test_points",
  get_test_point: "testplan_get_test_point",
  update_test_points: "testplan_update_test_points",
  get_test_plan: "testplan_get_test_plan",
  update_test_plan: "testplan_update_test_plan",
  delete_test_plan: "testplan_delete_test_plan",
  list_deleted_test_plans: "testplan_list_deleted_test_plans",
  restore_test_plan: "testplan_restore_test_plan",
  clone_test_plan: "testplan_clone_test_plan",
  get_clone_operation: "testplan_get_clone_operation",
  get_test_suite: "testplan_get_test_suite",
  update_test_suite: "testplan_update_test_suite",
  delete_test_suite: "testplan_delete_test_suite",
  list_deleted_test_suites: "testplan_list_deleted_test_suites",
  restore_test_suite: "testplan_restore_test_suite",
  clone_test_suite: "testplan_clone_test_suite",
  list_suites_for_test_case: "testplan_list_suites_for_test_case",
  list_suite_entries: "testplan_list_suite_entries",
  reorder_suite_entries: "testplan_reorder_suite_entries",
  get_suite_test_case: "testplan_get_suite_test_case",
  remove_test_cases_from_suite: "testplan_remove_test_cases_from_suite",
  delete_test_case: "testplan_delete_test_case",
  clone_test_cases: "testplan_clone_test_cases",
  list_test_configurations: "testplan_list_test_configurations",
  get_test_configuration: "testplan_get_test_configuration",
  create_test_configuration: "testplan_create_test_configuration",
  update_test_configuration: "testplan_update_test_configuration",
  delete_test_configuration: "testplan_delete_test_configuration",
  list_test_variables: "testplan_list_test_variables",
  get_test_variable: "testplan_get_test_variable",
  create_test_variable: "testplan_create_test_variable",
  update_test_variable: "testplan_update_test_variable",
  delete_test_variable: "testplan_delete_test_variable",
};

// A test point is one test case as scheduled in one suite with one
// configuration — it is what carries the tester assignment and the manual
// outcome, which the test case itself does not.
const TEST_POINT_OUTCOMES = [
  "Unspecified",
  "None",
  "Passed",
  "Failed",
  "Inconclusive",
  "Timeout",
  "Aborted",
  "Blocked",
  "NotExecuted",
  "Warning",
  "Error",
  "NotApplicable",
  "Paused",
  "InProgress",
  "NotImpacted",
] as const;

function configureTestPlanTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider?: () => string) {
  registerTool(
    server,
    Test_Plan_Tools.list_test_plans,
    "Retrieve a paginated list of test plans from an Azure DevOps project. Allows filtering for active plans and toggling detailed information.",
    {
      project: requiredProject,
      filterActivePlans: z.boolean().default(true).describe("Filter to include only active test plans. Defaults to true."),
      includePlanDetails: z.boolean().default(false).describe("Include detailed information about each test plan."),
      continuationToken: z.string().optional().describe("Token to continue fetching test plans from a previous request."),
    },
    async ({ project, filterActivePlans, includePlanDetails, continuationToken }) => {
      try {
        const connection = await connectionProvider();
        const accessToken = await tokenProvider();
        const params = new URLSearchParams({ "api-version": apiVersion });
        if (filterActivePlans) params.append("filterActivePlans", "true");
        if (includePlanDetails) params.append("includePlanDetails", "true");
        if (continuationToken) params.append("continuationToken", continuationToken);
        const url = `${connection.serverUrl}/${encodeURIComponent(project)}/_apis/testplan/Plans?${params.toString()}`;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
        };

        const userAgent = userAgentProvider?.();
        if (userAgent) {
          headers["User-Agent"] = userAgent;
        }

        const response = await fetch(url, {
          method: "GET",
          headers,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to list test plans (${response.status}): ${errorText}`);
        }

        const body = await response.json();
        const testPlans = body.value ?? [];
        const nextToken = response.headers.get("x-ms-continuationtoken") ?? undefined;

        const result: { testPlans: typeof testPlans; continuationToken?: string } = {
          testPlans: testPlans,
        };
        if (nextToken) {
          result.continuationToken = nextToken;
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing test plans: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  registerTool(
    server,
    Test_Plan_Tools.create_test_plan,
    "Creates a new test plan in the project.",
    {
      project: requiredProjectWith("The project the test plan is created in."),
      name: z.string().describe("The name of the test plan to be created."),
      iteration: z.string().describe("The iteration path for the test plan"),
      description: z.string().optional().describe("The description of the test plan"),
      startDate: z.string().optional().describe("The start date of the test plan"),
      endDate: z.string().optional().describe("The end date of the test plan"),
      areaPath: z.string().optional().describe("The area path for the test plan"),
    },
    async ({ project, name, iteration, description, startDate, endDate, areaPath }) => {
      try {
        const connection = await connectionProvider();
        const testPlanApi = await connection.getTestPlanApi();

        const testPlanToCreate: TestPlanCreateParams = {
          name,
          iteration,
          description,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          areaPath,
        };

        const createdTestPlan = await testPlanApi.createTestPlan(testPlanToCreate, project);

        return {
          content: [{ type: "text", text: JSON.stringify(createdTestPlan, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error creating test plan: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  registerTool(
    server,
    Test_Plan_Tools.create_test_suite,
    "Creates a new test suite in a test plan.",
    {
      project: z.string().describe("Project ID or project name"),
      planId: z.coerce.number().min(1).describe("ID of the test plan that contains the suites"),
      parentSuiteId: z.coerce.number().min(1).describe("ID of the parent suite under which the new suite will be created, if not given by user this can be id of a root suite of the test plan"),
      name: z.string().describe("Name of the child test suite"),
    },
    async ({ project, planId, parentSuiteId, name }) => {
      const maxRetries = 5;
      const baseDelay = 500; // milliseconds

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const connection = await connectionProvider();
          const testPlanApi = await connection.getTestPlanApi();

          const testSuiteToCreate = {
            name,
            parentSuite: {
              id: parentSuiteId,
              name: "",
            },
            suiteType: 2,
          };

          const createdTestSuite = await testPlanApi.createTestSuite(testSuiteToCreate, project, planId);

          return {
            content: [{ type: "text", text: JSON.stringify(createdTestSuite, null, 2) }],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

          // Check if it's a concurrency conflict error
          const isConcurrencyError = errorMessage.includes("TF26071") || errorMessage.includes("got update") || errorMessage.includes("changed by someone else");

          // If it's a concurrency error and we have retries left, wait and retry
          if (isConcurrencyError && attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 200; // Exponential backoff with jitter
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue; // Retry
          }

          // If not a concurrency error or out of retries, return error
          return {
            content: [{ type: "text", text: `Error creating test suite: ${errorMessage}` }],
            isError: true,
          };
        }
      }

      // This should never be reached, but TypeScript requires a return value
      return {
        content: [{ type: "text", text: "Error creating test suite: Maximum retries exceeded" }],
        isError: true,
      };
    }
  );

  registerTool(
    server,
    Test_Plan_Tools.add_test_cases_to_suite,
    "Adds existing test cases to a test suite.",
    {
      project: requiredProject,
      planId: z.coerce.number().min(1).describe("The ID of the test plan."),
      suiteId: z.coerce.number().min(1).describe("The ID of the test suite."),
      testCaseIds: z.string().or(z.array(z.string())).describe("The ID(s) of the test case(s) to add. "),
    },
    async ({ project, planId, suiteId, testCaseIds }) => {
      try {
        const connection = await connectionProvider();
        const testApi = await connection.getTestApi();

        // If testCaseIds is an array, convert it to comma-separated string
        const testCaseIdsString = Array.isArray(testCaseIds) ? testCaseIds.join(",") : testCaseIds;

        const addedTestCases = await testApi.addTestCasesToSuite(project, planId, suiteId, testCaseIdsString);

        return {
          content: [{ type: "text", text: JSON.stringify(addedTestCases, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error adding test cases to suite: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  registerTool(
    server,
    Test_Plan_Tools.create_test_case,
    "Creates a new test case work item.",
    {
      project: requiredProject,
      title: z.string().describe("The title of the test case."),
      steps: z
        .string()
        .optional()
        .describe(
          "The steps to reproduce the test case. Make sure to format each step as '1. Step one|Expected result one\n2. Step two|Expected result two. USE '|' as the delimiter between step and expected result. DO NOT use '|' in the description of the step or expected result."
        ),
      priority: z.coerce.number().optional().describe("The priority of the test case."),
      areaPath: z.string().optional().describe("The area path for the test case."),
      iterationPath: z.string().optional().describe("The iteration path for the test case."),
      testsWorkItemId: z.coerce.number().min(1).optional().describe("Optional work item id that will be set as a Microsoft.VSTS.Common.TestedBy-Reverse link to the test case."),
    },
    async ({ project, title, steps, priority, areaPath, iterationPath, testsWorkItemId }) => {
      try {
        const connection = await connectionProvider();
        const witClient = await connection.getWorkItemTrackingApi();

        let stepsXml;
        if (steps) {
          stepsXml = convertStepsToXml(steps);
        }

        // Create JSON patch document for work item
        const patchDocument = [];

        patchDocument.push({
          op: "add",
          path: "/fields/System.Title",
          value: title,
        });

        if (testsWorkItemId) {
          patchDocument.push({
            op: "add",
            path: "/relations/-",
            value: {
              rel: "Microsoft.VSTS.Common.TestedBy-Reverse",
              url: `${connection.serverUrl}/${project}/_apis/wit/workItems/${testsWorkItemId}`,
            },
          });
        }

        if (stepsXml) {
          patchDocument.push({
            op: "add",
            path: "/fields/Microsoft.VSTS.TCM.Steps",
            value: stepsXml,
          });
        }

        if (priority) {
          patchDocument.push({
            op: "add",
            path: "/fields/Microsoft.VSTS.Common.Priority",
            value: priority,
          });
        }

        if (areaPath) {
          patchDocument.push({
            op: "add",
            path: "/fields/System.AreaPath",
            value: areaPath,
          });
        }

        if (iterationPath) {
          patchDocument.push({
            op: "add",
            path: "/fields/System.IterationPath",
            value: iterationPath,
          });
        }

        const workItem = await witClient.createWorkItem({}, patchDocument, project, "Test Case");

        return {
          content: [{ type: "text", text: JSON.stringify(workItem, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error creating test case: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  registerTool(
    server,
    Test_Plan_Tools.update_test_case_steps,
    "Update an existing test case work item.",
    {
      id: z.coerce.number().min(1).describe("The ID of the test case work item to update."),
      steps: z
        .string()
        .describe(
          "The steps to reproduce the test case. Make sure to format each step as '1. Step one|Expected result one\n2. Step two|Expected result two. USE '|' as the delimiter between step and expected result. DO NOT use '|' in the description of the step or expected result."
        ),
    },
    async ({ id, steps }) => {
      try {
        const connection = await connectionProvider();
        const witClient = await connection.getWorkItemTrackingApi();

        let stepsXml;
        if (steps) {
          stepsXml = convertStepsToXml(steps);
        }

        // Create JSON patch document for work item
        const patchDocument = [];

        if (stepsXml) {
          patchDocument.push({
            op: "add",
            path: "/fields/Microsoft.VSTS.TCM.Steps",
            value: stepsXml,
          });
        }

        const workItem = await witClient.updateWorkItem({}, patchDocument, id);

        return {
          content: [{ type: "text", text: JSON.stringify(workItem, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error updating test case steps: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  registerTool(
    server,
    Test_Plan_Tools.list_test_cases,
    "Gets a list of test cases in the test plan.",
    {
      project: requiredProject,
      planid: z.coerce.number().min(1).describe("The ID of the test plan."),
      suiteid: z.coerce.number().min(1).describe("The ID of the test suite."),
      continuationToken: z.string().optional().describe("Token to continue fetching test cases from a previous request."),
    },
    async ({ project, planid, suiteid, continuationToken }) => {
      try {
        const connection = await connectionProvider();
        const accessToken = await tokenProvider();
        const params = new URLSearchParams({ "api-version": "7.2-preview.3" });
        if (continuationToken) params.append("continuationToken", continuationToken);
        const url = `${connection.serverUrl}/${encodeURIComponent(project)}/_apis/testplan/Plans/${planid}/Suites/${suiteid}/TestCase?${params.toString()}`;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
        };

        const userAgent = userAgentProvider?.();
        if (userAgent) {
          headers["User-Agent"] = userAgent;
        }

        const response = await fetch(url, {
          method: "GET",
          headers,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to list test cases (${response.status}): ${errorText}`);
        }

        const body = await response.json();
        const testcases = body.value ?? [];
        const nextToken = response.headers.get("x-ms-continuationtoken") ?? undefined;

        const result: { testCases: typeof testcases; continuationToken?: string } = {
          testCases: testcases,
        };
        if (nextToken) {
          result.continuationToken = nextToken;
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing test cases: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  registerTool(
    server,
    Test_Plan_Tools.test_results_from_build_id,
    "Gets a list of test results for a given project and build ID. Can filter by test outcome (e.g. Failed, Passed, Aborted). Returns test case titles, error messages, stack traces, and outcomes. Efficiently handles builds with large numbers of test runs.",
    {
      project: requiredProject,
      buildid: z.coerce.number().min(1).describe("The ID of the build."),
      outcomes: z.array(z.string()).optional().describe("Filter results by test outcome, e.g. ['Failed', 'Passed', 'Aborted']."),
    },
    async ({ project, buildid, outcomes }) => {
      try {
        const connection = await connectionProvider();
        const testResultsApi = await connection.getTestResultsApi();

        // Build filter expression for outcomes if specified.
        // The API accepts: Outcome eq Failed,Passed (unquoted, comma-separated)
        const outcomeFilter = outcomes?.length ? `Outcome eq ${outcomes.join(",")}` : undefined;

        // Fetch test result details for the build in a single API call
        // This is more efficient than getTestRuns + getTestResults per run,
        // especially for builds with many test runs (e.g., cloud testing with one run per test case)
        const testResultDetails = await testResultsApi.getTestResultDetailsForBuild(
          project,
          buildid,
          undefined, // publishContext
          undefined, // groupBy
          outcomeFilter, // filter by outcome
          undefined, // orderby
          true // shouldIncludeResults - get individual test results, not just aggregates
        );

        // Extract individual test results from the grouped response
        const allResults: any[] = [];
        if (testResultDetails.resultsForGroup) {
          for (const group of testResultDetails.resultsForGroup) {
            if (group.results) {
              for (const result of group.results) {
                allResults.push(result);
              }
            }
          }
        }

        // Format results to extract useful fields
        const formattedResults = allResults.map((r) => ({
          id: r.id,
          testCaseTitle: r.testCaseTitle,
          outcome: r.outcome,
          errorMessage: r.errorMessage,
          stackTrace: r.stackTrace,
          automatedTestName: r.automatedTestName,
          automatedTestStorage: r.automatedTestStorage,
          durationInMs: r.durationInMs,
          runId: r.testRun?.id,
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(formattedResults, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching test results: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  registerTool(
    server,
    Test_Plan_Tools.list_test_suites,
    "Retrieve a paginated list of test suites from an Azure DevOps project and Test Plan Id.",
    {
      project: requiredProject,
      planId: z.coerce.number().min(1).describe("The ID of the test plan."),
      continuationToken: z.string().optional().describe("Token to continue fetching test plans from a previous request."),
    },
    async ({ project, planId, continuationToken }) => {
      try {
        const connection = await connectionProvider();
        const accessToken = await tokenProvider();
        const params = new URLSearchParams({ "api-version": apiVersion, "expand": "children" });
        if (continuationToken) params.append("continuationToken", continuationToken);
        const url = `${connection.serverUrl}/${encodeURIComponent(project)}/_apis/testplan/Plans/${planId}/Suites?${params.toString()}`;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
        };

        const userAgent = userAgentProvider?.();
        if (userAgent) {
          headers["User-Agent"] = userAgent;
        }

        const response = await fetch(url, {
          method: "GET",
          headers,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to list test suites (${response.status}): ${errorText}`);
        }

        const body = await response.json();
        const testSuites = body.value ?? [];
        const nextToken = response.headers.get("x-ms-continuationtoken") ?? undefined;

        // The API returns a flat list where the root suite is first, followed by all nested suites
        // We need to build a proper hierarchy by creating a map and assembling the tree

        // Create a map of all suites by ID for quick lookup
        const suiteMap = new Map();
        testSuites.forEach((suite: any) => {
          suiteMap.set(suite.id, {
            id: suite.id,
            name: suite.name,
            parentSuiteId: suite.parentSuite?.id,
            children: [] as any[],
          });
        });

        // Build the hierarchy by linking children to parents
        const roots: any[] = [];
        suiteMap.forEach((suite: any) => {
          if (suite.parentSuiteId && suiteMap.has(suite.parentSuiteId)) {
            // This is a child suite, add it to its parent's children array
            const parent = suiteMap.get(suite.parentSuiteId);
            parent.children.push(suite);
          } else {
            // This is a root suite (no parent or parent not in map)
            roots.push(suite);
          }
        });

        // Clean up the output - remove parentSuiteId and empty children arrays
        const cleanSuite = (suite: any): any => {
          const cleaned: any = {
            id: suite.id,
            name: suite.name,
          };
          if (suite.children && suite.children.length > 0) {
            cleaned.children = suite.children.map((child: any) => cleanSuite(child));
          }
          return cleaned;
        };

        const cleanedSuites = roots.map((root: any) => cleanSuite(root));

        const result: { testSuites: typeof cleanedSuites; continuationToken?: string } = {
          testSuites: cleanedSuites,
        };
        if (nextToken) {
          result.continuationToken = nextToken;
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing test suites: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  const failed = (action: string, error: unknown) => ({
    content: [{ type: "text" as const, text: `Error ${action}: ${error instanceof Error ? error.message : String(error)}` }],
    isError: true,
  });
  const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

  registerTool(
    server,
    Test_Plan_Tools.list_test_points,
    "List the test points of a suite — each test case as scheduled against a configuration, with its assigned tester and last outcome. This is where a manual test plan's progress lives.",
    {
      project: requiredProject,
      planId: z.coerce.number().describe("The ID of the test plan."),
      suiteId: z.coerce.number().describe("The ID of the test suite within the plan."),
      testCaseId: z.string().optional().describe("Return only the points for this test case ID."),
      includePointDetails: z.boolean().default(true).describe("Include the outcome, tester and configuration of each point."),
      isRecursive: z.boolean().default(false).describe("Include the points of child suites."),
      continuationToken: z.string().optional().describe("Token from a previous response, to fetch the next page."),
    },
    async ({ project, planId, suiteId, testCaseId, includePointDetails, isRecursive, continuationToken }) => {
      try {
        const connection = await connectionProvider();
        const testPlanApi = await connection.getTestPlanApi();
        const points = await testPlanApi.getPointsList(project, planId, suiteId, undefined, testCaseId, continuationToken, true, includePointDetails, isRecursive);
        return ok(points);
      } catch (error) {
        return failed(`listing test points of suite ${suiteId}`, error);
      }
    }
  );

  registerTool(
    server,
    Test_Plan_Tools.get_test_point,
    "Get one test point of a suite by its ID.",
    {
      project: requiredProject,
      planId: z.coerce.number().describe("The ID of the test plan."),
      suiteId: z.coerce.number().describe("The ID of the test suite within the plan."),
      pointId: z.coerce.number().describe("The ID of the test point."),
      includePointDetails: z.boolean().default(true).describe("Include the outcome, tester and configuration of the point."),
    },
    async ({ project, planId, suiteId, pointId, includePointDetails }) => {
      try {
        const connection = await connectionProvider();
        const testPlanApi = await connection.getTestPlanApi();
        const points = await testPlanApi.getPoints(project, planId, suiteId, String(pointId), true, includePointDetails);
        if (!points || points.length === 0) {
          return { content: [{ type: "text", text: `Test point ${pointId} not found in suite ${suiteId}` }], isError: true };
        }
        return ok(points[0]);
      } catch (error) {
        return failed(`getting test point ${pointId}`, error);
      }
    }
  );

  registerTool(
    server,
    Test_Plan_Tools.update_test_points,
    "Assign a tester to test points, or record a manual outcome on them. Updates several points in one call.",
    {
      project: requiredProject,
      planId: z.coerce.number().describe("The ID of the test plan."),
      suiteId: z.coerce.number().describe("The ID of the test suite within the plan."),
      pointIds: z.array(z.coerce.number()).min(1).describe("The test points to update."),
      testerId: z.string().optional().describe("Identity ID of the tester to assign. Resolve a name to an ID with core_get_identity_ids."),
      outcome: z.enum(TEST_POINT_OUTCOMES).optional().describe("Outcome to record against each point."),
      isActive: z.boolean().optional().describe("Whether the points are active in the suite."),
    },
    async ({ project, planId, suiteId, pointIds, testerId, outcome, isActive }) => {
      try {
        if (testerId === undefined && outcome === undefined && isActive === undefined) {
          return { content: [{ type: "text", text: "Nothing to update: pass testerId, outcome or isActive." }], isError: true };
        }

        const connection = await connectionProvider();
        const testPlanApi = await connection.getTestPlanApi();
        const updates = pointIds.map((id) => ({
          id,
          ...(isActive === undefined ? {} : { isActive }),
          ...(testerId ? { tester: { id: testerId } } : {}),
          ...(outcome ? { results: { outcome: safeEnumConvert(Outcome, outcome) } } : {}),
        }));

        const updated = await testPlanApi.updateTestPoints(updates, project, planId, suiteId, true, true);
        return ok(updated);
      } catch (error) {
        return failed(`updating test points of suite ${suiteId}`, error);
      }
    }
  );

  // ---------------------------------------------------------------- plans ---

  /** Runs one Test Plan API call and turns its result (or failure) into a tool result. */
  async function call(action: string, run: (api: Awaited<ReturnType<WebApi["getTestPlanApi"]>>) => Promise<unknown>, notFound?: string) {
    try {
      const connection = await connectionProvider();
      const result = await run(await connection.getTestPlanApi());
      if (notFound && (result === null || result === undefined)) {
        return { content: [{ type: "text" as const, text: notFound }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result ?? { done: true }, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Error ${action}: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }

  const planIdParam = z.coerce.number().min(1).describe("The ID of the test plan.");
  const suiteIdParam = z.coerce.number().min(1).describe("The ID of the test suite.");
  const cloneOptionsParam = z
    .object({
      copyAllSuites: z.boolean().optional().describe("Copy every suite rather than only the ones listed."),
      copyAncestorHierarchy: z.boolean().optional().describe("Also create the parent suites of the copied ones."),
      cloneRequirements: z.boolean().optional().describe("Also copy the requirements (user stories) that requirement-based suites point at."),
      relatedLinkComment: z.string().optional().describe("Comment on the link from each copied test case back to its original."),
    })
    .optional()
    .describe("How much to copy.");

  registerTool(
    server,
    Test_Plan_Tools.get_test_plan,
    "Get one test plan: area and iteration, dates, owner, state, root suite and the build it tests.",
    { project: requiredProject, planId: planIdParam },
    async ({ project, planId }) => call(`getting test plan ${planId}`, (api) => api.getTestPlanById(project, planId), `Test plan ${planId} not found`)
  );

  registerTool(
    server,
    Test_Plan_Tools.update_test_plan,
    "Change a test plan's name, description, area, iteration, dates or state. Only the values you pass change.",
    {
      project: requiredProject,
      planId: planIdParam,
      name: z.string().optional().describe("New plan name."),
      description: z.string().optional().describe("New description."),
      areaPath: z.string().optional().describe("New area path."),
      iteration: z.string().optional().describe("New iteration path."),
      startDate: z.coerce.date().optional().describe("New start date."),
      endDate: z.coerce.date().optional().describe("New end date."),
      state: z.enum(["Active", "Inactive"]).optional().describe("Plan state."),
    },
    async ({ project, planId, ...changes }) => {
      const update = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
      if (Object.keys(update).length === 0) {
        return { content: [{ type: "text", text: "Nothing to update: give at least one field." }], isError: true };
      }
      return call(`updating test plan ${planId}`, (api) => api.updateTestPlan(update as unknown as TestPlanUpdateParams, project, planId));
    }
  );

  registerTool(
    server,
    Test_Plan_Tools.delete_test_plan,
    "Delete a test plan with its suites and test points. The test case work items and past results stay. It can be restored with testplan_restore_test_plan.",
    { project: requiredProject, planId: planIdParam },
    async ({ project, planId }) => call(`deleting test plan ${planId}`, async (api) => (await api.deleteTestPlan(project, planId), { deleted: planId }))
  );

  registerTool(
    server,
    Test_Plan_Tools.list_deleted_test_plans,
    "List the deleted test plans of a project that can still be restored.",
    { project: requiredProject, continuationToken: z.string().optional().describe("Token from a previous page.") },
    async ({ project, continuationToken }) => call("listing deleted test plans", async (api) => (await api.getDeletedTestPlans(project, continuationToken)) ?? [])
  );

  registerTool(server, Test_Plan_Tools.restore_test_plan, "Restore a deleted test plan with its suites.", { project: requiredProject, planId: planIdParam }, async ({ project, planId }) =>
    call(`restoring test plan ${planId}`, async (api) => (await api.restoreDeletedTestPlan({ isDeleted: false }, project, planId), { restored: planId }))
  );

  registerTool(
    server,
    Test_Plan_Tools.clone_test_plan,
    "Copy a test plan, or chosen suites of it, into a new plan — for example to start the next release's regression pass from the last one. Runs asynchronously; follow it with testplan_get_clone_operation.",
    {
      project: requiredProject,
      sourcePlanId: z.coerce.number().min(1).describe("The plan to copy."),
      suiteIds: z.array(z.coerce.number().min(1)).optional().describe("Only these suites of the source plan. Omit for all."),
      name: z.string().describe("Name of the new plan."),
      areaPath: z.string().optional().describe("Area path of the new plan. Omit to keep the source's."),
      iteration: z.string().describe("Iteration path of the new plan."),
      destinationProject: z.string().optional().describe("Project to create the new plan in. Omit for the same project."),
      deepClone: z.boolean().default(false).describe("Also copy the test case work items, so the new plan does not share them with the old one."),
      cloneOptions: cloneOptionsParam,
    },
    async ({ project, sourcePlanId, suiteIds, name, areaPath, iteration, destinationProject, deepClone, cloneOptions }) =>
      call(`cloning test plan ${sourcePlanId}`, (api) =>
        api.cloneTestPlan({ sourceTestPlan: { id: sourcePlanId, suiteIds }, destinationTestPlan: { name, areaPath, iteration, project: destinationProject }, cloneOptions }, project, deepClone)
      )
  );

  registerTool(
    server,
    Test_Plan_Tools.get_clone_operation,
    "Get the progress of a test plan, suite or test case copy started with testplan_clone_test_plan, testplan_clone_test_suite or testplan_clone_test_cases.",
    {
      project: requiredProject,
      kind: z.enum(["plan", "suite", "testCase"]).describe("What was being copied."),
      cloneOperationId: z.coerce.number().min(1).describe("The operation ID the clone call returned."),
    },
    async ({ project, kind, cloneOperationId }) =>
      call(
        `getting clone operation ${cloneOperationId}`,
        (api) =>
          kind === "plan"
            ? api.getCloneInformation(project, cloneOperationId)
            : kind === "suite"
              ? api.getSuiteCloneInformation(project, cloneOperationId)
              : api.getTestCaseCloneInformation(project, cloneOperationId),
        `Clone operation ${cloneOperationId} not found`
      )
  );

  // --------------------------------------------------------------- suites ---

  registerTool(
    server,
    Test_Plan_Tools.get_test_suite,
    "Get one test suite: its type (static, requirement-based or query-based), parent, query, default configurations and testers.",
    {
      project: requiredProject,
      planId: planIdParam,
      suiteId: suiteIdParam,
    },
    async ({ project, planId, suiteId }) => call(`getting test suite ${suiteId}`, (api) => api.getTestSuiteById(project, planId, suiteId), `Test suite ${suiteId} not found in plan ${planId}`)
  );

  registerTool(
    server,
    Test_Plan_Tools.update_test_suite,
    "Rename a test suite, move it under another parent, change a query-based suite's query, or set its default configurations and testers. The API needs the suite's current revision, as testplan_get_test_suite returns it.",
    {
      project: requiredProject,
      planId: planIdParam,
      suiteId: suiteIdParam,
      revision: z.coerce.number().min(0).describe("The suite's current revision."),
      name: z.string().optional().describe("New suite name."),
      parentSuiteId: z.coerce.number().min(1).optional().describe("Move the suite under this suite."),
      queryString: z.string().optional().describe("For a query-based suite: the new WIQL query selecting its test cases."),
      defaultConfigurationIds: z.array(z.coerce.number().min(1)).optional().describe("Configurations new test points get."),
      inheritDefaultConfigurations: z.boolean().optional().describe("Use the parent suite's default configurations."),
    },
    async ({ project, planId, suiteId, revision, name, parentSuiteId, queryString, defaultConfigurationIds, inheritDefaultConfigurations }) =>
      call(`updating test suite ${suiteId}`, (api) =>
        api.updateTestSuite(
          {
            revision,
            name,
            parentSuite: parentSuiteId === undefined ? undefined : { id: parentSuiteId },
            queryString,
            defaultConfigurations: defaultConfigurationIds?.map((id) => ({ id })),
            inheritDefaultConfigurations,
          } as TestSuiteUpdateParams,
          project,
          planId,
          suiteId
        )
      )
  );

  registerTool(
    server,
    Test_Plan_Tools.delete_test_suite,
    "Delete a test suite with its child suites and test points. The test case work items stay. It can be restored with testplan_restore_test_suite.",
    { project: requiredProject, planId: planIdParam, suiteId: suiteIdParam },
    async ({ project, planId, suiteId }) => call(`deleting test suite ${suiteId}`, async (api) => (await api.deleteTestSuite(project, planId, suiteId), { deleted: suiteId }))
  );

  registerTool(
    server,
    Test_Plan_Tools.list_deleted_test_suites,
    "List deleted test suites that can still be restored, in one plan or across the project.",
    {
      project: requiredProject,
      planId: z.coerce.number().min(1).optional().describe("Only suites deleted from this plan."),
      continuationToken: z.string().optional().describe("Token from a previous page."),
    },
    async ({ project, planId, continuationToken }) =>
      call(
        "listing deleted test suites",
        async (api) =>
          (planId !== undefined
            ? await api.getDeletedTestSuitesForPlan(project, planId, undefined, continuationToken)
            : await api.getDeletedTestSuitesForProject(project, undefined, continuationToken)) ?? []
      )
  );

  registerTool(server, Test_Plan_Tools.restore_test_suite, "Restore a deleted test suite.", { project: requiredProject, suiteId: suiteIdParam }, async ({ project, suiteId }) =>
    call(`restoring test suite ${suiteId}`, async (api) => (await api.restoreDeletedTestSuite({ isDeleted: false }, project, suiteId), { restored: suiteId }))
  );

  registerTool(
    server,
    Test_Plan_Tools.clone_test_suite,
    "Copy a test suite into another suite, of the same or another plan. Runs asynchronously; follow it with testplan_get_clone_operation.",
    {
      project: requiredProject,
      sourceSuiteId: z.coerce.number().min(1).describe("The suite to copy."),
      destinationSuiteId: z.coerce.number().min(1).describe("The suite to copy it into."),
      destinationProject: z.string().optional().describe("Project of the destination suite. Omit for the same project."),
      deepClone: z.boolean().default(false).describe("Also copy the test case work items."),
      cloneOptions: cloneOptionsParam,
    },
    async ({ project, sourceSuiteId, destinationSuiteId, destinationProject, deepClone, cloneOptions }) =>
      call(`cloning test suite ${sourceSuiteId}`, (api) =>
        api.cloneTestSuite({ sourceTestSuite: { id: sourceSuiteId }, destinationTestSuite: { id: destinationSuiteId, project: destinationProject }, cloneOptions }, project, deepClone)
      )
  );

  registerTool(
    server,
    Test_Plan_Tools.list_suites_for_test_case,
    "List every test suite, in any plan, that contains a test case — useful before changing or deleting a shared test case.",
    { testCaseId: z.coerce.number().min(1).describe("The work item ID of the test case.") },
    async ({ testCaseId }) => call(`listing suites of test case ${testCaseId}`, async (api) => (await api.getSuitesByTestCaseId(testCaseId)) ?? [])
  );

  registerTool(
    server,
    Test_Plan_Tools.list_suite_entries,
    "List the entries of a test suite — its child suites and test cases — with their order.",
    {
      project: requiredProject,
      suiteId: suiteIdParam,
      entryType: z.enum(["TestCase", "Suite"]).optional().describe("Only test cases or only child suites."),
    },
    async ({ project, suiteId, entryType }) =>
      call(`listing entries of test suite ${suiteId}`, async (api) => (await api.getSuiteEntries(project, suiteId, safeEnumConvert(SuiteEntryTypes, entryType))) ?? [])
  );

  registerTool(
    server,
    Test_Plan_Tools.reorder_suite_entries,
    "Change the order of child suites and test cases in a test suite.",
    {
      project: requiredProject,
      suiteId: suiteIdParam,
      entries: z
        .array(
          z.object({
            id: z.coerce.number().min(1).describe("The test case work item ID or child suite ID."),
            entryType: z.enum(["TestCase", "Suite"]).describe("What the ID refers to."),
            sequenceNumber: z.coerce.number().min(0).describe("The new position, starting at 0."),
          })
        )
        .min(1)
        .describe("The entries to move."),
    },
    async ({ project, suiteId, entries }) =>
      call(`reordering test suite ${suiteId}`, (api) =>
        api.reorderSuiteEntries(
          entries.map(({ id, entryType, sequenceNumber }) => ({ id, sequenceNumber, suiteEntryType: safeEnumConvert(SuiteEntryTypes, entryType) })),
          project,
          suiteId
        )
      )
  );

  // ----------------------------------------------------------- test cases ---

  registerTool(
    server,
    Test_Plan_Tools.get_suite_test_case,
    "Get one test case as it sits in a suite, with its point assignments (configurations and testers).",
    {
      project: requiredProject,
      planId: planIdParam,
      suiteId: suiteIdParam,
      testCaseId: z.coerce.number().min(1).describe("The work item ID of the test case."),
      witFields: z.string().optional().describe("Comma-separated work item fields to include, e.g. 'System.Title,System.State'."),
    },
    async ({ project, planId, suiteId, testCaseId, witFields }) =>
      call(
        `getting test case ${testCaseId}`,
        async (api) => {
          const cases = await api.getTestCase(project, planId, suiteId, String(testCaseId), witFields);
          return cases?.[0] ?? null;
        },
        `Test case ${testCaseId} is not in suite ${suiteId}`
      )
  );

  registerTool(
    server,
    Test_Plan_Tools.remove_test_cases_from_suite,
    "Remove test cases from a suite, with their test points in it. The test case work items stay and remain in other suites.",
    {
      project: requiredProject,
      planId: planIdParam,
      suiteId: suiteIdParam,
      testCaseIds: z.array(z.coerce.number().min(1)).min(1).describe("Work item IDs of the test cases to remove."),
    },
    async ({ project, planId, suiteId, testCaseIds }) =>
      call(`removing test cases from suite ${suiteId}`, async (api) => (await api.removeTestCasesFromSuite(project, planId, suiteId, testCaseIds.join(",")), { removed: testCaseIds, suiteId }))
  );

  registerTool(
    server,
    Test_Plan_Tools.delete_test_case,
    "Permanently delete a test case work item together with its test points and results in every suite. Unlike removing it from a suite, this cannot be undone.",
    { project: requiredProject, testCaseId: z.coerce.number().min(1).describe("The work item ID of the test case.") },
    async ({ project, testCaseId }) => call(`deleting test case ${testCaseId}`, async (api) => (await api.deleteTestCase(project, testCaseId), { deleted: testCaseId }))
  );

  registerTool(
    server,
    Test_Plan_Tools.clone_test_cases,
    "Copy test cases from one suite into another, creating new test case work items. Runs asynchronously; follow it with testplan_get_clone_operation (kind 'testCase').",
    {
      project: requiredProject,
      sourcePlanId: z.coerce.number().min(1).describe("The plan the test cases are in."),
      sourceSuiteId: z.coerce.number().min(1).describe("The suite the test cases are in."),
      testCaseIds: z.array(z.coerce.number().min(1)).optional().describe("The test cases to copy. Omit for all of the suite's."),
      destinationPlanId: z.coerce.number().min(1).describe("The plan to copy into."),
      destinationSuiteId: z.coerce.number().min(1).describe("The suite to copy into."),
      destinationProject: z.string().optional().describe("Project of the destination. Omit for the same project."),
      relatedLinkComment: z.string().optional().describe("Comment on the link from each copy back to its original."),
    },
    async ({ project, sourcePlanId, sourceSuiteId, testCaseIds, destinationPlanId, destinationSuiteId, destinationProject, relatedLinkComment }) =>
      call("cloning test cases", (api) =>
        api.cloneTestCase(
          {
            sourceTestPlan: { id: sourcePlanId } as TestPlanReference,
            sourceTestSuite: { id: sourceSuiteId },
            testCaseIds,
            destinationTestPlan: { id: destinationPlanId } as TestPlanReference,
            destinationTestSuite: { id: destinationSuiteId, project: destinationProject },
            cloneOptions: relatedLinkComment === undefined ? undefined : { relatedLinkComment },
          },
          project
        )
      )
  );

  // ------------------------------------------------- configurations, variables ---

  const configurationIdParam = z.coerce.number().min(1).describe("The ID of the test configuration.");
  const variableIdParam = z.coerce.number().min(1).describe("The ID of the test variable.");

  registerTool(
    server,
    Test_Plan_Tools.list_test_configurations,
    "List the test configurations of a project — the combinations (e.g. 'Windows 11 + Edge') each test case is run against.",
    { project: requiredProject, continuationToken: z.string().optional().describe("Token from a previous page.") },
    async ({ project, continuationToken }) => call("listing test configurations", async (api) => (await api.getTestConfigurations(project, continuationToken)) ?? [])
  );

  registerTool(
    server,
    Test_Plan_Tools.get_test_configuration,
    "Get one test configuration with its variable values.",
    { project: requiredProject, configurationId: configurationIdParam },
    async ({ project, configurationId }) =>
      call(`getting test configuration ${configurationId}`, (api) => api.getTestConfigurationById(project, configurationId), `Test configuration ${configurationId} not found`)
  );

  const configurationFields = {
    name: z.string().describe("Configuration name, e.g. 'Windows 11 + Edge'."),
    description: z.string().optional().describe("Description."),
    values: z
      .array(z.object({ name: z.string().describe("A test variable name, e.g. 'Browser'."), value: z.string().describe("One of that variable's values, e.g. 'Edge'.") }))
      .optional()
      .describe("The variable values that make up the configuration."),
    isDefault: z.boolean().optional().describe("Assign it to new test cases by default."),
    state: z.enum(["Active", "Inactive"]).optional().describe("Configuration state."),
  };

  registerTool(
    server,
    Test_Plan_Tools.create_test_configuration,
    "Create a test configuration from values of existing test variables.",
    { project: requiredProject, ...configurationFields },
    async ({ project, state, ...fields }) =>
      call(`creating test configuration '${fields.name}'`, (api) => api.createTestConfiguration({ ...fields, state: state === undefined ? undefined : state === "Active" ? 1 : 2 }, project))
  );

  registerTool(
    server,
    Test_Plan_Tools.update_test_configuration,
    "Replace a test configuration's name, description, values, default flag or state. Pass the complete values list; missing values are removed.",
    { project: requiredProject, configurationId: configurationIdParam, ...configurationFields },
    async ({ project, configurationId, state, ...fields }) =>
      call(`updating test configuration ${configurationId}`, (api) =>
        api.updateTestConfiguration({ ...fields, state: state === undefined ? undefined : state === "Active" ? 1 : 2 }, project, configurationId)
      )
  );

  registerTool(
    server,
    Test_Plan_Tools.delete_test_configuration,
    "Delete a test configuration. For one that test points still use, setting it to Inactive keeps their history intact.",
    { project: requiredProject, configurationId: configurationIdParam },
    async ({ project, configurationId }) =>
      call(`deleting test configuration ${configurationId}`, async (api) => (await api.deleteTestConfguration(project, configurationId), { deleted: configurationId }))
  );

  registerTool(
    server,
    Test_Plan_Tools.list_test_variables,
    "List the test variables of a project — the dimensions, like 'Browser' or 'Operating System', that configurations combine.",
    { project: requiredProject, continuationToken: z.string().optional().describe("Token from a previous page.") },
    async ({ project, continuationToken }) => call("listing test variables", async (api) => (await api.getTestVariables(project, continuationToken)) ?? [])
  );

  registerTool(
    server,
    Test_Plan_Tools.get_test_variable,
    "Get one test variable with its allowed values.",
    { project: requiredProject, variableId: variableIdParam },
    async ({ project, variableId }) => call(`getting test variable ${variableId}`, (api) => api.getTestVariableById(project, variableId), `Test variable ${variableId} not found`)
  );

  const variableFields = {
    name: z.string().describe("Variable name, e.g. 'Browser'."),
    description: z.string().optional().describe("Description."),
    values: z.array(z.string()).optional().describe("The allowed values, e.g. ['Edge', 'Chrome', 'Firefox']."),
  };

  registerTool(server, Test_Plan_Tools.create_test_variable, "Create a test variable with its allowed values.", { project: requiredProject, ...variableFields }, async ({ project, ...fields }) =>
    call(`creating test variable '${fields.name}'`, (api) => api.createTestVariable(fields, project))
  );

  registerTool(
    server,
    Test_Plan_Tools.update_test_variable,
    "Replace a test variable's name, description or values. Pass the complete values list.",
    { project: requiredProject, variableId: variableIdParam, ...variableFields },
    async ({ project, variableId, ...fields }) => call(`updating test variable ${variableId}`, (api) => api.updateTestVariable(fields, project, variableId))
  );

  registerTool(
    server,
    Test_Plan_Tools.delete_test_variable,
    "Delete a test variable. Configurations that use it lose that value.",
    { project: requiredProject, variableId: variableIdParam },
    async ({ project, variableId }) => call(`deleting test variable ${variableId}`, async (api) => (await api.deleteTestVariable(project, variableId), { deleted: variableId }))
  );
}

/*
 * Format step content by converting Markdown markers to HTML and wrapping in the ADO rich text
 * envelope. The entire HTML string is then XML-escaped for storage in the parameterizedString
 * element, which is the format Azure DevOps expects for rendered step content.
 */
function formatStepContent(text: string): string {
  // Convert Markdown markers to HTML tags (** before * and __ before _ to avoid conflicts)
  const htmlContent = text
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');

  // Wrap in ADO rich text envelope and XML-escape the entire HTML string
  return escapeXml(`${htmlContent}`);
}

/*
 * Helper function to convert steps text to XML format required
 */
function convertStepsToXml(steps: string): string {
  // Accepts steps in the format: '1. Step one|Expected result one\n2. Step two|Expected result two'
  const stepsLines = steps.split("\n").filter((line) => line.trim() !== "");

  let xmlSteps = `<steps id="0" last="${stepsLines.length}">`;

  for (let i = 0; i < stepsLines.length; i++) {
    const stepLine = stepsLines[i].trim();
    if (stepLine) {
      // Split step and expected result by '|', fallback to default if not provided
      const [stepPart, expectedPart] = stepLine.split("|").map((s) => s.trim());
      const stepMatch = stepPart.match(/^(\d+)\.\s*(.+)$/);
      const stepText = stepMatch ? stepMatch[2] : stepPart;
      const expectedText = expectedPart || "Verify step completes successfully";

      xmlSteps += `
                <step id="${i + 1}" type="ActionStep">
                    <parameterizedString isformatted="true">${formatStepContent(stepText)}</parameterizedString>
                    <parameterizedString isformatted="true">${formatStepContent(expectedText)}</parameterizedString>
                </step>`;
    }
  }

  xmlSteps += "</steps>";
  return xmlSteps;
}

/*
 * Helper function to escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

export { Test_Plan_Tools, configureTestPlanTools };

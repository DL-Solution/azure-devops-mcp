// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Build and definition management, retention leases and settings, pipeline folders. Kept apart
// from pipelines.test.ts, which mocks fs and fetch for its artifact and stage cases.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { FolderQueryOrder } from "azure-devops-node-api/interfaces/BuildInterfaces.js";

import { configurePipelineTools, PIPELINE_TOOLS } from "../../../src/tools/pipelines";
import { createToolServer } from "../../mocks/tool-server";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

describe("pipeline admin tools", () => {
  let server: McpServer;
  let buildApi: Record<string, jest.Mock>;
  let connectionProvider: () => Promise<WebApi>;

  beforeEach(() => {
    server = createToolServer() as unknown as McpServer;
    buildApi = {
      createDefinition: jest.fn(),
      updateDefinition: jest.fn(),
      getRetentionLeasesByOwnerId: jest.fn(),
      addRetentionLeases: jest.fn(),
      updateRetentionLease: jest.fn(),
      deleteRetentionLeasesById: jest.fn(),
      getFolders: jest.fn(),
      createFolder: jest.fn(),
      updateFolder: jest.fn(),
      deleteFolder: jest.fn(),
      getRetentionLeasesForBuild: jest.fn(),
      deleteBuild: jest.fn(),
      getLatestBuild: jest.fn(),
      getBuildWorkItemsRefs: jest.fn(),
      getWorkItemsBetweenBuilds: jest.fn(),
      getChangesBetweenBuilds: jest.fn(),
      getTags: jest.fn(),
      deleteDefinition: jest.fn(),
      restoreDefinition: jest.fn(),
      getDefinitionYaml: jest.fn(),
      getDefinitionTags: jest.fn(),
      addDefinitionTags: jest.fn(),
      deleteDefinitionTag: jest.fn(),
      getDefinitionMetrics: jest.fn(),
      getProjectMetrics: jest.fn(),
      getDefinitionResources: jest.fn(),
      authorizeDefinitionResources: jest.fn(),
      getRetentionSettings: jest.fn(),
      updateRetentionSettings: jest.fn(),
      getBuildGeneralSettings: jest.fn(),
      updateBuildGeneralSettings: jest.fn(),
    };
    connectionProvider = jest.fn().mockResolvedValue({
      getBuildApi: jest.fn().mockResolvedValue(buildApi),
    } as unknown as WebApi) as () => Promise<WebApi>;
  });

  function handlerFor(toolName: string): Handler {
    configurePipelineTools(server, jest.fn() as () => Promise<string>, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as Handler;
  }

  const parsed = (result: { content: { text: string }[] }) => JSON.parse(result.content[0].text);

  it("registers every admin tool", () => {
    configurePipelineTools(server, jest.fn() as () => Promise<string>, connectionProvider, () => "Jest");
    const names = (server.tool as jest.Mock).mock.calls.map(([name]) => name);
    expect(names).toEqual(
      expect.arrayContaining([
        PIPELINE_TOOLS.pipelines_create_build_definition,
        PIPELINE_TOOLS.pipelines_update_build_definition,
        PIPELINE_TOOLS.pipelines_list_retention_leases,
        PIPELINE_TOOLS.pipelines_add_retention_lease,
        PIPELINE_TOOLS.pipelines_update_retention_lease,
        PIPELINE_TOOLS.pipelines_delete_retention_leases,
        PIPELINE_TOOLS.pipelines_list_folders,
        PIPELINE_TOOLS.pipelines_create_folder,
        PIPELINE_TOOLS.pipelines_update_folder,
        PIPELINE_TOOLS.pipelines_delete_folder,
      ])
    );
  });

  describe("build definitions", () => {
    const definition = { name: "api-ci", path: "\\services", revision: 4, process: { type: 2, yamlFilename: "ci.yml" } };

    it("creates a definition from the object as given", async () => {
      buildApi.createDefinition.mockResolvedValue({ id: 21, ...definition });

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_create_build_definition)({ project: "Contoso", definition });

      expect(buildApi.createDefinition).toHaveBeenCalledWith(definition, "Contoso");
      expect(parsed(result)).toMatchObject({ id: 21, name: "api-ci" });
    });

    it("surfaces a rejected definition", async () => {
      buildApi.createDefinition.mockRejectedValue(new Error("A definition with this name already exists"));

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_create_build_definition)({ project: "Contoso", definition });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("already exists");
    });

    it("replaces a definition by id", async () => {
      buildApi.updateDefinition.mockResolvedValue({ id: 21, ...definition, revision: 5 });

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_update_build_definition)({ project: "Contoso", definitionId: 21, definition });

      expect(buildApi.updateDefinition).toHaveBeenCalledWith(definition, "Contoso", 21);
      expect(parsed(result)).toMatchObject({ revision: 5 });
    });

    it("surfaces a stale revision", async () => {
      buildApi.updateDefinition.mockRejectedValue(new Error("The definition has been updated by another client"));

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_update_build_definition)({ project: "Contoso", definitionId: 21, definition });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error updating build definition 21");
    });
  });

  describe("retention leases", () => {
    it("lists leases with the filters in the client's argument order", async () => {
      buildApi.getRetentionLeasesByOwnerId.mockResolvedValue([{ leaseId: 17, ownerId: "Pipeline:3" }]);

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_list_retention_leases)({ project: "Contoso", definitionId: 3, runId: 30 });

      expect(buildApi.getRetentionLeasesByOwnerId).toHaveBeenCalledWith("Contoso", undefined, 3, 30);
      expect(parsed(result)).toEqual([{ leaseId: 17, ownerId: "Pipeline:3" }]);
    });

    it("filters by owner", async () => {
      buildApi.getRetentionLeasesByOwnerId.mockResolvedValue([]);

      await handlerFor(PIPELINE_TOOLS.pipelines_list_retention_leases)({ project: "Contoso", ownerId: "User:abc" });

      expect(buildApi.getRetentionLeasesByOwnerId).toHaveBeenCalledWith("Contoso", "User:abc", undefined, undefined);
    });

    it("surfaces a failure when listing", async () => {
      buildApi.getRetentionLeasesByOwnerId.mockRejectedValue(new Error("denied"));

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_list_retention_leases)({ project: "Contoso" });

      expect(result.isError).toBe(true);
    });

    it("adds one lease", async () => {
      buildApi.addRetentionLeases.mockResolvedValue([{ leaseId: 90 }]);

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_add_retention_lease)({
        project: "Contoso",
        definitionId: 3,
        runId: 30,
        ownerId: "User:abc",
        daysValid: 36500,
        protectPipeline: true,
      });

      expect(buildApi.addRetentionLeases).toHaveBeenCalledWith([{ definitionId: 3, runId: 30, ownerId: "User:abc", daysValid: 36500, protectPipeline: true }], "Contoso");
      expect(parsed(result)).toEqual([{ leaseId: 90 }]);
    });

    it("surfaces a rejected lease", async () => {
      buildApi.addRetentionLeases.mockRejectedValue(new Error("run not found"));

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_add_retention_lease)({ project: "Contoso", definitionId: 3, runId: 999, ownerId: "User:abc", daysValid: 1, protectPipeline: false });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("run not found");
    });

    it("updates a lease", async () => {
      buildApi.updateRetentionLease.mockResolvedValue({ leaseId: 90, protectPipeline: false });

      await handlerFor(PIPELINE_TOOLS.pipelines_update_retention_lease)({ project: "Contoso", leaseId: 90, daysValid: 30 });

      expect(buildApi.updateRetentionLease).toHaveBeenCalledWith({ daysValid: 30, protectPipeline: undefined }, "Contoso", 90);
    });

    it("refuses an update with nothing to change", async () => {
      const result = await handlerFor(PIPELINE_TOOLS.pipelines_update_retention_lease)({ project: "Contoso", leaseId: 90 });

      expect(result.isError).toBe(true);
      expect(buildApi.updateRetentionLease).not.toHaveBeenCalled();
    });

    it("surfaces a failed update", async () => {
      buildApi.updateRetentionLease.mockRejectedValue(new Error("lease not found"));

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_update_retention_lease)({ project: "Contoso", leaseId: 1, protectPipeline: true });

      expect(result.isError).toBe(true);
    });

    it("deletes leases by id", async () => {
      buildApi.deleteRetentionLeasesById.mockResolvedValue(undefined);

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_delete_retention_leases)({ project: "Contoso", leaseIds: [17, 18] });

      expect(buildApi.deleteRetentionLeasesById).toHaveBeenCalledWith("Contoso", [17, 18]);
      expect(parsed(result)).toEqual({ deleted: [17, 18] });
    });

    it("surfaces a failed deletion", async () => {
      buildApi.deleteRetentionLeasesById.mockRejectedValue(new Error("denied"));

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_delete_retention_leases)({ project: "Contoso", leaseIds: [17] });

      expect(result.isError).toBe(true);
    });
  });

  describe("folders", () => {
    it("lists all folders without a path", async () => {
      buildApi.getFolders.mockResolvedValue([{ path: "\\" }]);

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_list_folders)({ project: "Contoso" });

      expect(buildApi.getFolders).toHaveBeenCalledWith("Contoso", undefined, undefined);
      expect(parsed(result)).toEqual([{ path: "\\" }]);
    });

    it("normalizes a forward-slash path and converts the sort order", async () => {
      buildApi.getFolders.mockResolvedValue([]);

      await handlerFor(PIPELINE_TOOLS.pipelines_list_folders)({ project: "Contoso", path: "infra/docker/", queryOrder: "FolderDescending" });

      expect(buildApi.getFolders).toHaveBeenCalledWith("Contoso", "\\infra\\docker", FolderQueryOrder.FolderDescending);
    });

    it("surfaces a failure when listing", async () => {
      buildApi.getFolders.mockRejectedValue(new Error("denied"));

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_list_folders)({ project: "Contoso" });

      expect(result.isError).toBe(true);
    });

    it("creates a folder at the normalized path", async () => {
      buildApi.createFolder.mockResolvedValue({ path: "\\infra" });

      await handlerFor(PIPELINE_TOOLS.pipelines_create_folder)({ project: "Contoso", path: "/infra", description: "Infrastructure" });

      expect(buildApi.createFolder).toHaveBeenCalledWith({ path: "\\infra", description: "Infrastructure" }, "Contoso", "\\infra");
    });

    it("surfaces a failed creation", async () => {
      buildApi.createFolder.mockRejectedValue(new Error("folder exists"));

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_create_folder)({ project: "Contoso", path: "\\infra" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'\\infra'");
    });

    it("moves a folder to a new path", async () => {
      buildApi.updateFolder.mockResolvedValue({ path: "\\platform\\docker" });

      await handlerFor(PIPELINE_TOOLS.pipelines_update_folder)({ project: "Contoso", path: "\\docker", newPath: "platform/docker" });

      expect(buildApi.updateFolder).toHaveBeenCalledWith({ path: "\\platform\\docker", description: undefined }, "Contoso", "\\docker");
    });

    it("keeps the path when only the description changes", async () => {
      buildApi.updateFolder.mockResolvedValue({ path: "\\docker" });

      await handlerFor(PIPELINE_TOOLS.pipelines_update_folder)({ project: "Contoso", path: "\\docker", description: "Images" });

      expect(buildApi.updateFolder).toHaveBeenCalledWith({ path: "\\docker", description: "Images" }, "Contoso", "\\docker");
    });

    it("surfaces a failed update", async () => {
      buildApi.updateFolder.mockRejectedValue(new Error("target exists"));

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_update_folder)({ project: "Contoso", path: "\\docker", newPath: "\\x" });

      expect(result.isError).toBe(true);
    });

    it("deletes a folder", async () => {
      buildApi.deleteFolder.mockResolvedValue(undefined);

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_delete_folder)({ project: "Contoso", path: "old" });

      expect(buildApi.deleteFolder).toHaveBeenCalledWith("Contoso", "\\old");
      expect(parsed(result)).toEqual({ deleted: "\\old" });
    });

    it.each(["\\", "/", ""])("refuses to delete the root folder given as %j", async (path) => {
      const result = await handlerFor(PIPELINE_TOOLS.pipelines_delete_folder)({ project: "Contoso", path });

      expect(result.isError).toBe(true);
      expect(buildApi.deleteFolder).not.toHaveBeenCalled();
    });

    it("surfaces a failed deletion", async () => {
      buildApi.deleteFolder.mockRejectedValue(new Error("denied"));

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_delete_folder)({ project: "Contoso", path: "\\old" });

      expect(result.isError).toBe(true);
    });
  });

  it("lists every lease on one build, ignoring the other filters", async () => {
    buildApi.getRetentionLeasesForBuild.mockResolvedValue([{ leaseId: 33 }]);

    await handlerFor(PIPELINE_TOOLS.pipelines_list_retention_leases)({ project: "Contoso", buildId: 56, ownerId: "ignored" });

    expect(buildApi.getRetentionLeasesForBuild).toHaveBeenCalledWith("Contoso", 56);
    expect(buildApi.getRetentionLeasesByOwnerId).not.toHaveBeenCalled();
  });

  describe("builds", () => {
    const P = { project: "Contoso" };

    it("deletes a build", async () => {
      buildApi.deleteBuild.mockResolvedValue(undefined);

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_delete_build)({ ...P, buildId: 56 });

      expect(buildApi.deleteBuild).toHaveBeenCalledWith("Contoso", 56);
      expect(parsed(result)).toEqual({ deleted: 56 });
    });

    it("gets the latest build on a branch, or says there is none", async () => {
      buildApi.getLatestBuild.mockResolvedValue({ id: 56, result: 2 });
      await handlerFor(PIPELINE_TOOLS.pipelines_get_latest_build)({ ...P, definition: "api-ci", branchName: "refs/heads/main" });
      expect(buildApi.getLatestBuild).toHaveBeenCalledWith("Contoso", "api-ci", "refs/heads/main");

      buildApi.getLatestBuild.mockResolvedValue(null);
      expect((await handlerFor(PIPELINE_TOOLS.pipelines_get_latest_build)({ ...P, definition: "ghost", branchName: "refs/heads/dev" })).content[0].text).toBe(
        "No build found for pipeline 'ghost' on refs/heads/dev"
      );
      expect((await handlerFor(PIPELINE_TOOLS.pipelines_get_latest_build)({ ...P, definition: "ghost" })).content[0].text).toBe("No build found for pipeline 'ghost'");
    });

    it("lists work items of one build or between two", async () => {
      buildApi.getBuildWorkItemsRefs.mockResolvedValue([{ id: "116", url: "u", extra: 1 }]);
      expect(parsed(await handlerFor(PIPELINE_TOOLS.pipelines_get_build_work_items)({ ...P, buildId: 56, top: 5 }))).toEqual([{ id: "116", url: "u" }]);
      expect(buildApi.getBuildWorkItemsRefs).toHaveBeenCalledWith("Contoso", 56, 5);

      buildApi.getWorkItemsBetweenBuilds.mockResolvedValue(null);
      expect(parsed(await handlerFor(PIPELINE_TOOLS.pipelines_get_build_work_items)({ ...P, buildId: 56, fromBuildId: 51 }))).toEqual([]);
      expect(buildApi.getWorkItemsBetweenBuilds).toHaveBeenCalledWith("Contoso", 51, 56, undefined);
    });

    it("lists changes between builds and project build tags", async () => {
      buildApi.getChangesBetweenBuilds.mockResolvedValue([{ id: "abc" }]);
      await handlerFor(PIPELINE_TOOLS.pipelines_get_changes_between_builds)({ ...P, fromBuildId: 51, toBuildId: 56, top: 2 });
      expect(buildApi.getChangesBetweenBuilds).toHaveBeenCalledWith("Contoso", 51, 56, 2);

      buildApi.getTags.mockResolvedValue(null);
      expect(parsed(await handlerFor(PIPELINE_TOOLS.pipelines_list_project_build_tags)(P))).toEqual([]);
    });
  });

  describe("definitions", () => {
    const D = { project: "Contoso", definitionId: 3 };

    it("deletes and restores a definition", async () => {
      buildApi.deleteDefinition.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(PIPELINE_TOOLS.pipelines_delete_build_definition)(D))).toEqual({ deleted: 3 });
      expect(buildApi.deleteDefinition).toHaveBeenCalledWith("Contoso", 3);

      buildApi.restoreDefinition.mockResolvedValue({ id: 3 });
      await handlerFor(PIPELINE_TOOLS.pipelines_restore_build_definition)(D);
      expect(buildApi.restoreDefinition).toHaveBeenCalledWith("Contoso", 3, false);
    });

    it("exports a classic definition as plain YAML", async () => {
      buildApi.getDefinitionYaml.mockResolvedValue({ yaml: "steps:\n- script: echo hi\n" });

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_get_build_definition_yaml)({ ...D, revision: 4 });

      expect(buildApi.getDefinitionYaml).toHaveBeenCalledWith("Contoso", 3, 4);
      expect(result.content[0].text).toBe("steps:\n- script: echo hi\n");
    });

    // Checked against dl-sol: a YAML pipeline answers with an empty body, not an error.
    it("explains that a YAML pipeline has nothing to export", async () => {
      buildApi.getDefinitionYaml.mockResolvedValue(null);

      const result = await handlerFor(PIPELINE_TOOLS.pipelines_get_build_definition_yaml)(D);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("has no YAML to export");
    });

    it("lists, adds and removes definition tags", async () => {
      buildApi.getDefinitionTags.mockResolvedValue(null);
      expect(parsed(await handlerFor(PIPELINE_TOOLS.pipelines_get_definition_tags)({ ...D, revision: 2 }))).toEqual([]);
      expect(buildApi.getDefinitionTags).toHaveBeenCalledWith("Contoso", 3, 2);

      buildApi.addDefinitionTags.mockResolvedValue(["docker", "nightly"]);
      await handlerFor(PIPELINE_TOOLS.pipelines_add_definition_tags)({ ...D, tags: ["docker", "nightly"] });
      expect(buildApi.addDefinitionTags).toHaveBeenCalledWith(["docker", "nightly"], "Contoso", 3);

      buildApi.deleteDefinitionTag.mockResolvedValue(["docker"]);
      expect(parsed(await handlerFor(PIPELINE_TOOLS.pipelines_delete_definition_tag)({ ...D, tag: "nightly" }))).toEqual(["docker"]);
      expect(buildApi.deleteDefinitionTag).toHaveBeenCalledWith("Contoso", 3, "nightly");
    });

    it("gets metrics of one definition or of the project", async () => {
      const since = new Date("2026-09-01T00:00:00Z");
      buildApi.getDefinitionMetrics.mockResolvedValue([]);
      await handlerFor(PIPELINE_TOOLS.pipelines_get_build_metrics)({ ...D, aggregation: "daily", minMetricsTime: since });
      expect(buildApi.getDefinitionMetrics).toHaveBeenCalledWith("Contoso", 3, since);

      buildApi.getProjectMetrics.mockResolvedValue([]);
      await handlerFor(PIPELINE_TOOLS.pipelines_get_build_metrics)({ project: "Contoso", aggregation: "hourly" });
      expect(buildApi.getProjectMetrics).toHaveBeenCalledWith("Contoso", "hourly", undefined);
    });

    it("lists and authorizes pipeline resources", async () => {
      buildApi.getDefinitionResources.mockResolvedValue([{ type: "queue", id: "80", authorized: true }]);
      await handlerFor(PIPELINE_TOOLS.pipelines_list_definition_resources)(D);
      expect(buildApi.getDefinitionResources).toHaveBeenCalledWith("Contoso", 3);

      const resources = [{ type: "endpoint", id: "se-1", authorized: true }];
      buildApi.authorizeDefinitionResources.mockResolvedValue(resources);
      await handlerFor(PIPELINE_TOOLS.pipelines_authorize_definition_resources)({ ...D, resources });
      expect(buildApi.authorizeDefinitionResources).toHaveBeenCalledWith(resources, "Contoso", 3);
    });
  });

  describe("settings", () => {
    const P = { project: "Contoso" };

    it("reads retention settings and updates only the given values", async () => {
      buildApi.getRetentionSettings.mockResolvedValue({ purgeRuns: { value: 30 } });
      await handlerFor(PIPELINE_TOOLS.pipelines_get_retention_settings)(P);
      expect(buildApi.getRetentionSettings).toHaveBeenCalledWith("Contoso");

      buildApi.updateRetentionSettings.mockResolvedValue({});
      await handlerFor(PIPELINE_TOOLS.pipelines_update_retention_settings)({ ...P, runRetentionDays: 60, retainRunsPerProtectedBranch: 5 });
      expect(buildApi.updateRetentionSettings).toHaveBeenCalledWith(
        { runRetention: { value: 60 }, artifactsRetention: undefined, pullRequestRunRetention: undefined, retainRunsPerProtectedBranch: { value: 5 } },
        "Contoso"
      );
    });

    it("refuses a retention update with nothing in it", async () => {
      const result = await handlerFor(PIPELINE_TOOLS.pipelines_update_retention_settings)(P);

      expect(result.isError).toBe(true);
      expect(buildApi.updateRetentionSettings).not.toHaveBeenCalled();
    });

    it("reads and updates general settings", async () => {
      buildApi.getBuildGeneralSettings.mockResolvedValue({ enforceJobAuthScope: false });
      await handlerFor(PIPELINE_TOOLS.pipelines_get_general_settings)(P);
      expect(buildApi.getBuildGeneralSettings).toHaveBeenCalledWith("Contoso");

      buildApi.updateBuildGeneralSettings.mockResolvedValue({ enforceJobAuthScope: true });
      await handlerFor(PIPELINE_TOOLS.pipelines_update_general_settings)({ ...P, settings: { enforceJobAuthScope: true } });
      expect(buildApi.updateBuildGeneralSettings).toHaveBeenCalledWith({ enforceJobAuthScope: true }, "Contoso");
    });

    it("refuses a general settings update with nothing in it", async () => {
      const result = await handlerFor(PIPELINE_TOOLS.pipelines_update_general_settings)({ ...P, settings: {} });

      expect(result.isError).toBe(true);
      expect(buildApi.updateBuildGeneralSettings).not.toHaveBeenCalled();
    });
  });

  it.each([
    [PIPELINE_TOOLS.pipelines_delete_build, "deleteBuild", { buildId: 1 }, "deleting build 1"],
    [PIPELINE_TOOLS.pipelines_get_latest_build, "getLatestBuild", { definition: "x" }, "getting the latest build of 'x'"],
    [PIPELINE_TOOLS.pipelines_get_build_work_items, "getBuildWorkItemsRefs", { buildId: 1 }, "listing work items of build 1"],
    [PIPELINE_TOOLS.pipelines_get_changes_between_builds, "getChangesBetweenBuilds", { fromBuildId: 1, toBuildId: 2 }, "listing changes between builds 1 and 2"],
    [PIPELINE_TOOLS.pipelines_list_project_build_tags, "getTags", {}, "listing build tags"],
    [PIPELINE_TOOLS.pipelines_delete_build_definition, "deleteDefinition", { definitionId: 3 }, "deleting build definition 3"],
    [PIPELINE_TOOLS.pipelines_restore_build_definition, "restoreDefinition", { definitionId: 3 }, "restoring build definition 3"],
    [PIPELINE_TOOLS.pipelines_get_build_definition_yaml, "getDefinitionYaml", { definitionId: 3 }, "exporting build definition 3 as YAML"],
    [PIPELINE_TOOLS.pipelines_get_definition_tags, "getDefinitionTags", { definitionId: 3 }, "listing tags of build definition 3"],
    [PIPELINE_TOOLS.pipelines_add_definition_tags, "addDefinitionTags", { definitionId: 3, tags: ["a"] }, "tagging build definition 3"],
    [PIPELINE_TOOLS.pipelines_delete_definition_tag, "deleteDefinitionTag", { definitionId: 3, tag: "a" }, "removing tag 'a' from build definition 3"],
    [PIPELINE_TOOLS.pipelines_get_build_metrics, "getProjectMetrics", { aggregation: "daily" }, "getting build metrics"],
    [PIPELINE_TOOLS.pipelines_list_definition_resources, "getDefinitionResources", { definitionId: 3 }, "listing resources of build definition 3"],
    [
      PIPELINE_TOOLS.pipelines_authorize_definition_resources,
      "authorizeDefinitionResources",
      { definitionId: 3, resources: [{ type: "queue", id: "1", authorized: true }] },
      "authorizing resources for build definition 3",
    ],
    [PIPELINE_TOOLS.pipelines_get_retention_settings, "getRetentionSettings", {}, "getting retention settings"],
    [PIPELINE_TOOLS.pipelines_update_retention_settings, "updateRetentionSettings", { runRetentionDays: 30 }, "updating retention settings"],
    [PIPELINE_TOOLS.pipelines_get_general_settings, "getBuildGeneralSettings", {}, "getting pipeline general settings"],
    [PIPELINE_TOOLS.pipelines_update_general_settings, "updateBuildGeneralSettings", { settings: { a: true } }, "updating pipeline general settings"],
  ])("%s surfaces an API failure", async (tool, method, args, action) => {
    buildApi[method].mockRejectedValue(new Error("TF215106"));

    const result = await handlerFor(tool)({ project: "Contoso", ...args });

    expect(result).toEqual({ content: [{ type: "text", text: `Error ${action}: TF215106` }], isError: true });
  });
});

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Build definition writes, retention leases and pipeline folders. Kept apart
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
});

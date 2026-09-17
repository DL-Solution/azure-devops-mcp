// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Agent pools and queues, task group writes, deployment groups, scale set pools,
// environment resources and secure file upload. The original tools are covered
// by task-agent.test.ts.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { Readable } from "stream";

import { configureTaskAgentTools, TASKAGENT_TOOLS as T } from "../../../src/tools/task-agent";
import { createToolServer } from "../../mocks/tool-server";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

describe("task agent administration tools", () => {
  let server: McpServer;
  let elicitInput: jest.Mock;
  let api: Record<string, jest.Mock>;
  let mockFetch: jest.Mock;
  let connectionProvider: () => Promise<WebApi>;

  beforeEach(() => {
    delete process.env.ado_mcp_project;
    elicitInput = jest.fn();
    server = createToolServer({ server: { elicitInput } }) as unknown as McpServer;
    api = {
      uploadSecureFile: jest.fn(),
      getAgentPool: jest.fn(),
      addAgentPool: jest.fn(),
      updateAgentPool: jest.fn(),
      deleteAgentPool: jest.fn(),
      getAgentQueue: jest.fn(),
      addAgentQueue: jest.fn(),
      deleteAgentQueue: jest.fn(),
      updateAgent: jest.fn(),
      addTaskGroup: jest.fn(),
      updateTaskGroup: jest.fn(),
      getDeploymentGroups: jest.fn(),
      getDeploymentGroup: jest.fn(),
      addDeploymentGroup: jest.fn(),
      updateDeploymentGroup: jest.fn(),
      deleteDeploymentGroup: jest.fn(),
      getDeploymentTargets: jest.fn(),
      updateDeploymentTargets: jest.fn(),
      deleteDeploymentTarget: jest.fn(),
      getEnvironmentDeploymentExecutionRecords: jest.fn(),
      getKubernetesResource: jest.fn(),
      addKubernetesResource: jest.fn(),
      deleteKubernetesResource: jest.fn(),
    };
    connectionProvider = jest.fn().mockResolvedValue({
      serverUrl: "https://dev.azure.com/contoso",
      getTaskAgentApi: jest.fn().mockResolvedValue(api),
      getCoreApi: jest.fn().mockResolvedValue({ getProjects: jest.fn().mockResolvedValue([{ name: "Contoso" }]) }),
    } as unknown as WebApi) as () => Promise<WebApi>;
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  function handlerFor(toolName: string): Handler {
    configureTaskAgentTools(server, jest.fn(() => Promise.resolve("token")) as () => Promise<string>, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as Handler;
  }

  const parsed = (result: { content: { text: string }[] }) => JSON.parse(result.content[0].text);
  const respond = (body: string, status = 200) => mockFetch.mockResolvedValue({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });
  const P = { project: "Contoso" };

  it("uploads a secure file from base64 content", async () => {
    api.uploadSecureFile.mockResolvedValue({ id: "sf-1", name: "signing.pfx" });

    const result = await handlerFor(T.upload_secure_file)({ ...P, name: "signing.pfx", contentBase64: Buffer.from("secret").toString("base64"), authorizePipelines: true });

    const [headers, stream, project, name, authorize] = api.uploadSecureFile.mock.calls[0] as [Record<string, string>, Readable, string, string, boolean];
    expect(headers).toEqual({ "Content-Type": "application/octet-stream" });
    expect([project, name, authorize]).toEqual(["Contoso", "signing.pfx", true]);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("secret");
    expect(parsed(result)).toEqual({ id: "sf-1", name: "signing.pfx" });
  });

  describe("pools, queues and agents", () => {
    it("gets a pool, or reports it missing", async () => {
      api.getAgentPool.mockResolvedValue({ id: 1 });
      await handlerFor(T.get_agent_pool)({ poolId: 1 });
      expect(api.getAgentPool).toHaveBeenCalledWith(1);

      api.getAgentPool.mockResolvedValue(null);
      expect((await handlerFor(T.get_agent_pool)({ poolId: 9 })).content[0].text).toBe("Agent pool 9 not found");
    });

    it("creates, updates and deletes a pool", async () => {
      api.addAgentPool.mockResolvedValue({ id: 5 });
      await handlerFor(T.add_agent_pool)({ name: "linux", autoProvision: false, autoUpdate: true });
      expect(api.addAgentPool).toHaveBeenCalledWith({ name: "linux", autoProvision: false, autoUpdate: true });

      api.updateAgentPool.mockResolvedValue({ id: 5 });
      await handlerFor(T.update_agent_pool)({ poolId: 5, autoUpdate: false });
      expect(api.updateAgentPool).toHaveBeenCalledWith({ name: undefined, autoProvision: undefined, autoUpdate: false }, 5);

      api.deleteAgentPool.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(T.delete_agent_pool)({ poolId: 5 }))).toEqual({ deleted: 5 });
    });

    it("refuses a pool update with nothing to change", async () => {
      const result = await handlerFor(T.update_agent_pool)({ poolId: 5 });

      expect(result.isError).toBe(true);
      expect(api.updateAgentPool).not.toHaveBeenCalled();
    });

    it("gets, adds and removes a queue", async () => {
      api.getAgentQueue.mockResolvedValue({ id: 71 });
      await handlerFor(T.get_agent_queue)({ ...P, queueId: 71 });
      expect(api.getAgentQueue).toHaveBeenCalledWith(71, "Contoso");

      api.getAgentQueue.mockResolvedValue(null);
      expect((await handlerFor(T.get_agent_queue)({ ...P, queueId: 72 })).content[0].text).toBe("Agent queue 72 not found");

      api.addAgentQueue.mockResolvedValue({ id: 80 });
      await handlerFor(T.add_agent_queue)({ ...P, poolId: 5, authorizePipelines: true });
      expect(api.addAgentQueue).toHaveBeenCalledWith({ name: undefined, pool: { id: 5 } }, "Contoso", true);

      api.deleteAgentQueue.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(T.delete_agent_queue)({ ...P, queueId: 80 }))).toEqual({ deleted: 80 });
      expect(api.deleteAgentQueue).toHaveBeenCalledWith(80, "Contoso");
    });

    it("disables an agent", async () => {
      api.updateAgent.mockResolvedValue({ id: 7, enabled: false });

      await handlerFor(T.update_agent)({ poolId: 5, agentId: 7, enabled: false });

      expect(api.updateAgent).toHaveBeenCalledWith({ id: 7, enabled: false }, 5, 7);
    });
  });

  describe("task groups", () => {
    it("creates a task group", async () => {
      api.addTaskGroup.mockResolvedValue({ id: "tg" });
      const taskGroup = { name: "Build", category: "Build", tasks: [] };

      await handlerFor(T.add_task_group)({ ...P, taskGroup });

      expect(api.addTaskGroup).toHaveBeenCalledWith(taskGroup, "Contoso");
    });

    it("replaces a task group, pinning its id", async () => {
      api.updateTaskGroup.mockResolvedValue({ id: "tg" });

      await handlerFor(T.update_task_group)({ ...P, taskGroupId: "tg", taskGroup: { id: "other", name: "Build", revision: 3 } });

      expect(api.updateTaskGroup).toHaveBeenCalledWith({ id: "tg", name: "Build", revision: 3 }, "Contoso", "tg");
    });
  });

  describe("deployment groups", () => {
    it("lists, gets, creates, updates and deletes groups", async () => {
      api.getDeploymentGroups.mockResolvedValue(null);
      expect(parsed(await handlerFor(T.list_deployment_groups)({ ...P, name: "web", top: 5 }))).toEqual([]);
      expect(api.getDeploymentGroups).toHaveBeenCalledWith("Contoso", "web", undefined, undefined, undefined, 5);

      api.getDeploymentGroup.mockResolvedValue({ id: 3 });
      await handlerFor(T.get_deployment_group)({ ...P, deploymentGroupId: 3 });
      expect(api.getDeploymentGroup).toHaveBeenCalledWith("Contoso", 3);

      api.getDeploymentGroup.mockResolvedValue(null);
      expect((await handlerFor(T.get_deployment_group)({ ...P, deploymentGroupId: 4 })).content[0].text).toBe("Deployment group 4 not found");

      api.addDeploymentGroup.mockResolvedValue({ id: 3 });
      await handlerFor(T.add_deployment_group)({ ...P, name: "web", description: "front ends" });
      expect(api.addDeploymentGroup).toHaveBeenCalledWith({ name: "web", description: "front ends" }, "Contoso");

      api.updateDeploymentGroup.mockResolvedValue({ id: 3 });
      await handlerFor(T.update_deployment_group)({ ...P, deploymentGroupId: 3, name: "web-eu" });
      expect(api.updateDeploymentGroup).toHaveBeenCalledWith({ name: "web-eu", description: undefined }, "Contoso", 3);

      api.deleteDeploymentGroup.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(T.delete_deployment_group)({ ...P, deploymentGroupId: 3 }))).toEqual({ deleted: 3 });
    });

    it("refuses a group update with nothing to change", async () => {
      const result = await handlerFor(T.update_deployment_group)({ ...P, deploymentGroupId: 3 });

      expect(result.isError).toBe(true);
      expect(api.updateDeploymentGroup).not.toHaveBeenCalled();
    });

    it("lists targets by tag and partial name, retags and removes them", async () => {
      api.getDeploymentTargets.mockResolvedValue([{ id: 11 }]);
      await handlerFor(T.list_deployment_targets)({ ...P, deploymentGroupId: 3, tags: ["web"], name: "vm-", top: 10 });
      expect(api.getDeploymentTargets).toHaveBeenCalledWith("Contoso", 3, ["web"], "vm-", true, undefined, undefined, undefined, undefined, 10);

      api.getDeploymentTargets.mockResolvedValue(null);
      expect(parsed(await handlerFor(T.list_deployment_targets)({ ...P, deploymentGroupId: 3 }))).toEqual([]);
      expect(api.getDeploymentTargets).toHaveBeenLastCalledWith("Contoso", 3, undefined, undefined, false, undefined, undefined, undefined, undefined, undefined);

      api.updateDeploymentTargets.mockResolvedValue([]);
      await handlerFor(T.update_deployment_target_tags)({ ...P, deploymentGroupId: 3, targets: [{ id: 11, tags: ["web", "eu"] }] });
      expect(api.updateDeploymentTargets).toHaveBeenCalledWith([{ id: 11, tags: ["web", "eu"] }], "Contoso", 3);

      api.deleteDeploymentTarget.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(T.delete_deployment_target)({ ...P, deploymentGroupId: 3, targetId: 11 }))).toEqual({ deleted: 11, deploymentGroupId: 3 });
    });
  });

  describe("scale set pools", () => {
    it("lists and gets elastic pools over REST", async () => {
      respond('{"count":0,"value":[]}');
      const list = await handlerFor(T.list_elastic_pools)({});
      expect(mockFetch.mock.calls[0][0]).toBe("https://dev.azure.com/contoso/_apis/distributedtask/elasticpools?api-version=7.1");
      expect(list.content[0].text).toBe('{"count":0,"value":[]}');

      mockFetch.mockClear();
      respond('{"poolId":5}');
      await handlerFor(T.get_elastic_pool)({ poolId: 5 });
      expect(mockFetch.mock.calls[0][0]).toBe("https://dev.azure.com/contoso/_apis/distributedtask/elasticpools/5?api-version=7.1");
    });

    it("updates only the given elastic pool settings", async () => {
      respond('{"poolId":5}');

      await handlerFor(T.update_elastic_pool)({ poolId: 5, maxCapacity: 10, recycleAfterEachUse: true });

      const [url, init] = mockFetch.mock.calls[0] as [string, { method: string; body: string }];
      expect(url).toBe("https://dev.azure.com/contoso/_apis/distributedtask/elasticpools/5?api-version=7.1");
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(init.body)).toEqual({ maxCapacity: 10, recycleAfterEachUse: true });
    });

    it("refuses an elastic pool update with nothing to change", async () => {
      const result = await handlerFor(T.update_elastic_pool)({ poolId: 5 });

      expect(result.isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("lists nodes and reads logs", async () => {
      respond("[]");
      await handlerFor(T.list_elastic_pool_nodes)({ poolId: 5 });
      expect(mockFetch.mock.calls[0][0]).toBe("https://dev.azure.com/contoso/_apis/distributedtask/elasticpools/5/nodes?api-version=7.1");

      mockFetch.mockClear();
      respond("", 200);
      const logs = await handlerFor(T.get_elastic_pool_logs)({ poolId: 5 });
      expect(mockFetch.mock.calls[0][0]).toBe("https://dev.azure.com/contoso/_apis/distributedtask/elasticpools/5/logs?api-version=7.1");
      expect(logs.content[0].text).toBe("Done.");
    });

    it("surfaces a REST failure", async () => {
      respond('{"message":"Elastic pool not found"}', 404);

      const result = await handlerFor(T.get_elastic_pool)({ poolId: 1 });

      expect(result).toEqual({ content: [{ type: "text", text: 'Error getting elastic pool 1: 404: {"message":"Elastic pool not found"}' }], isError: true });
    });
  });

  describe("environments", () => {
    it("lists deployments of an environment", async () => {
      api.getEnvironmentDeploymentExecutionRecords.mockResolvedValue(null);

      expect(parsed(await handlerFor(T.list_environment_deployments)({ ...P, environmentId: 2, top: 5, continuationToken: "t" }))).toEqual([]);
      expect(api.getEnvironmentDeploymentExecutionRecords).toHaveBeenCalledWith("Contoso", 2, "t", 5);
    });

    it("lists and removes virtual machine resources over REST", async () => {
      respond('{"count":0}');
      await handlerFor(T.list_environment_virtual_machines)({ project: "My Project", environmentId: 2 });
      expect(mockFetch.mock.calls[0][0]).toBe("https://dev.azure.com/contoso/My%20Project/_apis/pipelines/environments/2/providers/virtualmachines?api-version=7.1");

      mockFetch.mockClear();
      respond("", 204);
      await handlerFor(T.delete_environment_virtual_machine)({ ...P, environmentId: 2, resourceId: 9 });
      const [url, init] = mockFetch.mock.calls[0] as [string, { method: string }];
      expect(url).toBe("https://dev.azure.com/contoso/Contoso/_apis/pipelines/environments/2/providers/virtualmachines/9?api-version=7.1");
      expect(init.method).toBe("DELETE");
    });

    it.each([T.list_environment_virtual_machines, T.delete_environment_virtual_machine])("%s stops when the project selection is cancelled", async (tool) => {
      elicitInput.mockResolvedValue({ action: "cancel" });

      const result = await handlerFor(tool)({ environmentId: 2, resourceId: 9 });

      expect(result.content[0].text).toBe("Project selection cancelled.");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("gets, adds and removes a Kubernetes resource", async () => {
      api.getKubernetesResource.mockResolvedValue({ id: 4, namespace: "web" });
      await handlerFor(T.get_kubernetes_resource)({ ...P, environmentId: 2, resourceId: 4 });
      expect(api.getKubernetesResource).toHaveBeenCalledWith("Contoso", 2, 4);

      api.getKubernetesResource.mockResolvedValue(null);
      expect((await handlerFor(T.get_kubernetes_resource)({ ...P, environmentId: 2, resourceId: 5 })).content[0].text).toBe("Kubernetes resource 5 not found in environment 2");

      api.addKubernetesResource.mockResolvedValue({ id: 6 });
      await handlerFor(T.add_kubernetes_resource)({ ...P, environmentId: 2, name: "web", namespace: "web", clusterName: "aks-eu", serviceEndpointId: "se-1", tags: ["eu"] });
      expect(api.addKubernetesResource).toHaveBeenCalledWith({ name: "web", namespace: "web", clusterName: "aks-eu", serviceEndpointId: "se-1", tags: ["eu"] }, "Contoso", 2);

      api.deleteKubernetesResource.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(T.delete_kubernetes_resource)({ ...P, environmentId: 2, resourceId: 6 }))).toEqual({ deleted: 6, environmentId: 2 });
    });
  });

  // Every project-scoped tool asks for the project when none is given and stops if the user cancels.
  it.each([
    [T.upload_secure_file, { name: "f", contentBase64: "" }],
    [T.get_agent_queue, { queueId: 1 }],
    [T.add_agent_queue, { poolId: 1 }],
    [T.delete_agent_queue, { queueId: 1 }],
    [T.add_task_group, { taskGroup: {} }],
    [T.update_task_group, { taskGroupId: "t", taskGroup: {} }],
    [T.list_deployment_groups, {}],
    [T.get_deployment_group, { deploymentGroupId: 1 }],
    [T.add_deployment_group, { name: "g" }],
    [T.update_deployment_group, { deploymentGroupId: 1, name: "g" }],
    [T.delete_deployment_group, { deploymentGroupId: 1 }],
    [T.list_deployment_targets, { deploymentGroupId: 1 }],
    [T.update_deployment_target_tags, { deploymentGroupId: 1, targets: [] }],
    [T.delete_deployment_target, { deploymentGroupId: 1, targetId: 1 }],
    [T.list_environment_deployments, { environmentId: 1 }],
    [T.get_kubernetes_resource, { environmentId: 1, resourceId: 1 }],
    [T.add_kubernetes_resource, { environmentId: 1, name: "n", namespace: "n", serviceEndpointId: "s" }],
    [T.delete_kubernetes_resource, { environmentId: 1, resourceId: 1 }],
  ])("%s stops when the project selection is cancelled", async (tool, args) => {
    elicitInput.mockResolvedValue({ action: "decline" });

    const result = await handlerFor(tool)(args);

    expect(result.content[0].text).toBe("Project selection cancelled.");
    for (const method of Object.values(api)) expect(method).not.toHaveBeenCalled();
  });

  it.each([
    [T.upload_secure_file, "uploadSecureFile", { ...P, name: "f", contentBase64: "" }, "uploading secure file 'f'"],
    [T.get_agent_pool, "getAgentPool", { poolId: 1 }, "getting agent pool 1"],
    [T.add_agent_pool, "addAgentPool", { name: "p" }, "creating agent pool 'p'"],
    [T.update_agent_pool, "updateAgentPool", { poolId: 1, name: "p" }, "updating agent pool 1"],
    [T.delete_agent_pool, "deleteAgentPool", { poolId: 1 }, "deleting agent pool 1"],
    [T.get_agent_queue, "getAgentQueue", { ...P, queueId: 1 }, "getting agent queue 1"],
    [T.add_agent_queue, "addAgentQueue", { ...P, poolId: 1 }, "adding a queue for agent pool 1"],
    [T.delete_agent_queue, "deleteAgentQueue", { ...P, queueId: 1 }, "removing agent queue 1"],
    [T.update_agent, "updateAgent", { poolId: 1, agentId: 2, enabled: true }, "updating agent 2"],
    [T.add_task_group, "addTaskGroup", { ...P, taskGroup: {} }, "creating task group"],
    [T.update_task_group, "updateTaskGroup", { ...P, taskGroupId: "t", taskGroup: {} }, "updating task group t"],
    [T.list_deployment_groups, "getDeploymentGroups", P, "listing deployment groups"],
    [T.get_deployment_group, "getDeploymentGroup", { ...P, deploymentGroupId: 1 }, "getting deployment group 1"],
    [T.add_deployment_group, "addDeploymentGroup", { ...P, name: "g" }, "creating deployment group 'g'"],
    [T.update_deployment_group, "updateDeploymentGroup", { ...P, deploymentGroupId: 1, name: "g" }, "updating deployment group 1"],
    [T.delete_deployment_group, "deleteDeploymentGroup", { ...P, deploymentGroupId: 1 }, "deleting deployment group 1"],
    [T.list_deployment_targets, "getDeploymentTargets", { ...P, deploymentGroupId: 1 }, "listing targets of deployment group 1"],
    [T.update_deployment_target_tags, "updateDeploymentTargets", { ...P, deploymentGroupId: 1, targets: [] }, "updating tags in deployment group 1"],
    [T.delete_deployment_target, "deleteDeploymentTarget", { ...P, deploymentGroupId: 1, targetId: 2 }, "removing target 2"],
    [T.list_environment_deployments, "getEnvironmentDeploymentExecutionRecords", { ...P, environmentId: 1 }, "listing deployments of environment 1"],
    [T.get_kubernetes_resource, "getKubernetesResource", { ...P, environmentId: 1, resourceId: 2 }, "getting Kubernetes resource 2"],
    [T.add_kubernetes_resource, "addKubernetesResource", { ...P, environmentId: 1, name: "n", namespace: "n", serviceEndpointId: "s" }, "adding Kubernetes resource 'n'"],
    [T.delete_kubernetes_resource, "deleteKubernetesResource", { ...P, environmentId: 1, resourceId: 2 }, "removing Kubernetes resource 2"],
  ])("%s surfaces an API failure", async (tool, method, args, action) => {
    api[method].mockRejectedValue(new Error("TF400813"));

    const result = await handlerFor(tool)(args);

    expect(result).toEqual({ content: [{ type: "text", text: `Error ${action}: TF400813` }], isError: true });
  });
});

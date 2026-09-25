// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import {
  VariableGroupParameters,
  VariableGroupProjectReference,
  EnvironmentCreateParameter,
  EnvironmentUpdateParameter,
  TaskGroupCreateParameter,
  TaskGroupUpdateParameter,
  KubernetesResourceCreateParametersExistingEndpoint,
} from "azure-devops-node-api/interfaces/TaskAgentInterfaces.js";
import { resolveProject } from "../shared/elicitations.js";
import { optionalProject, continuationTokenParam } from "../shared/common-params.js";
import { adoFetch } from "../shared/ado-rest.js";
import { jsonResult, toolError } from "../shared/tool-results.js";
import { Readable } from "stream";

const TASKAGENT_TOOLS = {
  list_variable_groups: "taskagent_list_variable_groups",
  get_variable_group: "taskagent_get_variable_group",
  add_variable_group: "taskagent_add_variable_group",
  update_variable_group: "taskagent_update_variable_group",
  delete_variable_group: "taskagent_delete_variable_group",
  share_variable_group: "taskagent_share_variable_group",
  list_agent_pools: "taskagent_list_agent_pools",
  list_agent_queues: "taskagent_list_agent_queues",
  list_environments: "taskagent_list_environments",
  get_environment: "taskagent_get_environment",
  add_environment: "taskagent_add_environment",
  update_environment: "taskagent_update_environment",
  delete_environment: "taskagent_delete_environment",
  list_agents: "taskagent_list_agents",
  get_agent: "taskagent_get_agent",
  delete_agent: "taskagent_delete_agent",
  list_agent_requests: "taskagent_list_agent_requests",
  list_task_groups: "taskagent_list_task_groups",
  get_task_group: "taskagent_get_task_group",
  delete_task_group: "taskagent_delete_task_group",
  undelete_task_group: "taskagent_undelete_task_group",
  list_secure_files: "taskagent_list_secure_files",
  get_secure_file: "taskagent_get_secure_file",
  update_secure_file: "taskagent_update_secure_file",
  delete_secure_file: "taskagent_delete_secure_file",
  upload_secure_file: "taskagent_upload_secure_file",
  get_agent_pool: "taskagent_get_agent_pool",
  add_agent_pool: "taskagent_add_agent_pool",
  update_agent_pool: "taskagent_update_agent_pool",
  delete_agent_pool: "taskagent_delete_agent_pool",
  get_agent_queue: "taskagent_get_agent_queue",
  add_agent_queue: "taskagent_add_agent_queue",
  delete_agent_queue: "taskagent_delete_agent_queue",
  update_agent: "taskagent_update_agent",
  add_task_group: "taskagent_add_task_group",
  update_task_group: "taskagent_update_task_group",
  list_deployment_groups: "taskagent_list_deployment_groups",
  get_deployment_group: "taskagent_get_deployment_group",
  add_deployment_group: "taskagent_add_deployment_group",
  update_deployment_group: "taskagent_update_deployment_group",
  delete_deployment_group: "taskagent_delete_deployment_group",
  list_deployment_targets: "taskagent_list_deployment_targets",
  update_deployment_target_tags: "taskagent_update_deployment_target_tags",
  delete_deployment_target: "taskagent_delete_deployment_target",
  list_elastic_pools: "taskagent_list_elastic_pools",
  get_elastic_pool: "taskagent_get_elastic_pool",
  update_elastic_pool: "taskagent_update_elastic_pool",
  list_elastic_pool_nodes: "taskagent_list_elastic_pool_nodes",
  get_elastic_pool_logs: "taskagent_get_elastic_pool_logs",
  list_environment_deployments: "taskagent_list_environment_deployments",
  list_environment_virtual_machines: "taskagent_list_environment_virtual_machines",
  delete_environment_virtual_machine: "taskagent_delete_environment_virtual_machine",
  get_kubernetes_resource: "taskagent_get_kubernetes_resource",
  add_kubernetes_resource: "taskagent_add_kubernetes_resource",
  delete_kubernetes_resource: "taskagent_delete_kubernetes_resource",
};

/**
 * Azure DevOps ignores a variable group's top-level `description`: the one it
 * stores and shows lives on each project reference. So a top-level description
 * is copied into every reference that does not set its own.
 */
function withProjectReferenceDescriptions(variableGroup: Record<string, unknown>): Record<string, unknown> {
  const { description, variableGroupProjectReferences: references } = variableGroup;
  if (typeof description !== "string" || !description || !Array.isArray(references)) {
    return variableGroup;
  }
  return {
    ...variableGroup,
    variableGroupProjectReferences: references.map((reference) =>
      reference && typeof reference === "object" && !(reference as { description?: unknown }).description ? { ...reference, description } : reference
    ),
  };
}

function configureTaskAgentTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string = () => "") {
  const projectField = optionalProject;

  registerTool(
    server,
    TASKAGENT_TOOLS.list_variable_groups,
    "List the variable groups in a project. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      groupName: z.string().optional().describe("Optional name filter (supports wildcards) for the variable groups."),
      top: z.coerce.number().optional().describe("Optional maximum number of variable groups to return."),
    },
    async ({ project, groupName, top }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const groups = await taskAgentApi.getVariableGroups(ctx.project, groupName, undefined, top);

        if (!groups || groups.length === 0) {
          return { content: [{ type: "text", text: "No variable groups found" }], isError: true };
        }
        return jsonResult(groups);
      } catch (error) {
        return toolError("fetching variable groups", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.get_variable_group,
    "Get a specific variable group by ID. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      groupId: z.number().describe("The ID of the variable group."),
    },
    async ({ project, groupId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const group = await taskAgentApi.getVariableGroup(ctx.project, groupId);

        return jsonResult(group);
      } catch (error) {
        return toolError("fetching variable group", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.add_variable_group,
    "Create a new variable group. The parameters must include 'variableGroupProjectReferences' specifying the target project(s). The stored description is per project reference; a top-level description fills references that lack one.",
    {
      variableGroup: z
        .record(z.unknown())
        .describe(
          "The variable group parameters (e.g. { name, description, type: 'Vsts', variables: { KEY: { value, isSecret } }, variableGroupProjectReferences: [{ name, projectReference: { name } }] })."
        ),
    },
    async ({ variableGroup }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        const result = await taskAgentApi.addVariableGroup(withProjectReferenceDescriptions(variableGroup) as unknown as VariableGroupParameters);

        return jsonResult(result);
      } catch (error) {
        return toolError("creating variable group", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.update_variable_group,
    "Update an existing variable group. Obtain the current group via taskagent_get_variable_group, build the parameters, and pass them back. The stored description is per project reference; a top-level description fills references that lack one.",
    {
      groupId: z.number().describe("The ID of the variable group to update."),
      variableGroup: z.record(z.unknown()).describe("The full variable group parameters (name, description, type, variables, variableGroupProjectReferences)."),
    },
    async ({ groupId, variableGroup }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        const result = await taskAgentApi.updateVariableGroup(withProjectReferenceDescriptions(variableGroup) as unknown as VariableGroupParameters, groupId);

        return jsonResult(result);
      } catch (error) {
        return toolError("updating variable group", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.delete_variable_group,
    "Delete a variable group from the specified project(s).",
    {
      groupId: z.number().describe("The ID of the variable group to delete."),
      projectIds: z.array(z.string()).describe("The IDs of the projects to delete the variable group from."),
    },
    async ({ groupId, projectIds }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        await taskAgentApi.deleteVariableGroup(groupId, projectIds);

        return { content: [{ type: "text", text: `Variable group ${groupId} deleted` }] };
      } catch (error) {
        return toolError("deleting variable group", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.share_variable_group,
    "Share a variable group with additional projects.",
    {
      variableGroupId: z.number().describe("The ID of the variable group to share."),
      projectReferences: z.array(z.record(z.unknown())).describe("The project references to share the variable group with (e.g. [{ name, projectReference: { name } }])."),
    },
    async ({ variableGroupId, projectReferences }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        await taskAgentApi.shareVariableGroup(projectReferences as unknown as VariableGroupProjectReference[], variableGroupId);

        return { content: [{ type: "text", text: `Variable group ${variableGroupId} shared` }] };
      } catch (error) {
        return toolError("sharing variable group", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.list_agent_pools,
    "List the agent pools in the organization, optionally filtered by name.",
    {
      poolName: z.string().optional().describe("Optional name filter for the agent pools."),
    },
    async ({ poolName }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        const pools = await taskAgentApi.getAgentPools(poolName);

        if (!pools || pools.length === 0) {
          return { content: [{ type: "text", text: "No agent pools found" }], isError: true };
        }
        return jsonResult(pools);
      } catch (error) {
        return toolError("fetching agent pools", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.list_agent_queues,
    "List the agent queues in a project, optionally filtered by name. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      queueName: z.string().optional().describe("Optional name filter for the agent queues."),
    },
    async ({ project, queueName }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const queues = await taskAgentApi.getAgentQueues(ctx.project, queueName);

        if (!queues || queues.length === 0) {
          return { content: [{ type: "text", text: "No agent queues found" }], isError: true };
        }
        return jsonResult(queues);
      } catch (error) {
        return toolError("fetching agent queues", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.list_environments,
    "List the environments (deployment targets) in a project. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      name: z.string().optional().describe("Optional name filter for the environments."),
      top: z.coerce.number().optional().describe("Optional maximum number of environments to return."),
    },
    async ({ project, name, top }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const environments = await taskAgentApi.getEnvironments(ctx.project, name, undefined, top);

        if (!environments || environments.length === 0) {
          return { content: [{ type: "text", text: "No environments found" }], isError: true };
        }
        return jsonResult(environments);
      } catch (error) {
        return toolError("fetching environments", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.get_environment,
    "Get a specific environment by ID. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      environmentId: z.number().describe("The ID of the environment."),
    },
    async ({ project, environmentId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const environment = await taskAgentApi.getEnvironmentById(ctx.project, environmentId);

        return jsonResult(environment);
      } catch (error) {
        return toolError("fetching environment", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.add_environment,
    "Create a new environment (deployment target) in a project. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      name: z.string().describe("The name of the environment."),
      description: z.string().optional().describe("An optional description of the environment."),
    },
    async ({ project, name, description }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const parameter: EnvironmentCreateParameter = { name, description };
        const taskAgentApi = await connection.getTaskAgentApi();
        const environment = await taskAgentApi.addEnvironment(parameter, ctx.project);

        return jsonResult(environment);
      } catch (error) {
        return toolError("creating environment", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.update_environment,
    "Update an existing environment's name or description. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      environmentId: z.number().describe("The ID of the environment to update."),
      name: z.string().optional().describe("The new name of the environment."),
      description: z.string().optional().describe("The new description of the environment."),
    },
    async ({ project, environmentId, name, description }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const parameter: EnvironmentUpdateParameter = { name, description };
        const taskAgentApi = await connection.getTaskAgentApi();
        const environment = await taskAgentApi.updateEnvironment(parameter, ctx.project, environmentId);

        return jsonResult(environment);
      } catch (error) {
        return toolError("updating environment", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.delete_environment,
    "Delete an environment by ID. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      environmentId: z.number().describe("The ID of the environment to delete."),
    },
    async ({ project, environmentId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        await taskAgentApi.deleteEnvironment(ctx.project, environmentId);

        return { content: [{ type: "text", text: `Environment ${environmentId} deleted` }] };
      } catch (error) {
        return toolError("deleting environment", error);
      }
    }
  );

  // ---- Agents in a pool (organization-scoped, so no project) ----

  registerTool(
    server,
    TASKAGENT_TOOLS.list_agents,
    "List the agents registered in an agent pool, with their status and version. Use taskagent_list_agent_pools to find the pool id.",
    {
      poolId: z.number().describe("The ID of the agent pool."),
      agentName: z.string().optional().describe("Return only the agent with this name."),
      includeCapabilities: z.boolean().default(false).describe("Include the agent's system and user capabilities. Verbose — ask for it only when matching demands."),
      includeAssignedRequest: z.boolean().default(false).describe("Include the job each agent is running right now."),
    },
    async ({ poolId, agentName, includeCapabilities, includeAssignedRequest }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        const agents = await taskAgentApi.getAgents(poolId, agentName, includeCapabilities, includeAssignedRequest);
        return jsonResult(agents);
      } catch (error) {
        return toolError(`listing agents in pool ${poolId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.get_agent,
    "Get one agent in a pool.",
    {
      poolId: z.number().describe("The ID of the agent pool."),
      agentId: z.number().describe("The ID of the agent."),
      includeCapabilities: z.boolean().default(false).describe("Include the agent's system and user capabilities."),
      includeAssignedRequest: z.boolean().default(false).describe("Include the job the agent is running right now."),
      includeLastCompletedRequest: z.boolean().default(false).describe("Include the last job the agent finished."),
    },
    async ({ poolId, agentId, includeCapabilities, includeAssignedRequest, includeLastCompletedRequest }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        const agent = await taskAgentApi.getAgent(poolId, agentId, includeCapabilities, includeAssignedRequest, includeLastCompletedRequest);
        return jsonResult(agent);
      } catch (error) {
        return toolError(`getting agent ${agentId} in pool ${poolId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.delete_agent,
    "Remove an agent from a pool. The machine keeps running; it just stops being offered jobs until it re-registers.",
    {
      poolId: z.number().describe("The ID of the agent pool."),
      agentId: z.number().describe("The ID of the agent to remove."),
    },
    async ({ poolId, agentId }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        await taskAgentApi.deleteAgent(poolId, agentId);
        return jsonResult({ removed: agentId, poolId });
      } catch (error) {
        return toolError(`removing agent ${agentId} from pool ${poolId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.list_agent_requests,
    "List the job requests an agent has served — what it is running now and what it ran before. Use this to see why an agent looks busy or idle.",
    {
      poolId: z.number().describe("The ID of the agent pool."),
      agentId: z.number().describe("The ID of the agent."),
      completedRequestCount: z.number().optional().describe("How many finished jobs to include alongside the in-flight one."),
    },
    async ({ poolId, agentId, completedRequestCount }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        const requests = await taskAgentApi.getAgentRequestsForAgent(poolId, agentId, completedRequestCount);
        return jsonResult(requests);
      } catch (error) {
        return toolError(`listing job requests for agent ${agentId}`, error);
      }
    }
  );

  // ---- Task groups ----

  registerTool(
    server,
    TASKAGENT_TOOLS.list_task_groups,
    "List the task groups of a project — the reusable sequences of pipeline steps. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      expanded: z.boolean().default(false).describe("Include the tasks inside each group. Verbose; omit when you only need names and ids."),
      deleted: z.boolean().default(false).describe("List the deleted task groups in the recycle bin instead of the live ones."),
      top: z.number().optional().describe("Maximum number of task groups to return."),
    },
    async ({ project, expanded, deleted, top }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const groups = await taskAgentApi.getTaskGroups(ctx.project, undefined, expanded, undefined, deleted, top);
        return jsonResult(groups);
      } catch (error) {
        return toolError("listing task groups", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.get_task_group,
    "Get one task group, including the tasks it runs. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      taskGroupId: z.string().describe("The GUID of the task group."),
      versionSpec: z.string().optional().describe("Which version to read, e.g. '1' or '1.*'. Omit for the latest."),
    },
    async ({ project, taskGroupId, versionSpec }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        // The typed client requires a version spec; "*" means the latest.
        const group = await taskAgentApi.getTaskGroup(ctx.project, taskGroupId, versionSpec ?? "*");
        return jsonResult(group);
      } catch (error) {
        return toolError(`getting task group ${taskGroupId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.delete_task_group,
    "Delete a task group. Every pipeline that still references it will fail to run until it is restored with taskagent_undelete_task_group or the reference is removed.",
    {
      project: projectField,
      taskGroupId: z.string().describe("The GUID of the task group to delete."),
      comment: z.string().optional().describe("Reason recorded against the deletion."),
    },
    async ({ project, taskGroupId, comment }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        await taskAgentApi.deleteTaskGroup(ctx.project, taskGroupId, comment);
        return jsonResult({ deleted: taskGroupId, note: "Recoverable with taskagent_undelete_task_group." });
      } catch (error) {
        return toolError(`deleting task group ${taskGroupId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.undelete_task_group,
    "Restore a deleted task group from the recycle bin. List candidates with taskagent_list_task_groups and deleted=true.",
    {
      project: projectField,
      taskGroupId: z.string().describe("The GUID of the deleted task group to restore."),
    },
    async ({ project, taskGroupId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const restored = await taskAgentApi.undeleteTaskGroup({ id: taskGroupId }, ctx.project);
        return jsonResult(restored);
      } catch (error) {
        return toolError(`restoring task group ${taskGroupId}`, error);
      }
    }
  );

  // ---- Secure files ----
  //
  // Metadata only. The API can also hand out a download ticket and the file
  // content, but secure files are certificates, signing keys and keystores:
  // putting their bytes into the model's context would turn any prompt
  // injection into a key exfiltration. includeDownloadTickets stays false.

  registerTool(
    server,
    TASKAGENT_TOOLS.list_secure_files,
    "List the secure files of a project — their names, ids and properties. File contents are never returned: these are certificates and keys, so only metadata is exposed.",
    {
      project: projectField,
      namePattern: z.string().optional().describe("Return only files whose name matches this pattern."),
    },
    async ({ project, namePattern }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const files = await taskAgentApi.getSecureFiles(ctx.project, namePattern, false);
        return jsonResult(files);
      } catch (error) {
        return toolError("listing secure files", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.get_secure_file,
    "Get one secure file's metadata. The file content is never returned.",
    {
      project: projectField,
      secureFileId: z.string().describe("The GUID of the secure file."),
    },
    async ({ project, secureFileId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const file = await taskAgentApi.getSecureFile(ctx.project, secureFileId, false);
        return jsonResult(file);
      } catch (error) {
        return toolError(`getting secure file ${secureFileId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.update_secure_file,
    "Rename a secure file. The stored content is not touched.",
    {
      project: projectField,
      secureFileId: z.string().describe("The GUID of the secure file."),
      name: z.string().describe("The new name for the file."),
    },
    async ({ project, secureFileId, name }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const updated = await taskAgentApi.updateSecureFile({ id: secureFileId, name }, ctx.project, secureFileId);
        return jsonResult(updated);
      } catch (error) {
        return toolError(`renaming secure file ${secureFileId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.delete_secure_file,
    "Delete a secure file permanently. There is no recycle bin for these, and any pipeline that consumes the file starts failing.",
    {
      project: projectField,
      secureFileId: z.string().describe("The GUID of the secure file to delete."),
    },
    async ({ project, secureFileId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        await taskAgentApi.deleteSecureFile(ctx.project, secureFileId);
        return jsonResult({ deleted: secureFileId, note: "Permanent — secure files have no recycle bin." });
      } catch (error) {
        return toolError(`deleting secure file ${secureFileId}`, error);
      }
    }
  );

  // The typed client lacks elastic pools and environment virtual machine resources; these go through REST.
  async function rest(action: string, method: string, path: string, body?: unknown) {
    try {
      const connection = await connectionProvider();
      const response = await adoFetch({ url: `${connection.serverUrl}/${path}`, method, token: await tokenProvider(), userAgent: userAgentProvider(), body });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status}: ${text}`);
      }
      return { content: [{ type: "text" as const, text: text || "Done." }] };
    } catch (error) {
      return toolError(action, error);
    }
  }

  // ---- Secure files ----

  registerTool(
    server,
    TASKAGENT_TOOLS.upload_secure_file,
    "Upload a secure file — a certificate, provisioning profile, keystore or SSH key that pipelines download with the DownloadSecureFile task. The content is stored encrypted and can never be read back through the API.",
    {
      project: projectField,
      name: z.string().describe("The file name, e.g. 'signing.pfx'. Must be unique in the project."),
      contentBase64: z.string().describe("The file content, base64-encoded."),
      authorizePipelines: z.boolean().default(false).describe("Let every pipeline in the project use the file without asking for permission."),
    },
    async ({ project, name, contentBase64, authorizePipelines }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const content = Readable.from([Buffer.from(contentBase64, "base64")]);
        const file = await taskAgentApi.uploadSecureFile({ "Content-Type": "application/octet-stream" }, content, ctx.project, name, authorizePipelines);
        return jsonResult(file);
      } catch (error) {
        return toolError(`uploading secure file '${name}'`, error);
      }
    }
  );

  // ---- Agent pools and queues ----

  const poolIdParam = z.coerce.number().min(1).describe("The ID of the agent pool, as taskagent_list_agent_pools returns it.");

  registerTool(
    server,
    TASKAGENT_TOOLS.get_agent_pool,
    "Get one agent pool: whether it is hosted, its size, auto-provisioning and auto-update settings, and who created it.",
    { poolId: poolIdParam },
    async ({ poolId }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        const pool = await taskAgentApi.getAgentPool(poolId);
        if (!pool) {
          return { content: [{ type: "text", text: `Agent pool ${poolId} not found` }], isError: true };
        }
        return jsonResult(pool);
      } catch (error) {
        return toolError(`getting agent pool ${poolId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.add_agent_pool,
    "Create a self-hosted agent pool in the organization. With autoProvision it is added as a queue to every project; otherwise connect projects with taskagent_add_agent_queue.",
    {
      name: z.string().describe("The pool name."),
      autoProvision: z.boolean().default(false).describe("Make the pool available to every project."),
      autoUpdate: z.boolean().default(true).describe("Keep the agents in the pool on the latest version automatically."),
    },
    async ({ name, autoProvision, autoUpdate }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        return jsonResult(await taskAgentApi.addAgentPool({ name, autoProvision, autoUpdate }));
      } catch (error) {
        return toolError(`creating agent pool '${name}'`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.update_agent_pool,
    "Rename an agent pool or change its auto-provisioning and auto-update settings. Only the values you pass change.",
    {
      poolId: poolIdParam,
      name: z.string().optional().describe("New pool name."),
      autoProvision: z.boolean().optional().describe("Make the pool available to every project."),
      autoUpdate: z.boolean().optional().describe("Keep the agents on the latest version automatically."),
    },
    async ({ poolId, name, autoProvision, autoUpdate }) => {
      if (name === undefined && autoProvision === undefined && autoUpdate === undefined) {
        return { content: [{ type: "text", text: "Nothing to update: give name, autoProvision or autoUpdate." }], isError: true };
      }
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        return jsonResult(await taskAgentApi.updateAgentPool({ name, autoProvision, autoUpdate }, poolId));
      } catch (error) {
        return toolError(`updating agent pool ${poolId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.delete_agent_pool,
    "Delete an agent pool from the organization, with its queues in every project. Its agents are unregistered and pipelines that target the pool fail to find agents.",
    { poolId: poolIdParam },
    async ({ poolId }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        await taskAgentApi.deleteAgentPool(poolId);
        return jsonResult({ deleted: poolId });
      } catch (error) {
        return toolError(`deleting agent pool ${poolId}`, error);
      }
    }
  );

  const queueIdParam = z.coerce.number().min(1).describe("The ID of the agent queue, as taskagent_list_agent_queues returns it.");

  registerTool(server, TASKAGENT_TOOLS.get_agent_queue, "Get one agent queue of a project and the pool behind it.", { project: projectField, queueId: queueIdParam }, async ({ project, queueId }) => {
    try {
      const connection = await connectionProvider();
      const ctx = await resolveProject(server, connection, project);
      if ("response" in ctx) return ctx.response;

      const taskAgentApi = await connection.getTaskAgentApi();
      const queue = await taskAgentApi.getAgentQueue(queueId, ctx.project);
      if (!queue) {
        return { content: [{ type: "text", text: `Agent queue ${queueId} not found` }], isError: true };
      }
      return jsonResult(queue);
    } catch (error) {
      return toolError(`getting agent queue ${queueId}`, error);
    }
  });

  registerTool(
    server,
    TASKAGENT_TOOLS.add_agent_queue,
    "Connect an agent pool to a project by adding a queue for it, so the project's pipelines can target the pool.",
    {
      project: projectField,
      poolId: poolIdParam,
      name: z.string().optional().describe("Queue name. Omit to use the pool's name."),
      authorizePipelines: z.boolean().default(false).describe("Let every pipeline in the project use the queue without asking for permission."),
    },
    async ({ project, poolId, name, authorizePipelines }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        return jsonResult(await taskAgentApi.addAgentQueue({ name, pool: { id: poolId } }, ctx.project, authorizePipelines));
      } catch (error) {
        return toolError(`adding a queue for agent pool ${poolId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.delete_agent_queue,
    "Disconnect an agent pool from a project by removing its queue. The pool and its agents stay; the project's pipelines can no longer target it.",
    { project: projectField, queueId: queueIdParam },
    async ({ project, queueId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        await taskAgentApi.deleteAgentQueue(queueId, ctx.project);
        return jsonResult({ deleted: queueId });
      } catch (error) {
        return toolError(`removing agent queue ${queueId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.update_agent,
    "Enable or disable an agent. A disabled agent finishes its current job and then takes no new ones — use it to drain a machine before maintenance.",
    {
      poolId: poolIdParam,
      agentId: z.coerce.number().min(1).describe("The ID of the agent, as taskagent_list_agents returns it."),
      enabled: z.boolean().describe("true to let the agent take jobs, false to stop it."),
    },
    async ({ poolId, agentId, enabled }) => {
      try {
        const connection = await connectionProvider();
        const taskAgentApi = await connection.getTaskAgentApi();
        return jsonResult(await taskAgentApi.updateAgent({ id: agentId, enabled }, poolId, agentId));
      } catch (error) {
        return toolError(`updating agent ${agentId}`, error);
      }
    }
  );

  // ---- Task groups ----

  registerTool(
    server,
    TASKAGENT_TOOLS.add_task_group,
    "Create a task group — a reusable sequence of steps for classic pipelines — from a complete definition (name, category, tasks, inputs). Copying an existing one with taskagent_get_task_group is the easiest start.",
    {
      project: projectField,
      taskGroup: z.record(z.string(), z.unknown()).describe("The task group: { name, category, description, tasks: [...], inputs: [...] }, in the shape taskagent_get_task_group returns."),
    },
    async ({ project, taskGroup }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        return jsonResult(await taskAgentApi.addTaskGroup(taskGroup as TaskGroupCreateParameter, ctx.project));
      } catch (error) {
        return toolError("creating task group", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.update_task_group,
    "Replace a task group with an edited copy of its whole definition, including its current revision. Every pipeline using the group picks up the change.",
    {
      project: projectField,
      taskGroupId: z.string().describe("The GUID of the task group."),
      taskGroup: z.record(z.string(), z.unknown()).describe("The complete task group as taskagent_get_task_group returns it, with your changes and its current revision."),
    },
    async ({ project, taskGroupId, taskGroup }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        return jsonResult(await taskAgentApi.updateTaskGroup({ ...(taskGroup as TaskGroupUpdateParameter), id: taskGroupId }, ctx.project, taskGroupId));
      } catch (error) {
        return toolError(`updating task group ${taskGroupId}`, error);
      }
    }
  );

  // ---- Deployment groups (classic release pipelines) ----

  const deploymentGroupIdParam = z.coerce.number().min(1).describe("The ID of the deployment group.");

  registerTool(
    server,
    TASKAGENT_TOOLS.list_deployment_groups,
    "List the deployment groups of a project — the sets of target machines classic release pipelines deploy to.",
    {
      project: projectField,
      name: z.string().optional().describe("Only the group with this name."),
      top: z.coerce.number().min(1).optional().describe("Maximum number of groups to return."),
    },
    async ({ project, name, top }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        return jsonResult((await taskAgentApi.getDeploymentGroups(ctx.project, name, undefined, undefined, undefined, top)) ?? []);
      } catch (error) {
        return toolError("listing deployment groups", error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.get_deployment_group,
    "Get one deployment group with its machine count and the pool behind it.",
    { project: projectField, deploymentGroupId: deploymentGroupIdParam },
    async ({ project, deploymentGroupId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const group = await taskAgentApi.getDeploymentGroup(ctx.project, deploymentGroupId);
        if (!group) {
          return { content: [{ type: "text", text: `Deployment group ${deploymentGroupId} not found` }], isError: true };
        }
        return jsonResult(group);
      } catch (error) {
        return toolError(`getting deployment group ${deploymentGroupId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.add_deployment_group,
    "Create a deployment group in a project. Machines join it by running the registration script shown in the web UI.",
    {
      project: projectField,
      name: z.string().describe("The group name."),
      description: z.string().optional().describe("The group description."),
    },
    async ({ project, name, description }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        return jsonResult(await taskAgentApi.addDeploymentGroup({ name, description }, ctx.project));
      } catch (error) {
        return toolError(`creating deployment group '${name}'`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.update_deployment_group,
    "Rename a deployment group or change its description.",
    {
      project: projectField,
      deploymentGroupId: deploymentGroupIdParam,
      name: z.string().optional().describe("New group name."),
      description: z.string().optional().describe("New description."),
    },
    async ({ project, deploymentGroupId, name, description }) => {
      if (name === undefined && description === undefined) {
        return { content: [{ type: "text", text: "Nothing to update: give name, description or both." }], isError: true };
      }
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        return jsonResult(await taskAgentApi.updateDeploymentGroup({ name, description }, ctx.project, deploymentGroupId));
      } catch (error) {
        return toolError(`updating deployment group ${deploymentGroupId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.delete_deployment_group,
    "Delete a deployment group with its targets. Release pipelines that deploy to it fail until they are pointed elsewhere.",
    { project: projectField, deploymentGroupId: deploymentGroupIdParam },
    async ({ project, deploymentGroupId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        await taskAgentApi.deleteDeploymentGroup(ctx.project, deploymentGroupId);
        return jsonResult({ deleted: deploymentGroupId });
      } catch (error) {
        return toolError(`deleting deployment group ${deploymentGroupId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.list_deployment_targets,
    "List the machines in a deployment group with their tags, optionally filtered by tags or name.",
    {
      project: projectField,
      deploymentGroupId: deploymentGroupIdParam,
      tags: z.array(z.string()).optional().describe("Only machines carrying all of these tags."),
      name: z.string().optional().describe("Only machines whose name contains this text."),
      top: z.coerce.number().min(1).optional().describe("Maximum number of machines to return."),
    },
    async ({ project, deploymentGroupId, tags, name, top }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const targets = await taskAgentApi.getDeploymentTargets(ctx.project, deploymentGroupId, tags, name, name !== undefined, undefined, undefined, undefined, undefined, top);
        return jsonResult(targets ?? []);
      } catch (error) {
        return toolError(`listing targets of deployment group ${deploymentGroupId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.update_deployment_target_tags,
    "Replace the tags of machines in a deployment group. Release stages choose machines by tag, so this changes where deployments land.",
    {
      project: projectField,
      deploymentGroupId: deploymentGroupIdParam,
      targets: z
        .array(z.object({ id: z.coerce.number().min(1).describe("The target (machine) ID."), tags: z.array(z.string()).describe("The complete new tag list.") }))
        .min(1)
        .describe("The machines and their new tags."),
    },
    async ({ project, deploymentGroupId, targets }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        return jsonResult(await taskAgentApi.updateDeploymentTargets(targets, ctx.project, deploymentGroupId));
      } catch (error) {
        return toolError(`updating tags in deployment group ${deploymentGroupId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.delete_deployment_target,
    "Remove a machine from a deployment group, unregistering its agent there.",
    {
      project: projectField,
      deploymentGroupId: deploymentGroupIdParam,
      targetId: z.coerce.number().min(1).describe("The target (machine) ID."),
    },
    async ({ project, deploymentGroupId, targetId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        await taskAgentApi.deleteDeploymentTarget(ctx.project, deploymentGroupId, targetId);
        return jsonResult({ deleted: targetId, deploymentGroupId });
      } catch (error) {
        return toolError(`removing target ${targetId}`, error);
      }
    }
  );

  // ---- Elastic (scale set) agent pools ----

  registerTool(
    server,
    TASKAGENT_TOOLS.list_elastic_pools,
    "List the scale set agent pools of the organization — pools whose agents run on an Azure virtual machine scale set that Azure DevOps grows and shrinks.",
    {},
    async () => rest("listing elastic pools", "GET", "_apis/distributedtask/elasticpools?api-version=7.1")
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.get_elastic_pool,
    "Get a scale set agent pool's settings: maximum and standby capacity, idle time before scale-in, whether agents are recycled after each job, and its current state.",
    { poolId: poolIdParam },
    async ({ poolId }) => rest(`getting elastic pool ${poolId}`, "GET", `_apis/distributedtask/elasticpools/${poolId}?api-version=7.1`)
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.update_elastic_pool,
    "Change a scale set agent pool's settings. Only the values you pass change.",
    {
      poolId: poolIdParam,
      maxCapacity: z.coerce.number().min(1).optional().describe("Maximum number of machines."),
      desiredIdle: z.coerce.number().min(0).optional().describe("Machines kept on standby, ready for jobs."),
      timeToLiveMinutes: z.coerce.number().min(0).optional().describe("Minutes an idle machine is kept before it is removed."),
      recycleAfterEachUse: z.boolean().optional().describe("Replace a machine after every job, for a clean environment each time."),
      maxSavedNodeCount: z.coerce.number().min(0).optional().describe("How many unhealthy machines to keep for diagnosis instead of deleting them."),
    },
    async ({ poolId, ...settings }) => {
      const changes = Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined));
      if (Object.keys(changes).length === 0) {
        return { content: [{ type: "text", text: "Nothing to update: give at least one setting." }], isError: true };
      }
      return rest(`updating elastic pool ${poolId}`, "PATCH", `_apis/distributedtask/elasticpools/${poolId}?api-version=7.1`, changes);
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.list_elastic_pool_nodes,
    "List the machines of a scale set agent pool with their state (idle, busy, being deleted, failed) — to see why jobs wait or machines pile up.",
    { poolId: poolIdParam },
    async ({ poolId }) => rest(`listing nodes of elastic pool ${poolId}`, "GET", `_apis/distributedtask/elasticpools/${poolId}/nodes?api-version=7.1`)
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.get_elastic_pool_logs,
    "Get the diagnostic log of a scale set agent pool: scaling decisions and errors from the Azure scale set.",
    { poolId: poolIdParam },
    async ({ poolId }) => rest(`getting logs of elastic pool ${poolId}`, "GET", `_apis/distributedtask/elasticpools/${poolId}/logs?api-version=7.1`)
  );

  // ---- Environments: deployments and resources ----

  const environmentIdParam = z.coerce.number().min(1).describe("The ID of the environment, as taskagent_list_environments returns it.");

  registerTool(
    server,
    TASKAGENT_TOOLS.list_environment_deployments,
    "List the deployment history of an environment: which pipeline run deployed what, to which resource, when, and with what result.",
    {
      project: projectField,
      environmentId: environmentIdParam,
      top: z.coerce.number().min(1).optional().describe("Maximum number of deployments to return."),
      continuationToken: continuationTokenParam,
    },
    async ({ project, environmentId, top, continuationToken }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        return jsonResult((await taskAgentApi.getEnvironmentDeploymentExecutionRecords(ctx.project, environmentId, continuationToken, top)) ?? []);
      } catch (error) {
        return toolError(`listing deployments of environment ${environmentId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.list_environment_virtual_machines,
    "List the virtual machine resources registered in an environment, with their tags and agent.",
    { project: projectField, environmentId: environmentIdParam },
    async ({ project, environmentId }) => {
      const connection = await connectionProvider();
      const ctx = await resolveProject(server, connection, project);
      if ("response" in ctx) return ctx.response;
      return rest(
        `listing virtual machines of environment ${environmentId}`,
        "GET",
        `${encodeURIComponent(ctx.project)}/_apis/pipelines/environments/${environmentId}/providers/virtualmachines?api-version=7.1`
      );
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.delete_environment_virtual_machine,
    "Remove a virtual machine resource from an environment. Deployments stop targeting it; the agent on the machine must be removed separately.",
    {
      project: projectField,
      environmentId: environmentIdParam,
      resourceId: z.coerce.number().min(1).describe("The ID of the virtual machine resource."),
    },
    async ({ project, environmentId, resourceId }) => {
      const connection = await connectionProvider();
      const ctx = await resolveProject(server, connection, project);
      if ("response" in ctx) return ctx.response;
      return rest(
        `removing virtual machine ${resourceId}`,
        "DELETE",
        `${encodeURIComponent(ctx.project)}/_apis/pipelines/environments/${environmentId}/providers/virtualmachines/${resourceId}?api-version=7.1`
      );
    }
  );

  const kubernetesResourceIdParam = z.coerce.number().min(1).describe("The ID of the Kubernetes resource in the environment.");

  registerTool(
    server,
    TASKAGENT_TOOLS.get_kubernetes_resource,
    "Get a Kubernetes resource of an environment: its cluster, namespace and the service connection used to reach it.",
    { project: projectField, environmentId: environmentIdParam, resourceId: kubernetesResourceIdParam },
    async ({ project, environmentId, resourceId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        const resource = await taskAgentApi.getKubernetesResource(ctx.project, environmentId, resourceId);
        if (!resource) {
          return { content: [{ type: "text", text: `Kubernetes resource ${resourceId} not found in environment ${environmentId}` }], isError: true };
        }
        return jsonResult(resource);
      } catch (error) {
        return toolError(`getting Kubernetes resource ${resourceId}`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.add_kubernetes_resource,
    "Add a Kubernetes namespace to an environment as a deployment resource, reached through an existing Kubernetes service connection.",
    {
      project: projectField,
      environmentId: environmentIdParam,
      name: z.string().describe("The resource name shown in the environment, usually the namespace."),
      namespace: z.string().describe("The Kubernetes namespace to deploy to."),
      clusterName: z.string().optional().describe("The cluster name, for display."),
      serviceEndpointId: z.string().describe("The GUID of the Kubernetes service connection that can reach the cluster."),
      tags: z.array(z.string()).optional().describe("Tags for selecting the resource in deployment jobs."),
    },
    async ({ project, environmentId, name, namespace, clusterName, serviceEndpointId, tags }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        return jsonResult(
          await taskAgentApi.addKubernetesResource({ name, namespace, clusterName, serviceEndpointId, tags } as KubernetesResourceCreateParametersExistingEndpoint, ctx.project, environmentId)
        );
      } catch (error) {
        return toolError(`adding Kubernetes resource '${name}'`, error);
      }
    }
  );

  registerTool(
    server,
    TASKAGENT_TOOLS.delete_kubernetes_resource,
    "Remove a Kubernetes resource from an environment. The namespace in the cluster is not touched; deployments just stop targeting it.",
    { project: projectField, environmentId: environmentIdParam, resourceId: kubernetesResourceIdParam },
    async ({ project, environmentId, resourceId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const taskAgentApi = await connection.getTaskAgentApi();
        await taskAgentApi.deleteKubernetesResource(ctx.project, environmentId, resourceId);
        return jsonResult({ deleted: resourceId, environmentId });
      } catch (error) {
        return toolError(`removing Kubernetes resource ${resourceId}`, error);
      }
    }
  );
}

export { TASKAGENT_TOOLS, configureTaskAgentTools };

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { PolicyConfiguration } from "azure-devops-node-api/interfaces/PolicyInterfaces.js";
import { resolveProject } from "../shared/elicitations.js";
import { optionalProject } from "../shared/common-params.js";
import { jsonResult, toolError } from "../shared/tool-results.js";

const POLICY_TOOLS = {
  list_configurations: "policy_list_configurations",
  get_configuration: "policy_get_configuration",
  create_configuration: "policy_create_configuration",
  update_configuration: "policy_update_configuration",
  delete_configuration: "policy_delete_configuration",
  list_types: "policy_list_types",
  get_type: "policy_get_type",
  list_configuration_revisions: "policy_list_configuration_revisions",
  get_configuration_revision: "policy_get_configuration_revision",
  list_evaluations: "policy_list_evaluations",
  get_evaluation: "policy_get_evaluation",
  requeue_evaluation: "policy_requeue_evaluation",
};

function configurePolicyTools(server: McpServer, _: () => Promise<string>, connectionProvider: () => Promise<WebApi>) {
  const projectField = optionalProject;

  registerTool(
    server,
    POLICY_TOOLS.list_configurations,
    "List the policy configurations in a project, optionally filtered by scope (repository/branch) or policy type. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      scope: z.string().optional().describe("Optional scope filter, e.g. a repository ID to return only policies scoped to that repository."),
      policyType: z.string().optional().describe("Optional policy type ID to filter by."),
    },
    async ({ project, scope, policyType }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const policyApi = await connection.getPolicyApi();
        const configurations = await policyApi.getPolicyConfigurations(ctx.project, scope, policyType);

        if (!configurations || configurations.length === 0) {
          return { content: [{ type: "text", text: "No policy configurations found" }], isError: true };
        }
        return jsonResult(configurations);
      } catch (error) {
        return toolError("fetching policy configurations", error);
      }
    }
  );

  registerTool(
    server,
    POLICY_TOOLS.get_configuration,
    "Get a specific policy configuration by ID. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      configurationId: z.number().describe("The ID of the policy configuration."),
    },
    async ({ project, configurationId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const policyApi = await connection.getPolicyApi();
        const configuration = await policyApi.getPolicyConfiguration(ctx.project, configurationId);

        return jsonResult(configuration);
      } catch (error) {
        return toolError("fetching policy configuration", error);
      }
    }
  );

  registerTool(
    server,
    POLICY_TOOLS.create_configuration,
    "Create a new policy configuration (e.g. a branch policy) in a project. Use policy_list_types to discover the type ID and required settings.",
    {
      project: projectField,
      configuration: z
        .record(z.unknown())
        .describe("The policy configuration object (e.g. { type: { id }, isEnabled, isBlocking, settings: { ... } }). The settings shape depends on the policy type."),
    },
    async ({ project, configuration }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const policyApi = await connection.getPolicyApi();
        const result = await policyApi.createPolicyConfiguration(configuration as unknown as PolicyConfiguration, ctx.project);

        return jsonResult(result);
      } catch (error) {
        return toolError("creating policy configuration", error);
      }
    }
  );

  registerTool(
    server,
    POLICY_TOOLS.update_configuration,
    "Update an existing policy configuration. Obtain the current configuration via policy_get_configuration, modify it, and pass back the full object.",
    {
      project: projectField,
      configurationId: z.number().describe("The ID of the policy configuration to update."),
      configuration: z.record(z.unknown()).describe("The full policy configuration object (as returned by policy_get_configuration, with edits applied)."),
    },
    async ({ project, configurationId, configuration }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const policyApi = await connection.getPolicyApi();
        const result = await policyApi.updatePolicyConfiguration(configuration as unknown as PolicyConfiguration, ctx.project, configurationId);

        return jsonResult(result);
      } catch (error) {
        return toolError("updating policy configuration", error);
      }
    }
  );

  registerTool(
    server,
    POLICY_TOOLS.delete_configuration,
    "Delete a policy configuration by ID. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      configurationId: z.number().describe("The ID of the policy configuration to delete."),
    },
    async ({ project, configurationId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const policyApi = await connection.getPolicyApi();
        await policyApi.deletePolicyConfiguration(ctx.project, configurationId);

        return { content: [{ type: "text", text: `Policy configuration ${configurationId} deleted` }] };
      } catch (error) {
        return toolError("deleting policy configuration", error);
      }
    }
  );

  registerTool(
    server,
    POLICY_TOOLS.list_types,
    "List the policy types available in a project. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
    },
    async ({ project }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const policyApi = await connection.getPolicyApi();
        const types = await policyApi.getPolicyTypes(ctx.project);

        if (!types || types.length === 0) {
          return { content: [{ type: "text", text: "No policy types found" }], isError: true };
        }
        return jsonResult(types);
      } catch (error) {
        return toolError("fetching policy types", error);
      }
    }
  );

  registerTool(
    server,
    POLICY_TOOLS.get_type,
    "Get a specific policy type by ID. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      typeId: z.string().describe("The ID (GUID) of the policy type. Use policy_list_types to discover valid IDs."),
    },
    async ({ project, typeId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const policyApi = await connection.getPolicyApi();
        const type = await policyApi.getPolicyType(ctx.project, typeId);

        return jsonResult(type);
      } catch (error) {
        return toolError("fetching policy type", error);
      }
    }
  );

  registerTool(
    server,
    POLICY_TOOLS.list_configuration_revisions,
    "List the revisions of a policy configuration. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      configurationId: z.number().describe("The ID of the policy configuration."),
      top: z.coerce.number().optional().describe("Optional maximum number of revisions to return."),
      skip: z.coerce.number().optional().describe("Optional number of revisions to skip."),
    },
    async ({ project, configurationId, top, skip }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const policyApi = await connection.getPolicyApi();
        const revisions = await policyApi.getPolicyConfigurationRevisions(ctx.project, configurationId, top, skip);

        return jsonResult(revisions);
      } catch (error) {
        return toolError("fetching policy configuration revisions", error);
      }
    }
  );

  registerTool(
    server,
    POLICY_TOOLS.get_configuration_revision,
    "Get a specific revision of a policy configuration. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      configurationId: z.number().describe("The ID of the policy configuration."),
      revisionId: z.number().describe("The ID of the revision to retrieve."),
    },
    async ({ project, configurationId, revisionId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const policyApi = await connection.getPolicyApi();
        const revision = await policyApi.getPolicyConfigurationRevision(ctx.project, configurationId, revisionId);

        return jsonResult(revision);
      } catch (error) {
        return toolError("fetching policy configuration revision", error);
      }
    }
  );

  registerTool(
    server,
    POLICY_TOOLS.list_evaluations,
    "List the policy evaluations for an artifact (e.g. a pull request), showing which policies pass, fail or are queued. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      artifactId: z.string().describe("The artifact ID to evaluate policies for (e.g. 'vstfs:///CodeReview/CodeReviewId/{projectId}/{pullRequestId}')."),
      includeNotApplicable: z.boolean().optional().describe("Whether to include policies that are not applicable to the artifact. Defaults to false."),
      top: z.coerce.number().optional().describe("Optional maximum number of evaluations to return."),
      skip: z.coerce.number().optional().describe("Optional number of evaluations to skip."),
    },
    async ({ project, artifactId, includeNotApplicable, top, skip }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const policyApi = await connection.getPolicyApi();
        const evaluations = await policyApi.getPolicyEvaluations(ctx.project, artifactId, includeNotApplicable, top, skip);

        return jsonResult(evaluations);
      } catch (error) {
        return toolError("fetching policy evaluations", error);
      }
    }
  );

  registerTool(
    server,
    POLICY_TOOLS.get_evaluation,
    "Get a specific policy evaluation record by ID. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      evaluationId: z.string().describe("The ID of the policy evaluation record."),
    },
    async ({ project, evaluationId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const policyApi = await connection.getPolicyApi();
        const evaluation = await policyApi.getPolicyEvaluation(ctx.project, evaluationId);

        return jsonResult(evaluation);
      } catch (error) {
        return toolError("fetching policy evaluation", error);
      }
    }
  );

  registerTool(
    server,
    POLICY_TOOLS.requeue_evaluation,
    "Requeue (re-run) a policy evaluation by ID. If a project is not specified, you will be prompted to select one.",
    {
      project: projectField,
      evaluationId: z.string().describe("The ID of the policy evaluation record to requeue."),
    },
    async ({ project, evaluationId }) => {
      try {
        const connection = await connectionProvider();
        const ctx = await resolveProject(server, connection, project);
        if ("response" in ctx) return ctx.response;

        const policyApi = await connection.getPolicyApi();
        const evaluation = await policyApi.requeuePolicyEvaluation(ctx.project, evaluationId);

        return jsonResult(evaluation);
      } catch (error) {
        return toolError("requeuing policy evaluation", error);
      }
    }
  );
}

export { POLICY_TOOLS, configurePolicyTools };

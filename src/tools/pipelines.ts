// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { apiVersion, getEnumKeys, safeEnumConvert } from "../utils.js";
import { WebApi } from "azure-devops-node-api";
import { BuildQueryOrder, DefinitionQueryOrder, Build, BuildDefinition, BuildStatus, FolderQueryOrder, TaskResult } from "azure-devops-node-api/interfaces/BuildInterfaces.js";
import { z } from "zod";
import { StageUpdateType } from "azure-devops-node-api/interfaces/BuildInterfaces.js";
import { ConfigurationType, RepositoryType } from "azure-devops-node-api/interfaces/PipelinesInterfaces.js";
import { mkdirSync, createWriteStream } from "fs";
import { createExternalContentResponse } from "../shared/content-safety.js";
import { join, posix, resolve, win32 } from "path";
import { requiredProject, continuationTokenParam } from "../shared/common-params.js";
import { jsonResult, toolError } from "../shared/tool-results.js";

const PIPELINE_TOOLS = {
  pipelines_get_builds: "pipelines_get_builds",
  pipelines_get_build_changes: "pipelines_get_build_changes",
  pipelines_get_build_definitions: "pipelines_get_build_definitions",
  pipelines_get_build_definition_revisions: "pipelines_get_build_definition_revisions",
  pipelines_get_build_log: "pipelines_get_build_log",
  pipelines_get_build_log_by_id: "pipelines_get_build_log_by_id",
  pipelines_get_build_status: "pipelines_get_build_status",
  pipelines_update_build_stage: "pipelines_update_build_stage",
  pipelines_create_pipeline: "pipelines_create_pipeline",
  pipelines_get_run: "pipelines_get_run",
  pipelines_list_runs: "pipelines_list_runs",
  pipelines_run_pipeline: "pipelines_run_pipeline",
  pipelines_list_artifacts: "pipelines_list_artifacts",
  pipelines_download_artifact: "pipelines_download_artifact",
  pipelines_get_build: "pipelines_get_build",
  pipelines_get_build_definition: "pipelines_get_build_definition",
  pipelines_queue_build: "pipelines_queue_build",
  pipelines_cancel_build: "pipelines_cancel_build",
  pipelines_get_build_timeline: "pipelines_get_build_timeline",
  pipelines_get_build_tags: "pipelines_get_build_tags",
  pipelines_add_build_tag: "pipelines_add_build_tag",
  pipelines_delete_build_tag: "pipelines_delete_build_tag",
  pipelines_create_build_definition: "pipelines_create_build_definition",
  pipelines_update_build_definition: "pipelines_update_build_definition",
  pipelines_list_retention_leases: "pipelines_list_retention_leases",
  pipelines_add_retention_lease: "pipelines_add_retention_lease",
  pipelines_update_retention_lease: "pipelines_update_retention_lease",
  pipelines_delete_retention_leases: "pipelines_delete_retention_leases",
  pipelines_list_folders: "pipelines_list_folders",
  pipelines_create_folder: "pipelines_create_folder",
  pipelines_update_folder: "pipelines_update_folder",
  pipelines_delete_folder: "pipelines_delete_folder",
  pipelines_delete_build: "pipelines_delete_build",
  pipelines_get_latest_build: "pipelines_get_latest_build",
  pipelines_get_build_work_items: "pipelines_get_build_work_items",
  pipelines_get_changes_between_builds: "pipelines_get_changes_between_builds",
  pipelines_list_project_build_tags: "pipelines_list_project_build_tags",
  pipelines_delete_build_definition: "pipelines_delete_build_definition",
  pipelines_restore_build_definition: "pipelines_restore_build_definition",
  pipelines_get_build_definition_yaml: "pipelines_get_build_definition_yaml",
  pipelines_get_definition_tags: "pipelines_get_definition_tags",
  pipelines_add_definition_tags: "pipelines_add_definition_tags",
  pipelines_delete_definition_tag: "pipelines_delete_definition_tag",
  pipelines_get_build_metrics: "pipelines_get_build_metrics",
  pipelines_list_definition_resources: "pipelines_list_definition_resources",
  pipelines_authorize_definition_resources: "pipelines_authorize_definition_resources",
  pipelines_get_retention_settings: "pipelines_get_retention_settings",
  pipelines_update_retention_settings: "pipelines_update_retention_settings",
  pipelines_get_general_settings: "pipelines_get_general_settings",
  pipelines_update_general_settings: "pipelines_update_general_settings",
};

/** Pipeline folders are backslash paths rooted at '\\'; accept 'infra/docker' and '/infra/docker' too. */
function folderPath(path: string): string {
  const normalized = path.replace(/\//g, "\\").replace(/\\+$/, "");
  return normalized.startsWith("\\") ? normalized : `\\${normalized}`;
}

function configurePipelineTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build_definitions,
    "Retrieves a list of build definitions for a given project.",
    {
      project: z.string().describe("Project ID or name to get build definitions for"),
      repositoryId: z
        .string()
        .optional()
        .describe(
          "Repository ID to filter build definitions. Can be a GUID or a repository name; when a name is provided, it is auto-resolved to the repository GUID using the project parameter (Azure Repos / TfsGit only)."
        ),
      repositoryType: z.enum(["TfsGit", "GitHub", "BitbucketCloud"]).optional().describe("Type of repository to filter build definitions"),
      name: z.string().optional().describe("Name of the build definition to filter"),
      path: z.string().optional().describe("Path of the build definition to filter"),
      queryOrder: z
        .enum(getEnumKeys(DefinitionQueryOrder) as [string, ...string[]])
        .optional()
        .describe("Order in which build definitions are returned"),
      top: z.number().optional().describe("Maximum number of build definitions to return"),
      continuationToken: continuationTokenParam,
      minMetricsTime: z.coerce.date().optional().describe("Minimum metrics time to filter build definitions"),
      definitionIds: z.array(z.coerce.number().min(1)).optional().describe("Array of build definition IDs to filter"),
      builtAfter: z.coerce.date().optional().describe("Return definitions that have builds after this date"),
      notBuiltAfter: z.coerce.date().optional().describe("Return definitions that do not have builds after this date"),
      includeAllProperties: z.boolean().optional().describe("Whether to include all properties in the results"),
      includeLatestBuilds: z.boolean().optional().describe("Whether to include the latest builds for each definition"),
      taskIdFilter: z.string().optional().describe("Task ID to filter build definitions"),
      processType: z.number().optional().describe("Process type to filter build definitions"),
      yamlFilename: z.string().optional().describe("YAML filename to filter build definitions"),
    },
    async ({
      project,
      repositoryId,
      repositoryType,
      name,
      path,
      queryOrder,
      top,
      continuationToken,
      minMetricsTime,
      definitionIds,
      builtAfter,
      notBuiltAfter,
      includeAllProperties,
      includeLatestBuilds,
      taskIdFilter,
      processType,
      yamlFilename,
    }) => {
      const connection = await connectionProvider();
      const buildApi = await connection.getBuildApi();

      // Auto-resolve repositoryId from name to GUID for Azure Repos
      let resolvedRepositoryId = repositoryId;
      if (repositoryId) {
        const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(repositoryId);
        if (!isGuid && (!repositoryType || repositoryType === "TfsGit")) {
          const gitApi = await connection.getGitApi();
          const repositories = await gitApi.getRepositories(project);
          const repo = repositories?.find((r) => r.name === repositoryId);
          if (!repo?.id) {
            return {
              content: [{ type: "text", text: `Error: Repository '${repositoryId}' not found in project '${project}'.` }],
              isError: true,
            };
          }
          resolvedRepositoryId = repo.id;
        }
      }

      const buildDefinitions = await buildApi.getDefinitions(
        project,
        name,
        resolvedRepositoryId,
        repositoryType,
        safeEnumConvert(DefinitionQueryOrder, queryOrder),
        top,
        continuationToken,
        minMetricsTime,
        definitionIds,
        path,
        builtAfter,
        notBuiltAfter,
        includeAllProperties,
        includeLatestBuilds,
        taskIdFilter,
        processType,
        yamlFilename
      );

      return jsonResult(buildDefinitions);
    }
  );

  const variableSchema = z.object({
    value: z.string().optional(),
    isSecret: z.boolean().optional(),
  });

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_create_pipeline,
    "Creates a pipeline definition with YAML configuration for a given project.",
    {
      project: z.string().describe("Project ID or name to run the build in."),
      name: z.string().describe("Name of the new pipeline."),
      folder: z.string().optional().describe("Folder path for the new pipeline. Defaults to '\\' if not specified."),
      yamlPath: z.string().describe("The path to the pipeline's YAML file in the repository"),
      repositoryType: z.enum(getEnumKeys(RepositoryType) as [string, ...string[]]).describe("The type of repository where the pipeline's YAML file is located."),
      repositoryName: z.string().describe("The name of the repository. In case of GitHub repository, this is the full name (:owner/:repo) - e.g. octocat/Hello-World."),
      repositoryId: z.string().optional().describe("The ID of the repository."),
      repositoryConnectionId: z.string().optional().describe("The service connection ID for GitHub repositories. Not required for Azure Repos Git."),
    },
    async ({ project, name, folder, yamlPath, repositoryType, repositoryName, repositoryId, repositoryConnectionId }) => {
      const connection = await connectionProvider();
      const pipelinesApi = await connection.getPipelinesApi();

      const repositoryTypeEnumValue = safeEnumConvert(RepositoryType, repositoryType);
      const repositoryPayload: any = {
        type: repositoryType,
      };
      if (repositoryTypeEnumValue === RepositoryType.AzureReposGit) {
        repositoryPayload.id = repositoryId;
        repositoryPayload.name = repositoryName;
      } else if (repositoryTypeEnumValue === RepositoryType.GitHub) {
        if (!repositoryConnectionId) {
          throw new Error("Parameter 'repositoryConnectionId' is required for GitHub repositories.");
        }
        repositoryPayload.connection = { id: repositoryConnectionId };
        repositoryPayload.fullname = repositoryName;
      } else {
        throw new Error("Unsupported repository type");
      }

      const yamlConfigurationType = getEnumKeys(ConfigurationType).find((k) => ConfigurationType[k as keyof typeof ConfigurationType] === ConfigurationType.Yaml);

      const createPipelineParams: any = {
        name: name,
        folder: folder || "\\",
        configuration: {
          type: yamlConfigurationType,
          path: yamlPath,
          repository: repositoryPayload,
          variables: undefined,
        },
      };

      const newPipeline = await pipelinesApi.createPipeline(createPipelineParams, project);
      return jsonResult(newPipeline);
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build_definition_revisions,
    "Retrieves a list of revisions for a specific build definition.",
    {
      project: z.string().describe("Project ID or name to get the build definition revisions for"),
      definitionId: z.coerce.number().min(1).describe("ID of the build definition to get revisions for"),
    },
    async ({ project, definitionId }) => {
      const connection = await connectionProvider();
      const buildApi = await connection.getBuildApi();
      const revisions = await buildApi.getDefinitionRevisions(project, definitionId);

      return jsonResult(revisions);
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_builds,
    "Retrieves a list of builds for a given project.",
    {
      project: z.string().describe("Project ID or name to get builds for"),
      definitions: z.array(z.coerce.number().min(1)).optional().describe("Array of build definition IDs to filter builds"),
      queues: z.array(z.coerce.number().min(1)).optional().describe("Array of queue IDs to filter builds"),
      buildNumber: z.string().optional().describe("Build number to filter builds"),
      minTime: z.coerce.date().optional().describe("Minimum finish time to filter builds"),
      maxTime: z.coerce.date().optional().describe("Maximum finish time to filter builds"),
      requestedFor: z.string().optional().describe("User ID or name who requested the build"),
      reasonFilter: z.number().optional().describe("Reason filter for the build (see BuildReason enum)"),
      statusFilter: z.number().optional().describe("Status filter for the build (see BuildStatus enum)"),
      resultFilter: z.number().optional().describe("Result filter for the build (see BuildResult enum)"),
      tagFilters: z.array(z.string()).optional().describe("Array of tags to filter builds"),
      properties: z.array(z.string()).optional().describe("Array of property names to include in the results"),
      top: z.number().optional().describe("Maximum number of builds to return"),
      continuationToken: continuationTokenParam,
      maxBuildsPerDefinition: z.number().optional().describe("Maximum number of builds per definition"),
      deletedFilter: z.number().optional().describe("Filter for deleted builds (see QueryDeletedOption enum)"),
      queryOrder: z
        .enum(getEnumKeys(BuildQueryOrder) as [string, ...string[]])
        .default("QueueTimeDescending")
        .optional()
        .describe("Order in which builds are returned"),
      branchName: z.string().optional().describe("Branch name to filter builds"),
      buildIds: z.array(z.coerce.number().min(1)).optional().describe("Array of build IDs to retrieve"),
      repositoryId: z.string().optional().describe("Repository ID to filter builds"),
      repositoryType: z.enum(["TfsGit", "GitHub", "BitbucketCloud"]).optional().describe("Type of repository to filter builds"),
    },
    async ({
      project,
      definitions,
      queues,
      buildNumber,
      minTime,
      maxTime,
      requestedFor,
      reasonFilter,
      statusFilter,
      resultFilter,
      tagFilters,
      properties,
      top,
      continuationToken,
      maxBuildsPerDefinition,
      deletedFilter,
      queryOrder,
      branchName,
      buildIds,
      repositoryId,
      repositoryType,
    }) => {
      const connection = await connectionProvider();
      const buildApi = await connection.getBuildApi();
      const builds = await buildApi.getBuilds(
        project,
        definitions,
        queues,
        buildNumber,
        minTime,
        maxTime,
        requestedFor,
        reasonFilter,
        statusFilter,
        resultFilter,
        tagFilters,
        properties,
        top,
        continuationToken,
        maxBuildsPerDefinition,
        deletedFilter,
        safeEnumConvert(BuildQueryOrder, queryOrder),
        branchName,
        buildIds,
        repositoryId,
        repositoryType
      );

      return jsonResult(builds);
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build_log,
    "Retrieves the logs for a specific build.",
    {
      project: z.string().describe("Project ID or name to get the build log for"),
      buildId: z.coerce.number().min(1).describe("ID of the build to get the log for"),
    },
    async ({ project, buildId }) => {
      const connection = await connectionProvider();
      const buildApi = await connection.getBuildApi();
      const logs = await buildApi.getBuildLogs(project, buildId);

      return jsonResult(logs);
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build_log_by_id,
    "Get a specific build log by log ID.",
    {
      project: z.string().describe("Project ID or name to get the build log for"),
      buildId: z.coerce.number().min(1).describe("ID of the build to get the log for"),
      logId: z.coerce.number().min(1).describe("ID of the log to retrieve"),
      startLine: z.coerce.number().optional().describe("Starting line number for the log content, defaults to 0"),
      endLine: z.coerce.number().optional().describe("Ending line number for the log content, defaults to the end of the log"),
    },
    async ({ project, buildId, logId, startLine, endLine }) => {
      const connection = await connectionProvider();
      const buildApi = await connection.getBuildApi();
      const logLines = await buildApi.getBuildLogLines(project, buildId, logId, startLine, endLine);

      return createExternalContentResponse(logLines, "build log");
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build_changes,
    "Get the changes associated with a specific build.",
    {
      project: z.string().describe("Project ID or name to get the build changes for"),
      buildId: z.coerce.number().min(1).describe("ID of the build to get changes for"),
      continuationToken: continuationTokenParam,
      top: z.number().default(100).describe("Number of changes to retrieve, defaults to 100"),
      includeSourceChange: z.boolean().optional().describe("Whether to include source changes in the results, defaults to false"),
    },
    async ({ project, buildId, continuationToken, top, includeSourceChange }) => {
      const connection = await connectionProvider();
      const buildApi = await connection.getBuildApi();
      const changes = await buildApi.getBuildChanges(project, buildId, continuationToken, top, includeSourceChange);

      return jsonResult(changes);
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build_timeline,
    "Get the timeline of a build: the stage, phase, job and task records with their state, result, timings and issues (errors/warnings). Use this to find which stage or task of a run failed before fetching logs.",
    {
      project: z.string().describe("Project ID or name the build belongs to"),
      buildId: z.coerce.number().min(1).describe("ID of the build to get the timeline for"),
      timelineId: z.string().optional().describe("ID of a specific timeline. Omit to get the build's current timeline."),
      changeId: z.coerce.number().optional().describe("Change ID to get an incremental update of the timeline."),
      planId: z.string().optional().describe("ID of the plan the timeline belongs to."),
      recordType: z
        .enum(["Stage", "Phase", "Job", "Task", "Checkpoint"])
        .optional()
        .describe("Return only records of this type. Timelines are large, so narrowing to 'Stage' or 'Job' is usually enough to locate a failure."),
      onlyFailed: z.boolean().optional().describe("If true, return only records whose result is 'failed' or 'canceled', or that carry issues."),
    },
    async ({ project, buildId, timelineId, changeId, planId, recordType, onlyFailed }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const timeline = await buildApi.getBuildTimeline(project, buildId, timelineId, changeId, planId);

        if (!timeline) {
          return { content: [{ type: "text", text: `No timeline found for build ${buildId}` }], isError: true };
        }

        // Filtering is done here rather than by the caller because a timeline of
        // a large pipeline is mostly task records the model does not need.
        const records = (timeline.records ?? []).filter((record) => {
          if (recordType && record.type !== recordType) return false;
          if (onlyFailed) {
            const failed = record.result === TaskResult.Failed || record.result === TaskResult.Canceled;
            return failed || (record.issues?.length ?? 0) > 0;
          }
          return true;
        });

        return jsonResult({ ...timeline, records });
      } catch (error) {
        return toolError("fetching build timeline", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_run,
    "Gets a run for a particular pipeline.",
    {
      project: z.string().describe("Project ID or name to run the build in"),
      pipelineId: z.coerce.number().min(1).describe("ID of the pipeline to run"),
      runId: z.coerce.number().min(1).describe("ID of the run to get"),
    },
    async ({ project, pipelineId, runId }) => {
      const connection = await connectionProvider();
      const pipelinesApi = await connection.getPipelinesApi();
      const pipelineRun = await pipelinesApi.getRun(project, pipelineId, runId);

      return jsonResult(pipelineRun);
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_list_runs,
    "Gets top 10000 runs for a particular pipeline.",
    {
      project: z.string().describe("Project ID or name to run the build in"),
      pipelineId: z.coerce.number().min(1).describe("ID of the pipeline to run"),
    },
    async ({ project, pipelineId }) => {
      const connection = await connectionProvider();
      const pipelinesApi = await connection.getPipelinesApi();
      const pipelineRuns = await pipelinesApi.listRuns(project, pipelineId);

      return jsonResult(pipelineRuns);
    }
  );

  const resourcesSchema = z.object({
    builds: z
      .record(
        z.string().describe("Name of the build resource."),
        z.object({
          version: z.string().optional().describe("Version of the build resource."),
        })
      )
      .optional(),
    containers: z
      .record(
        z.string().describe("Name of the container resource."),
        z.object({
          version: z.string().optional().describe("Version of the container resource."),
        })
      )
      .optional(),
    packages: z
      .record(
        z.string().describe("Name of the package resource."),
        z.object({
          version: z.string().optional().describe("Version of the package resource."),
        })
      )
      .optional(),
    pipelines: z.record(
      z.string().describe("Name of the pipeline resource."),
      z.object({
        runId: z.coerce.number().min(1).optional().describe("Id of the source pipeline run that triggered or is referenced by this pipeline run."),
        version: z.string().optional().describe("Version of the source pipeline run."),
      })
    ),
    repositories: z
      .record(
        z.string().describe("Name of the repository resource."),
        z.object({
          refName: z.string().describe("Reference name, e.g., refs/heads/main."),
          token: z.string().optional(),
          tokenType: z.string().optional(),
          version: z.string().optional().describe("Version of the repository resource, git commit sha."),
        })
      )
      .optional(),
  });

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_run_pipeline,
    "Starts a new run of a pipeline.",
    {
      project: z.string().describe("Project ID or name to run the build in"),
      pipelineId: z.coerce.number().min(1).describe("ID of the pipeline to run"),
      pipelineVersion: z.coerce.number().min(1).optional().describe("Version of the pipeline to run. If not provided, the latest version will be used."),
      previewRun: z.boolean().optional().describe("If true, returns the final YAML document after parsing templates without creating a new run."),
      resources: resourcesSchema.optional().describe("A dictionary of resources to pass to the pipeline."),
      stagesToSkip: z.array(z.string()).optional().describe("A list of stages to skip."),
      templateParameters: z.record(z.string(), z.string()).optional().describe("Custom build parameters as key-value pairs"),
      variables: z.record(z.string(), variableSchema).optional().describe("A dictionary of variables to pass to the pipeline."),
      yamlOverride: z.string().optional().describe("YAML override for the pipeline run."),
    },
    async ({ project, pipelineId, pipelineVersion, previewRun, resources, stagesToSkip, templateParameters, variables, yamlOverride }) => {
      if (!previewRun && yamlOverride) {
        throw new Error("Parameter 'yamlOverride' can only be specified together with parameter 'previewRun'.");
      }

      const connection = await connectionProvider();
      const pipelinesApi = await connection.getPipelinesApi();
      const runRequest = {
        previewRun: previewRun,
        resources: {
          ...resources,
        },
        stagesToSkip: stagesToSkip,
        templateParameters: templateParameters,
        variables: variables,
        yamlOverride: yamlOverride,
      };

      const pipelineRun = await pipelinesApi.runPipeline(runRequest, project, pipelineId, pipelineVersion);
      const queuedBuild = { id: pipelineRun.id };
      const buildId = queuedBuild.id;

      if (buildId === undefined) {
        throw new Error("Failed to get build ID from pipeline run");
      }

      return jsonResult(pipelineRun);
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build_status,
    "Fetches the status of a specific build.",
    {
      project: z.string().describe("Project ID or name to get the build status for"),
      buildId: z.coerce.number().min(1).describe("ID of the build to get the status for"),
    },
    async ({ project, buildId }) => {
      const connection = await connectionProvider();
      const buildApi = await connection.getBuildApi();
      const build = await buildApi.getBuildReport(project, buildId);

      return jsonResult(build);
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_update_build_stage,
    "Updates the stage of a specific build.",
    {
      project: z.string().describe("Project ID or name to update the build stage for"),
      buildId: z.coerce.number().min(1).describe("ID of the build to update"),
      stageName: z.string().describe("Name of the stage to update"),
      status: z.enum(getEnumKeys(StageUpdateType) as [string, ...string[]]).describe("New status for the stage"),
      forceRetryAllJobs: z.boolean().default(false).describe("Whether to force retry all jobs in the stage."),
    },
    async ({ project, buildId, stageName, status, forceRetryAllJobs }) => {
      const connection = await connectionProvider();
      const orgUrl = connection.serverUrl;
      const endpoint = `${orgUrl}/${encodeURIComponent(project)}/_apis/build/builds/${buildId}/stages/${encodeURIComponent(stageName)}?api-version=${apiVersion}`;
      const token = await tokenProvider();

      const body = {
        forceRetryAllJobs: forceRetryAllJobs,
        state: safeEnumConvert(StageUpdateType, status),
      };

      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "User-Agent": userAgentProvider(),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update build stage: ${response.status} ${errorText}`);
      }

      // The body is JSON text already (or empty): parse it, so the model gets the object and not a quoted string.
      const updatedBuild = await response.text();
      if (!updatedBuild) {
        return { content: [{ type: "text", text: `Stage '${stageName}' of build ${buildId} updated: ${status}.` }] };
      }

      try {
        return jsonResult(JSON.parse(updatedBuild));
      } catch {
        return { content: [{ type: "text", text: updatedBuild }] };
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_list_artifacts,
    "Lists artifacts for a given build.",
    {
      project: z.string().describe("The name or ID of the project."),
      buildId: z.coerce.number().min(1).describe("The ID of the build."),
    },
    async ({ project, buildId }) => {
      const connection = await connectionProvider();
      const buildApi = await connection.getBuildApi();
      const artifacts = await buildApi.getArtifacts(project, buildId);

      return jsonResult(artifacts);
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_download_artifact,
    "Downloads a pipeline artifact. When destinationPath is provided, it must be a relative local path; absolute paths and path traversal are not allowed.",
    {
      project: z.string().describe("The name or ID of the project."),
      buildId: z.coerce.number().min(1).describe("The ID of the build."),
      artifactName: z.string().describe("The name of the artifact to download."),
      destinationPath: z.string().optional().describe("The relative local path to download the artifact to. If not provided, returns binary content as base64."),
    },
    async ({ project, buildId, artifactName, destinationPath }) => {
      const hasUnsafePathSegment = (value: string) => value.split(/[\\/]+/).some((segment) => segment === "." || segment === "..");
      const hasPathSeparators = (value: string) => /[\\/]/.test(value);
      const hasDriveLetter = (value: string) => /^[a-zA-Z]:/.test(value);
      const isAbsolutePath = (value: string) => posix.isAbsolute(value) || win32.isAbsolute(value);

      if (hasUnsafePathSegment(artifactName) || hasPathSeparators(artifactName) || hasDriveLetter(artifactName) || isAbsolutePath(artifactName)) {
        throw new Error("Invalid artifactName: artifactName must be a file name, not a path.");
      }

      if (destinationPath && (hasUnsafePathSegment(destinationPath) || isAbsolutePath(destinationPath) || hasDriveLetter(destinationPath))) {
        throw new Error("Invalid destinationPath: use a relative path without path traversal.");
      }

      const connection = await connectionProvider();
      const buildApi = await connection.getBuildApi();
      const artifact = await buildApi.getArtifact(project, buildId, artifactName);

      if (!artifact) {
        return {
          content: [{ type: "text", text: `Artifact ${artifactName} not found in build ${buildId}.` }],
        };
      }

      const fileStream = await buildApi.getArtifactContentZip(project, buildId, artifactName);

      // If destinationPath is provided, save to disk
      if (destinationPath) {
        const fullDestinationPath = resolve(destinationPath);

        mkdirSync(fullDestinationPath, { recursive: true });
        const fileDestinationPath = join(fullDestinationPath, `${artifactName}.zip`);

        const writeStream = createWriteStream(fileDestinationPath);
        await new Promise<void>((resolve, reject) => {
          fileStream.pipe(writeStream);
          fileStream.on("end", () => resolve());
          fileStream.on("error", (err) => reject(err));
        });

        return {
          content: [{ type: "text", text: `Artifact ${artifactName} downloaded to ${destinationPath}.` }],
        };
      }

      // Otherwise, return binary content as base64
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        fileStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        fileStream.on("end", () => resolve());
        fileStream.on("error", (err) => reject(err));
      });

      const buffer = Buffer.concat(chunks);
      const base64Data = buffer.toString("base64");

      return {
        content: [
          {
            type: "resource",
            resource: {
              uri: `data:application/zip;base64,${base64Data}`,
              mimeType: "application/zip",
              text: base64Data,
            },
          },
        ],
      };
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build,
    "Get a single build by its ID, including status, result, and timing.",
    {
      project: z.string().describe("Project ID or name."),
      buildId: z.coerce.number().describe("The ID of the build."),
    },
    async ({ project, buildId }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const build = await buildApi.getBuild(project, buildId);

        if (!build) {
          return { content: [{ type: "text", text: `Build ${buildId} not found` }], isError: true };
        }

        return jsonResult(build);
      } catch (error) {
        return toolError("fetching build", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build_definition,
    "Get a single build/pipeline definition by its ID.",
    {
      project: z.string().describe("Project ID or name."),
      definitionId: z.coerce.number().describe("The ID of the build definition."),
      revision: z.coerce.number().optional().describe("A specific revision of the definition to retrieve. Optional."),
      includeLatestBuilds: z.boolean().optional().describe("Include the latest and latest completed builds for the definition."),
    },
    async ({ project, definitionId, revision, includeLatestBuilds }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const definition = await buildApi.getDefinition(project, definitionId, revision, undefined, undefined, includeLatestBuilds);

        if (!definition) {
          return { content: [{ type: "text", text: `Build definition ${definitionId} not found` }], isError: true };
        }

        return jsonResult(definition);
      } catch (error) {
        return toolError("fetching build definition", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_queue_build,
    "Queue (start) a new build for a build definition.",
    {
      project: z.string().describe("Project ID or name."),
      definitionId: z.coerce.number().describe("The ID of the build definition to queue."),
      sourceBranch: z.string().optional().describe("The branch to build, e.g. 'refs/heads/main'. Defaults to the definition's default branch."),
      parameters: z.string().optional().describe('Build parameters as a JSON object string, e.g. \'{"myVar":"value"}\'.'),
    },
    async ({ project, definitionId, sourceBranch, parameters }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const build: Build = { definition: { id: definitionId }, sourceBranch, parameters };
        const queued = await buildApi.queueBuild(build, project);

        return jsonResult(queued);
      } catch (error) {
        return toolError("queueing build", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_cancel_build,
    "Cancel an in-progress build by setting its status to Cancelling.",
    {
      project: z.string().describe("Project ID or name."),
      buildId: z.coerce.number().describe("The ID of the build to cancel."),
    },
    async ({ project, buildId }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const build: Build = { status: BuildStatus.Cancelling };
        const updated = await buildApi.updateBuild(build, project, buildId);

        return jsonResult(updated);
      } catch (error) {
        return toolError("cancelling build", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build_tags,
    "Get the tags applied to a build.",
    {
      project: z.string().describe("Project ID or name."),
      buildId: z.coerce.number().describe("The ID of the build."),
    },
    async ({ project, buildId }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const tags = await buildApi.getBuildTags(project, buildId);

        return jsonResult(tags);
      } catch (error) {
        return toolError("fetching build tags", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_add_build_tag,
    "Add a tag to a build. Returns the build's updated tag list.",
    {
      project: z.string().describe("Project ID or name."),
      buildId: z.coerce.number().describe("The ID of the build."),
      tag: z.string().describe("The tag to add."),
    },
    async ({ project, buildId, tag }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const tags = await buildApi.addBuildTag(project, buildId, tag);

        return jsonResult(tags);
      } catch (error) {
        return toolError("adding build tag", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_delete_build_tag,
    "Delete a tag from a build. Returns the build's remaining tag list.",
    {
      project: z.string().describe("Project ID or name."),
      buildId: z.coerce.number().describe("The ID of the build."),
      tag: z.string().describe("The tag to remove."),
    },
    async ({ project, buildId, tag }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const tags = await buildApi.deleteBuildTag(project, buildId, tag);

        return jsonResult(tags);
      } catch (error) {
        return toolError("deleting build tag", error);
      }
    }
  );

  const definitionParam = z
    .record(z.string(), z.unknown())
    .describe("The complete build definition as JSON, in the shape pipelines_get_build_definition returns (name, path, process, repository, queue, variables, triggers, …).");

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_create_build_definition,
    "Create a build definition from a complete definition object. For a new YAML pipeline, pipelines_create_pipeline needs far less input. To copy an existing definition, read it with pipelines_get_build_definition, change its name (and path), drop id, revision and url, and pass the result here.",
    {
      project: requiredProject,
      definition: definitionParam,
    },
    async ({ project, definition }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const created = await buildApi.createDefinition(definition as BuildDefinition, project);
        return jsonResult(created);
      } catch (error) {
        return toolError("creating build definition", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_update_build_definition,
    "Replace a build definition — rename it, move it to another folder, change its variables, triggers, YAML path, agent queue or any other setting. The API takes the whole definition, not a patch: read it with pipelines_get_build_definition, change what you need and send all of it back. Its revision must still be the latest, otherwise the update is rejected so that someone else's change is not overwritten.",
    {
      project: requiredProject,
      definitionId: z.coerce.number().min(1).describe("ID of the build definition to update."),
      definition: definitionParam,
    },
    async ({ project, definitionId, definition }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const updated = await buildApi.updateDefinition(definition as BuildDefinition, project, definitionId);
        return jsonResult(updated);
      } catch (error) {
        return toolError(`updating build definition ${definitionId}`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_list_retention_leases,
    "List the retention leases that keep runs from being deleted by retention policies. Azure DevOps adds its own leases (owners 'Pipeline:<id>', 'Branch:…', 'Build:…'); leases added by people usually have the owner 'User:<id>'. Filter by pipeline, run or owner.",
    {
      project: requiredProject,
      definitionId: z.coerce.number().min(1).optional().describe("Only leases on runs of this pipeline (build definition)."),
      runId: z.coerce.number().min(1).optional().describe("Only leases on this run (build ID)."),
      ownerId: z.string().optional().describe("Only leases with exactly this owner, e.g. 'User:<identity GUID>' or 'Pipeline:12'."),
      buildId: z.coerce.number().min(1).optional().describe("Every lease that applies to this build, whoever owns it. The other filters are ignored when this is given."),
    },
    async ({ project, definitionId, runId, ownerId, buildId }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const leases = buildId !== undefined ? await buildApi.getRetentionLeasesForBuild(project, buildId) : await buildApi.getRetentionLeasesByOwnerId(project, ownerId, definitionId, runId);
        return jsonResult(leases);
      } catch (error) {
        return toolError("listing retention leases", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_add_retention_lease,
    "Keep a run from being deleted by retention policies for a number of days, e.g. a release that must stay auditable. The same run can hold several leases; it is kept while any of them is valid.",
    {
      project: requiredProject,
      definitionId: z.coerce.number().min(1).describe("ID of the pipeline (build definition) the run belongs to."),
      runId: z.coerce.number().min(1).describe("ID of the run (build ID) to retain."),
      ownerId: z.string().describe("Who holds the lease, used to find and remove it later. By convention 'User:<identity GUID>' for a person; any string is accepted."),
      daysValid: z.coerce.number().min(1).describe("How many days to keep the run. 36500 keeps it effectively forever, as 'Retain' in the web UI does."),
      protectPipeline: z.boolean().default(false).describe("Also stop the pipeline itself from being deleted while this lease is valid."),
    },
    async ({ project, definitionId, runId, ownerId, daysValid, protectPipeline }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const leases = await buildApi.addRetentionLeases([{ definitionId, runId, ownerId, daysValid, protectPipeline }], project);
        return jsonResult(leases);
      } catch (error) {
        return toolError(`adding a retention lease on run ${runId}`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_update_retention_lease,
    "Change how long a retention lease lasts, counted from now, or whether it also protects the pipeline.",
    {
      project: requiredProject,
      leaseId: z.coerce.number().min(1).describe("ID of the lease, as listed by pipelines_list_retention_leases."),
      daysValid: z.coerce.number().min(1).optional().describe("New validity in days from now."),
      protectPipeline: z.boolean().optional().describe("Whether the lease also stops the pipeline from being deleted."),
    },
    async ({ project, leaseId, daysValid, protectPipeline }) => {
      if (daysValid === undefined && protectPipeline === undefined) {
        return { content: [{ type: "text", text: "Nothing to update: give daysValid, protectPipeline or both." }], isError: true };
      }
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const lease = await buildApi.updateRetentionLease({ daysValid, protectPipeline }, project, leaseId);
        return jsonResult(lease);
      } catch (error) {
        return toolError(`updating retention lease ${leaseId}`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_delete_retention_leases,
    "Delete retention leases. A run with no valid lease left becomes subject to retention policies and may be deleted with its logs and artifacts. Leases owned by Azure DevOps itself ('Pipeline:…', 'Branch:…', 'Build:…') can be deleted too, so check the owner first.",
    {
      project: requiredProject,
      leaseIds: z.array(z.coerce.number().min(1)).min(1).describe("IDs of the leases to delete."),
    },
    async ({ project, leaseIds }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        await buildApi.deleteRetentionLeasesById(project, leaseIds);
        return jsonResult({ deleted: leaseIds });
      } catch (error) {
        return toolError("deleting retention leases", error);
      }
    }
  );

  const folderPathParam = (purpose: string) => z.string().describe(`${purpose} Written as '\\infra\\docker'; 'infra/docker' is accepted too.`);

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_list_folders,
    "List the folders that pipelines are organized in.",
    {
      project: requiredProject,
      path: z.string().optional().describe("Only this folder and the folders below it, e.g. '\\infra'. Omit for all folders."),
      queryOrder: z
        .enum(getEnumKeys(FolderQueryOrder) as [string, ...string[]])
        .optional()
        .describe("Sort order of the folders."),
    },
    async ({ project, path, queryOrder }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const folders = await buildApi.getFolders(project, path === undefined ? undefined : folderPath(path), safeEnumConvert(FolderQueryOrder, queryOrder));
        return jsonResult(folders);
      } catch (error) {
        return toolError("listing pipeline folders", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_create_folder,
    "Create a pipeline folder. Move a pipeline into it by changing the path of its definition with pipelines_update_build_definition.",
    {
      project: requiredProject,
      path: folderPathParam("Full path of the new folder."),
      description: z.string().optional().describe("Description of the folder."),
    },
    async ({ project, path, description }) => {
      const fullPath = folderPath(path);
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const folder = await buildApi.createFolder({ path: fullPath, description }, project, fullPath);
        return jsonResult(folder);
      } catch (error) {
        return toolError(`creating pipeline folder '${fullPath}'`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_update_folder,
    "Rename or move a pipeline folder, or change its description. The pipelines and subfolders inside move with it.",
    {
      project: requiredProject,
      path: folderPathParam("Current full path of the folder."),
      newPath: z.string().optional().describe("New full path, e.g. '\\platform\\docker'. Omit to keep the folder where it is."),
      description: z.string().optional().describe("New description of the folder."),
    },
    async ({ project, path, newPath, description }) => {
      const fullPath = folderPath(path);
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const folder = await buildApi.updateFolder({ path: newPath === undefined ? fullPath : folderPath(newPath), description }, project, fullPath);
        return jsonResult(folder);
      } catch (error) {
        return toolError(`updating pipeline folder '${fullPath}'`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_delete_folder,
    "Delete a pipeline folder together with everything in it: its subfolders, every pipeline definition inside and all their runs. To keep the pipelines, move them out first by changing their path with pipelines_update_build_definition.",
    {
      project: requiredProject,
      path: folderPathParam("Full path of the folder to delete. The root folder '\\' cannot be deleted."),
    },
    async ({ project, path }) => {
      const fullPath = folderPath(path);
      if (fullPath === "\\") {
        return { content: [{ type: "text", text: "The root folder '\\' cannot be deleted." }], isError: true };
      }
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        await buildApi.deleteFolder(project, fullPath);
        return jsonResult({ deleted: fullPath });
      } catch (error) {
        return toolError(`deleting pipeline folder '${fullPath}'`, error);
      }
    }
  );

  // --------------------------------------------------------- builds, definitions ---

  const buildIdParam = z.coerce.number().min(1).describe("The ID of the build (run).");
  const definitionIdParam = z.coerce.number().min(1).describe("The ID of the build definition (pipeline).");

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_delete_build,
    "Delete a build with its logs, artifacts and test results. A build held by a retention lease cannot be deleted until the lease is removed.",
    { project: requiredProject, buildId: buildIdParam },
    async ({ project, buildId }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        await buildApi.deleteBuild(project, buildId);
        return jsonResult({ deleted: buildId });
      } catch (error) {
        return toolError(`deleting build ${buildId}`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_latest_build,
    "Get the most recent build of a pipeline, optionally on one branch — the quickest way to answer 'is main green?'.",
    {
      project: requiredProject,
      definition: z.string().describe("The pipeline's ID or name."),
      branchName: z.string().optional().describe("Only builds of this branch, e.g. 'refs/heads/main'."),
    },
    async ({ project, definition, branchName }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const build = await buildApi.getLatestBuild(project, definition, branchName);
        if (!build) {
          return { content: [{ type: "text", text: `No build found for pipeline '${definition}'${branchName ? ` on ${branchName}` : ""}` }], isError: true };
        }
        return jsonResult(build);
      } catch (error) {
        return toolError(`getting the latest build of '${definition}'`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build_work_items,
    "List the work items associated with a build, or — with fromBuildId — every work item associated with the builds between two builds of a pipeline, which is what went into a release. Fetch their fields with wit_get_work_items_batch_by_ids.",
    {
      project: requiredProject,
      buildId: z.coerce.number().min(1).describe("The build to report on; with fromBuildId, the later of the two."),
      fromBuildId: z.coerce.number().min(1).optional().describe("The earlier build. Omit for the work items of buildId alone."),
      top: z.coerce.number().min(1).optional().describe("Maximum number of work items to return."),
    },
    async ({ project, buildId, fromBuildId, top }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const refs = fromBuildId !== undefined ? await buildApi.getWorkItemsBetweenBuilds(project, fromBuildId, buildId, top) : await buildApi.getBuildWorkItemsRefs(project, buildId, top);
        return jsonResult((refs ?? []).map((ref) => ({ id: ref.id, url: ref.url })));
      } catch (error) {
        return toolError(`listing work items of build ${buildId}`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_changes_between_builds,
    "List the source changes (commits) between two builds of the same pipeline — what changed from one run to the next.",
    {
      project: requiredProject,
      fromBuildId: z.coerce.number().min(1).describe("The earlier build."),
      toBuildId: z.coerce.number().min(1).describe("The later build."),
      top: z.coerce.number().min(1).optional().describe("Maximum number of changes to return."),
    },
    async ({ project, fromBuildId, toBuildId, top }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        return jsonResult(await buildApi.getChangesBetweenBuilds(project, fromBuildId, toBuildId, top));
      } catch (error) {
        return toolError(`listing changes between builds ${fromBuildId} and ${toBuildId}`, error);
      }
    }
  );

  registerTool(server, PIPELINE_TOOLS.pipelines_list_project_build_tags, "List every tag used on builds in a project.", { project: requiredProject }, async ({ project }) => {
    try {
      const connection = await connectionProvider();
      const buildApi = await connection.getBuildApi();
      return jsonResult((await buildApi.getTags(project)) ?? []);
    } catch (error) {
      return toolError("listing build tags", error);
    }
  });

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_delete_build_definition,
    "Delete a pipeline (build definition) together with all of its builds. It can be restored with pipelines_restore_build_definition for a while afterwards.",
    { project: requiredProject, definitionId: definitionIdParam },
    async ({ project, definitionId }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        await buildApi.deleteDefinition(project, definitionId);
        return jsonResult({ deleted: definitionId });
      } catch (error) {
        return toolError(`deleting build definition ${definitionId}`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_restore_build_definition,
    "Restore a deleted pipeline (build definition).",
    { project: requiredProject, definitionId: definitionIdParam },
    async ({ project, definitionId }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        return jsonResult(await buildApi.restoreDefinition(project, definitionId, false));
      } catch (error) {
        return toolError(`restoring build definition ${definitionId}`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build_definition_yaml,
    "Export a classic (designer) build definition as YAML, as a starting point for converting it to a YAML pipeline. A pipeline that is already YAML has nothing to export — read its file with repo_get_file_content.",
    {
      project: requiredProject,
      definitionId: definitionIdParam,
      revision: z.coerce.number().min(1).optional().describe("Export this revision instead of the latest."),
    },
    async ({ project, definitionId, revision }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const exported = await buildApi.getDefinitionYaml(project, definitionId, revision);
        if (!exported?.yaml) {
          return { content: [{ type: "text", text: `Build definition ${definitionId} has no YAML to export; a YAML pipeline keeps its definition in a file of the repository.` }], isError: true };
        }
        return { content: [{ type: "text", text: exported.yaml }] };
      } catch (error) {
        return toolError(`exporting build definition ${definitionId} as YAML`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_definition_tags,
    "List the tags on a pipeline (build definition), which help group pipelines; they are separate from the tags on individual builds.",
    {
      project: requiredProject,
      definitionId: definitionIdParam,
      revision: z.coerce.number().min(1).optional().describe("The tags as of this revision."),
    },
    async ({ project, definitionId, revision }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        return jsonResult((await buildApi.getDefinitionTags(project, definitionId, revision)) ?? []);
      } catch (error) {
        return toolError(`listing tags of build definition ${definitionId}`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_add_definition_tags,
    "Add tags to a pipeline (build definition). Returns its full tag list.",
    {
      project: requiredProject,
      definitionId: definitionIdParam,
      tags: z.array(z.string()).min(1).describe("The tags to add."),
    },
    async ({ project, definitionId, tags }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        return jsonResult(await buildApi.addDefinitionTags(tags, project, definitionId));
      } catch (error) {
        return toolError(`tagging build definition ${definitionId}`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_delete_definition_tag,
    "Remove a tag from a pipeline (build definition). Returns its remaining tags.",
    {
      project: requiredProject,
      definitionId: definitionIdParam,
      tag: z.string().describe("The tag to remove."),
    },
    async ({ project, definitionId, tag }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        return jsonResult(await buildApi.deleteDefinitionTag(project, definitionId, tag));
      } catch (error) {
        return toolError(`removing tag '${tag}' from build definition ${definitionId}`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_build_metrics,
    "Get build counts for a pipeline or a whole project: builds queued and running now, and succeeded, failed, partially succeeded and canceled builds per period. For trends and pass rates over time, analytics_query is more flexible.",
    {
      project: requiredProject,
      definitionId: z.coerce.number().min(1).optional().describe("One pipeline. Omit for the whole project."),
      aggregation: z.enum(["hourly", "daily"]).default("daily").describe("Project metrics only: the period the counts are grouped by."),
      minMetricsTime: z.coerce.date().optional().describe("Only metrics from this date on."),
    },
    async ({ project, definitionId, aggregation, minMetricsTime }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        const metrics =
          definitionId !== undefined ? await buildApi.getDefinitionMetrics(project, definitionId, minMetricsTime) : await buildApi.getProjectMetrics(project, aggregation, minMetricsTime);
        return jsonResult(metrics);
      } catch (error) {
        return toolError("getting build metrics", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_list_definition_resources,
    "List the protected resources a pipeline is authorized to use — service connections ('endpoint'), agent queues ('queue'), variable groups ('variablegroup'), secure files ('securefile') — and whether each is authorized. A run that waits for 'permission needed' is missing one of these.",
    { project: requiredProject, definitionId: definitionIdParam },
    async ({ project, definitionId }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        return jsonResult(await buildApi.getDefinitionResources(project, definitionId));
      } catch (error) {
        return toolError(`listing resources of build definition ${definitionId}`, error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_authorize_definition_resources,
    "Authorize a pipeline to use protected resources, or withdraw the authorization. The caller needs administrative rights on each resource.",
    {
      project: requiredProject,
      definitionId: definitionIdParam,
      resources: z
        .array(
          z.object({
            type: z.enum(["endpoint", "queue", "variablegroup", "securefile", "environment", "repository"]).describe("The kind of resource."),
            id: z.string().describe("The resource ID, e.g. the service connection GUID or the queue ID."),
            authorized: z.boolean().default(true).describe("true to authorize, false to withdraw."),
          })
        )
        .min(1)
        .describe("The resources to change."),
    },
    async ({ project, definitionId, resources }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        return jsonResult(await buildApi.authorizeDefinitionResources(resources, project, definitionId));
      } catch (error) {
        return toolError(`authorizing resources for build definition ${definitionId}`, error);
      }
    }
  );

  // ---------------------------------------------------------------- settings ---

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_retention_settings,
    "Get a project's pipeline retention settings: how many days runs, artifacts and pull request runs are kept, and how many recent runs per protected branch are always kept — each with its allowed minimum and maximum.",
    { project: requiredProject },
    async ({ project }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        return jsonResult(await buildApi.getRetentionSettings(project));
      } catch (error) {
        return toolError("getting retention settings", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_update_retention_settings,
    "Change a project's pipeline retention settings. Only the values you pass change; each must lie within the minimum and maximum pipelines_get_retention_settings reports. Shorter retention deletes older runs at the next cleanup.",
    {
      project: requiredProject,
      runRetentionDays: z.coerce.number().min(1).optional().describe("Days to keep runs."),
      artifactsRetentionDays: z.coerce.number().min(1).optional().describe("Days to keep artifacts, symbols and attachments."),
      pullRequestRunRetentionDays: z.coerce.number().min(1).optional().describe("Days to keep pull request runs."),
      retainRunsPerProtectedBranch: z.coerce.number().min(0).optional().describe("Number of recent runs always kept per protected branch."),
    },
    async ({ project, runRetentionDays, artifactsRetentionDays, pullRequestRunRetentionDays, retainRunsPerProtectedBranch }) => {
      const value = (n: number | undefined) => (n === undefined ? undefined : { value: n });
      const update = {
        runRetention: value(runRetentionDays),
        artifactsRetention: value(artifactsRetentionDays),
        pullRequestRunRetention: value(pullRequestRunRetentionDays),
        retainRunsPerProtectedBranch: value(retainRunsPerProtectedBranch),
      };
      if (Object.values(update).every((entry) => entry === undefined)) {
        return { content: [{ type: "text", text: "Nothing to update: give at least one retention value." }], isError: true };
      }
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        return jsonResult(await buildApi.updateRetentionSettings(update, project));
      } catch (error) {
        return toolError("updating retention settings", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_get_general_settings,
    "Get a project's pipeline security settings: whether classic pipelines may be created, job authorization scope limits, fork build protections, settable-variable enforcement and shell argument sanitizing.",
    { project: requiredProject },
    async ({ project }) => {
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        return jsonResult(await buildApi.getBuildGeneralSettings(project));
      } catch (error) {
        return toolError("getting pipeline general settings", error);
      }
    }
  );

  registerTool(
    server,
    PIPELINE_TOOLS.pipelines_update_general_settings,
    "Change a project's pipeline security settings. Only the settings you pass change. Several of them tighten what running pipelines may do, so builds that relied on the looser setting can start failing.",
    {
      project: requiredProject,
      settings: z
        .record(z.string(), z.boolean())
        .describe('Settings to change, by the names pipelines_get_general_settings returns, e.g. { "enforceJobAuthScope": true, "disableClassicBuildPipelineCreation": true }.'),
    },
    async ({ project, settings }) => {
      if (Object.keys(settings).length === 0) {
        return { content: [{ type: "text", text: "Nothing to update: give at least one setting." }], isError: true };
      }
      try {
        const connection = await connectionProvider();
        const buildApi = await connection.getBuildApi();
        return jsonResult(await buildApi.updateBuildGeneralSettings(settings, project));
      } catch (error) {
        return toolError("updating pipeline general settings", error);
      }
    }
  );
}

export { PIPELINE_TOOLS, configurePipelineTools };

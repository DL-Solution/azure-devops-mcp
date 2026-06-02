// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { TreeStructureGroup, TreeNodeStructureType, WorkItemClassificationNode } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";
import { CreatePlan, UpdatePlan, PlanType, TeamFieldValuesPatch, TeamSettingsDaysOffPatch } from "azure-devops-node-api/interfaces/WorkInterfaces.js";
import { elicitProject, elicitTeam } from "../shared/elicitations.js";

const WORK_TOOLS = {
  list_team_iterations: "work_list_team_iterations",
  list_iterations: "work_list_iterations",
  create_iterations: "work_create_iterations",
  assign_iterations: "work_assign_iterations",
  get_team_capacity: "work_get_team_capacity",
  update_team_capacity: "work_update_team_capacity",
  get_iteration_capacities: "work_get_iteration_capacities",
  get_team_settings: "work_get_team_settings",
  list_plans: "work_list_plans",
  get_plan: "work_get_plan",
  create_plan: "work_create_plan",
  update_plan: "work_update_plan",
  delete_plan: "work_delete_plan",
  list_areas: "work_list_areas",
  create_area: "work_create_area",
  update_area: "work_update_area",
  delete_area: "work_delete_area",
  update_iteration: "work_update_iteration",
  delete_iteration: "work_delete_iteration",
  set_team_area_paths: "work_set_team_area_paths",
  list_boards: "work_list_boards",
  get_board_columns: "work_get_board_columns",
  get_board_rows: "work_get_board_rows",
  get_backlog_configuration: "work_get_backlog_configuration",
  get_team_days_off: "work_get_team_days_off",
  set_team_days_off: "work_set_team_days_off",
};

function configureWorkTools(server: McpServer, _: () => Promise<string>, connectionProvider: () => Promise<WebApi>) {
  server.tool(
    WORK_TOOLS.list_team_iterations,
    "Retrieve a list of iterations for a specific team in a project. If a project or team is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      team: z.string().optional().describe("The name or ID of the Azure DevOps team. Reuse from prior context if already known. If not provided, a team selection prompt will be shown."),
      timeframe: z.enum(["current"]).optional().describe("The timeframe for which to retrieve iterations. Currently, only 'current' is supported."),
    },
    async ({ project, team, timeframe }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project to list team iterations for.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        let resolvedTeam = team;
        if (!resolvedTeam) {
          const result = await elicitTeam(server, connection, resolvedProject, "Select the Azure DevOps team to list iterations for.");
          if ("response" in result) return result.response;
          resolvedTeam = result.resolved;
        }

        const workApi = await connection.getWorkApi();
        const iterations = await workApi.getTeamIterations({ project: resolvedProject, team: resolvedTeam }, timeframe);

        if (!iterations) {
          return { content: [{ type: "text", text: "No iterations found" }], isError: true };
        }

        return {
          content: [
            { type: "text", text: `Project: ${resolvedProject}, Team: ${resolvedTeam}` },
            { type: "text", text: JSON.stringify(iterations, null, 2) },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching team iterations: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.create_iterations,
    "Create new iterations in a specified Azure DevOps project.",
    {
      project: z.string().describe("The name or ID of the Azure DevOps project."),
      iterations: z
        .array(
          z.object({
            iterationName: z.string().describe("The name of the iteration to create."),
            startDate: z.string().optional().describe("The start date of the iteration in ISO format (e.g., '2023-01-01T00:00:00Z'). Optional."),
            finishDate: z.string().optional().describe("The finish date of the iteration in ISO format (e.g., '2023-01-31T23:59:59Z'). Optional."),
          })
        )
        .describe("An array of iterations to create. Each iteration must have a name and can optionally have start and finish dates in ISO format."),
    },
    async ({ project, iterations }) => {
      try {
        const connection = await connectionProvider();
        const workItemTrackingApi = await connection.getWorkItemTrackingApi();
        const results = [];

        for (const { iterationName, startDate, finishDate } of iterations) {
          // Step 1: Create the iteration
          const iteration = await workItemTrackingApi.createOrUpdateClassificationNode(
            {
              name: iterationName,
              attributes: {
                startDate: startDate ? new Date(startDate) : undefined,
                finishDate: finishDate ? new Date(finishDate) : undefined,
              },
            },
            project,
            TreeStructureGroup.Iterations
          );

          if (iteration) {
            results.push(iteration);
          }
        }

        if (results.length === 0) {
          return { content: [{ type: "text", text: "No iterations were created" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error creating iterations: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.list_iterations,
    "List all iterations in a specified Azure DevOps project. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      depth: z.coerce.number().default(2).describe("Depth of children to fetch."),
      excludedIds: z.array(z.coerce.number().min(1)).optional().describe("An optional array of iteration IDs, and thier children, that should not be returned."),
    },
    async ({ project, depth, excludedIds: ids }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project to list iterations for.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workItemTrackingApi = await connection.getWorkItemTrackingApi();
        let results = [];

        if (depth === undefined) {
          depth = 1;
        }

        results = await workItemTrackingApi.getClassificationNodes(resolvedProject, [], depth);

        // Handle null or undefined results
        if (!results) {
          return { content: [{ type: "text", text: "No iterations were found" }], isError: true };
        }

        // Filter out items with structureType=0 (Area nodes), only keep structureType=1 (Iteration nodes)
        let filteredResults = results.filter((node) => node.structureType === TreeNodeStructureType.Iteration);

        // If specific IDs are provided, filter them out recursively (exclude matching nodes and their children)
        if (ids && ids.length > 0) {
          const filterOutIds = (nodes: WorkItemClassificationNode[]): WorkItemClassificationNode[] => {
            return nodes
              .filter((node) => !node.id || !ids.includes(node.id))
              .map((node) => {
                if (node.children && node.children.length > 0) {
                  return {
                    ...node,
                    children: filterOutIds(node.children),
                  };
                }
                return node;
              });
          };

          filteredResults = filterOutIds(filteredResults);
        }

        if (filteredResults.length === 0) {
          return { content: [{ type: "text", text: "No iterations were found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(filteredResults, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching iterations: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.assign_iterations,
    "Assign existing iterations to a specific team in a project.",
    {
      project: z.string().describe("The name or ID of the Azure DevOps project."),
      team: z.string().describe("The name or ID of the Azure DevOps team."),
      iterations: z
        .array(
          z.object({
            identifier: z.string().describe("The identifier of the iteration to assign."),
            path: z.string().describe("The path of the iteration to assign, e.g., 'Project/Iteration'."),
          })
        )
        .describe("An array of iterations to assign. Each iteration must have an identifier and a path."),
    },
    async ({ project, team, iterations }) => {
      try {
        const connection = await connectionProvider();
        const workApi = await connection.getWorkApi();
        const teamContext = { project, team };
        const results = [];

        for (const { identifier, path } of iterations) {
          const assignment = await workApi.postTeamIteration({ path: path, id: identifier }, teamContext);

          if (assignment) {
            results.push(assignment);
          }
        }

        if (results.length === 0) {
          return { content: [{ type: "text", text: "No iterations were assigned to the team" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error assigning iterations: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.get_team_capacity,
    "Get the team capacity of a specific team and iteration in a project. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or Id of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      team: z.string().describe("The name or Id of the Azure DevOps team. Reuse from prior context if already known."),
      iterationId: z.string().describe("The Iteration Id to get capacity for."),
    },
    async ({ project, team, iterationId }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project to get team capacity for.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workApi = await connection.getWorkApi();
        const teamContext = { project: resolvedProject, team };

        const rawResults = await workApi.getCapacitiesWithIdentityRefAndTotals(teamContext, iterationId);

        if (!rawResults || rawResults.teamMembers?.length === 0) {
          return { content: [{ type: "text", text: "No team capacity assigned to the team" }], isError: true };
        }

        // Remove unwanted fields from teamMember and url
        const simplifiedResults = {
          ...rawResults,
          teamMembers: (rawResults.teamMembers || []).map((member) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { url, ...rest } = member;
            return {
              ...rest,
              teamMember: member.teamMember
                ? {
                    displayName: member.teamMember.displayName,
                    id: member.teamMember.id,
                    uniqueName: member.teamMember.uniqueName,
                  }
                : undefined,
            };
          }),
        };

        return {
          content: [{ type: "text", text: JSON.stringify(simplifiedResults, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error getting team capacity: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.update_team_capacity,
    "Update the team capacity of a team member for a specific iteration in a project.",
    {
      project: z.string().describe("The name or Id of the Azure DevOps project."),
      team: z.string().describe("The name or Id of the Azure DevOps team."),
      teamMemberId: z.string().describe("The team member Id for the specific team member."),
      iterationId: z.string().describe("The Iteration Id to update the capacity for."),
      activities: z
        .array(
          z.object({
            name: z.string().describe("The name of the activity (e.g., 'Development')."),
            capacityPerDay: z.number().describe("The capacity per day for this activity."),
          })
        )
        .describe("Array of activities and their daily capacities for the team member."),
      daysOff: z
        .array(
          z.object({
            start: z.string().describe("Start date of the day off in ISO format."),
            end: z.string().describe("End date of the day off in ISO format."),
          })
        )
        .optional()
        .describe("Array of days off for the team member, each with a start and end date in ISO format."),
    },
    async ({ project, team, teamMemberId, iterationId, activities, daysOff }) => {
      try {
        const connection = await connectionProvider();
        const workApi = await connection.getWorkApi();
        const teamContext = { project, team };

        // Define interface for capacity patch
        interface CapacityPatch {
          activities: { name: string; capacityPerDay: number }[];
          daysOff?: { start: Date; end: Date }[];
        }

        // Prepare the capacity update object
        const capacityPatch: CapacityPatch = {
          activities: activities.map((a) => ({
            name: a.name,
            capacityPerDay: a.capacityPerDay,
          })),
          daysOff: (daysOff || []).map((d) => ({
            start: new Date(d.start),
            end: new Date(d.end),
          })),
        };

        // Update the team member's capacity
        const updatedCapacity = await workApi.updateCapacityWithIdentityRef(capacityPatch, teamContext, iterationId, teamMemberId);

        if (!updatedCapacity) {
          return { content: [{ type: "text", text: "Failed to update team member capacity" }], isError: true };
        }

        // Simplify output
        const simplifiedResult = {
          teamMember: updatedCapacity.teamMember
            ? {
                displayName: updatedCapacity.teamMember.displayName,
                id: updatedCapacity.teamMember.id,
                uniqueName: updatedCapacity.teamMember.uniqueName,
              }
            : undefined,
          activities: updatedCapacity.activities,
          daysOff: updatedCapacity.daysOff,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(simplifiedResult, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error updating team capacity: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.get_iteration_capacities,
    "Get an iteration's capacity for all teams in iteration and project. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or Id of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      iterationId: z.string().describe("The Iteration Id to get capacity for."),
    },
    async ({ project, iterationId }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project to get iteration capacities for.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workApi = await connection.getWorkApi();

        const rawResults = await workApi.getTotalIterationCapacities(resolvedProject, iterationId);

        if (!rawResults || !rawResults.teams || rawResults.teams.length === 0) {
          return { content: [{ type: "text", text: "No iteration capacity assigned to the teams" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(rawResults, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error getting iteration capacities: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.get_team_settings,
    "Get team settings including default iteration, backlog iteration, and default area path for a team. If a project or team is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      team: z.string().optional().describe("The name or ID of the Azure DevOps team. Reuse from prior context if already known. If not provided, a team selection prompt will be shown."),
    },
    async ({ project, team }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project to get team settings for.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        let resolvedTeam = team;
        if (!resolvedTeam) {
          const result = await elicitTeam(server, connection, resolvedProject, "Select the Azure DevOps team to get settings for.");
          if ("response" in result) return result.response;
          resolvedTeam = result.resolved;
        }

        const workApi = await connection.getWorkApi();
        const teamContext = { project: resolvedProject, team: resolvedTeam };

        const teamSettings = await workApi.getTeamSettings(teamContext);

        if (!teamSettings) {
          return { content: [{ type: "text", text: "No team settings found" }], isError: true };
        }

        const teamFieldValues = await workApi.getTeamFieldValues(teamContext);

        const result = {
          backlogIteration: teamSettings.backlogIteration,
          defaultIteration: teamSettings.defaultIteration,
          defaultIterationMacro: teamSettings.defaultIterationMacro,
          backlogVisibilities: teamSettings.backlogVisibilities,
          bugsBehavior: teamSettings.bugsBehavior,
          workingDays: teamSettings.workingDays,
          defaultAreaPath: teamFieldValues?.defaultValue,
          areaPathField: teamFieldValues?.field,
          areaPaths: teamFieldValues?.values,
        };

        return {
          content: [
            { type: "text", text: `Project: ${resolvedProject}, Team: ${resolvedTeam}` },
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching team settings: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.list_plans,
    "Retrieve a list of delivery plans for an Azure DevOps project. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
    },
    async ({ project }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project to list delivery plans for.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workApi = await connection.getWorkApi();
        const plans = await workApi.getPlans(resolvedProject);

        if (!plans || plans.length === 0) {
          return { content: [{ type: "text", text: "No delivery plans found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(plans, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching delivery plans: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.get_plan,
    "Retrieve a single delivery plan by ID for an Azure DevOps project. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      id: z.string().describe("The ID of the delivery plan to retrieve."),
    },
    async ({ project, id }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project to get the delivery plan from.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workApi = await connection.getWorkApi();
        const plan = await workApi.getPlan(resolvedProject, id);

        if (!plan) {
          return { content: [{ type: "text", text: `Delivery plan '${id}' not found` }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(plan, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching delivery plan: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.create_plan,
    "Create a new delivery plan in an Azure DevOps project. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      name: z.string().describe("The name of the delivery plan to create."),
      description: z.string().optional().describe("The description of the delivery plan."),
      properties: z.record(z.unknown()).optional().describe("Optional delivery plan properties (e.g., team backlog mappings, criteria). Provided as an object."),
    },
    async ({ project, name, description, properties }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project to create the delivery plan in.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workApi = await connection.getWorkApi();
        const postedPlan: CreatePlan = {
          name,
          description,
          type: PlanType.DeliveryTimelineView,
          properties,
        };

        const plan = await workApi.createPlan(postedPlan, resolvedProject);

        return {
          content: [{ type: "text", text: JSON.stringify(plan, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error creating delivery plan: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.update_plan,
    "Update an existing delivery plan in an Azure DevOps project. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      id: z.string().describe("The ID of the delivery plan to update."),
      revision: z.coerce.number().describe("The revision of the plan being updated. Must match the current revision returned by the server to avoid conflicts."),
      name: z.string().optional().describe("The new name of the delivery plan."),
      description: z.string().optional().describe("The new description of the delivery plan."),
      properties: z.record(z.unknown()).optional().describe("Optional delivery plan properties to update. Provided as an object."),
    },
    async ({ project, id, revision, name, description, properties }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project that contains the delivery plan.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workApi = await connection.getWorkApi();

        // updatePlan is a full replacement (PUT); merge the caller's changes onto the
        // existing plan so unspecified fields (e.g. properties/backlog mappings) are preserved.
        const existing = await workApi.getPlan(resolvedProject, id);
        if (!existing) {
          return { content: [{ type: "text", text: `Delivery plan '${id}' not found` }], isError: true };
        }

        const updatedPlan: UpdatePlan = {
          name: name ?? existing.name,
          description: description ?? existing.description,
          revision,
          type: existing.type ?? PlanType.DeliveryTimelineView,
          properties: properties ?? existing.properties,
        };

        const plan = await workApi.updatePlan(updatedPlan, resolvedProject, id);

        return {
          content: [{ type: "text", text: JSON.stringify(plan, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error updating delivery plan: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.delete_plan,
    "Permanently delete a delivery plan from an Azure DevOps project. This is a destructive operation. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      id: z.string().describe("The ID of the delivery plan to delete."),
    },
    async ({ project, id }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project that contains the delivery plan.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workApi = await connection.getWorkApi();
        await workApi.deletePlan(resolvedProject, id);

        return {
          content: [{ type: "text", text: `Delivery plan '${id}' deleted from project '${resolvedProject}'.` }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error deleting delivery plan: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.list_areas,
    "List the area paths for an Azure DevOps project. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      depth: z.coerce.number().default(2).describe("Depth of child area paths to fetch. Defaults to 2."),
    },
    async ({ project, depth }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project to list area paths for.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workItemTrackingApi = await connection.getWorkItemTrackingApi();
        const results = await workItemTrackingApi.getClassificationNodes(resolvedProject, [], depth);

        const areas = (results ?? []).filter((node) => node.structureType === TreeNodeStructureType.Area);

        if (areas.length === 0) {
          return { content: [{ type: "text", text: "No area paths found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(areas, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching area paths: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.create_area,
    "Create a new area path in an Azure DevOps project. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      name: z.string().describe("The name of the area path to create."),
      parentPath: z.string().optional().describe("The path of the parent area under which to create the new area (e.g. 'ParentArea/Child'). If omitted, the area is created at the project root."),
    },
    async ({ project, name, parentPath }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project to create the area path in.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workItemTrackingApi = await connection.getWorkItemTrackingApi();
        const area = await workItemTrackingApi.createOrUpdateClassificationNode({ name }, resolvedProject, TreeStructureGroup.Areas, parentPath);

        return {
          content: [{ type: "text", text: JSON.stringify(area, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error creating area path: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.update_area,
    "Rename an existing area path in an Azure DevOps project. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      path: z.string().describe("The current path of the area to rename (e.g. 'ParentArea/Child')."),
      name: z.string().describe("The new name for the area path."),
    },
    async ({ project, path, name }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project that contains the area path.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workItemTrackingApi = await connection.getWorkItemTrackingApi();
        const area = await workItemTrackingApi.updateClassificationNode({ name }, resolvedProject, TreeStructureGroup.Areas, path);

        return {
          content: [{ type: "text", text: JSON.stringify(area, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error updating area path: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.delete_area,
    "Permanently delete an area path from an Azure DevOps project. This is a destructive operation: work items assigned to the deleted area are reclassified to the area identified by reclassifyId. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      path: z.string().describe("The path of the area to delete (e.g. 'ParentArea/Child')."),
      reclassifyId: z.coerce.number().describe("The ID of the area path to which work items (and child nodes) currently under the deleted area will be reclassified."),
    },
    async ({ project, path, reclassifyId }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project that contains the area path.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workItemTrackingApi = await connection.getWorkItemTrackingApi();
        await workItemTrackingApi.deleteClassificationNode(resolvedProject, TreeStructureGroup.Areas, path, reclassifyId);

        return {
          content: [{ type: "text", text: `Area path '${path}' deleted from project '${resolvedProject}'. Work items reclassified to area ID ${reclassifyId}.` }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error deleting area path: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.update_iteration,
    "Update an existing iteration (rename and/or change its start/finish dates) in an Azure DevOps project. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      path: z.string().describe("The current path of the iteration to update (e.g. 'ParentIteration/Sprint 1')."),
      name: z.string().optional().describe("The new name for the iteration."),
      startDate: z.string().optional().describe("The start date of the iteration in ISO format (e.g., '2023-01-01T00:00:00Z')."),
      finishDate: z.string().optional().describe("The finish date of the iteration in ISO format (e.g., '2023-01-31T23:59:59Z')."),
    },
    async ({ project, path, name, startDate, finishDate }) => {
      try {
        if (name === undefined && startDate === undefined && finishDate === undefined) {
          return { content: [{ type: "text", text: "No updates provided. Specify at least one of: name, startDate, finishDate." }], isError: true };
        }

        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project that contains the iteration.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const node: WorkItemClassificationNode = { name };
        if (startDate !== undefined || finishDate !== undefined) {
          node.attributes = {
            startDate: startDate ? new Date(startDate) : undefined,
            finishDate: finishDate ? new Date(finishDate) : undefined,
          };
        }

        const workItemTrackingApi = await connection.getWorkItemTrackingApi();
        const iteration = await workItemTrackingApi.updateClassificationNode(node, resolvedProject, TreeStructureGroup.Iterations, path);

        return {
          content: [{ type: "text", text: JSON.stringify(iteration, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error updating iteration: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.delete_iteration,
    "Permanently delete an iteration from an Azure DevOps project. This is a destructive operation: work items assigned to the deleted iteration are reclassified to the iteration identified by reclassifyId. If a project is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      path: z.string().describe("The path of the iteration to delete (e.g. 'ParentIteration/Sprint 1')."),
      reclassifyId: z.coerce.number().describe("The ID of the iteration to which work items currently under the deleted iteration will be reclassified."),
    },
    async ({ project, path, reclassifyId }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project that contains the iteration.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        const workItemTrackingApi = await connection.getWorkItemTrackingApi();
        await workItemTrackingApi.deleteClassificationNode(resolvedProject, TreeStructureGroup.Iterations, path, reclassifyId);

        return {
          content: [{ type: "text", text: `Iteration '${path}' deleted from project '${resolvedProject}'. Work items reclassified to iteration ID ${reclassifyId}.` }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error deleting iteration: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.set_team_area_paths,
    "Set the area paths owned by a team in an Azure DevOps project (the default area path and/or the full list of area paths). If a project or team is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      team: z.string().optional().describe("The name or ID of the Azure DevOps team. Reuse from prior context if already known. If not provided, a team selection prompt will be shown."),
      defaultAreaPath: z.string().optional().describe("The team's default area path (new work items are assigned here). Must be one of the team's area paths."),
      areaPaths: z
        .array(
          z.object({
            path: z.string().describe("An area path owned by the team (e.g. 'Project\\\\Area\\\\SubArea')."),
            includeChildren: z.boolean().optional().describe("Whether work items under child area paths also belong to the team. Defaults to false."),
          })
        )
        .optional()
        .describe("The full set of area paths owned by the team. Replaces the existing set."),
    },
    async ({ project, team, defaultAreaPath, areaPaths }) => {
      try {
        if (defaultAreaPath === undefined && areaPaths === undefined) {
          return { content: [{ type: "text", text: "No updates provided. Specify at least one of: defaultAreaPath, areaPaths." }], isError: true };
        }

        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project that contains the team.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        let resolvedTeam = team;
        if (!resolvedTeam) {
          const result = await elicitTeam(server, connection, resolvedProject, "Select the Azure DevOps team to set area paths for.");
          if ("response" in result) return result.response;
          resolvedTeam = result.resolved;
        }

        const patch: TeamFieldValuesPatch = {
          defaultValue: defaultAreaPath,
          values: areaPaths?.map((a) => ({ value: a.path, includeChildren: a.includeChildren ?? false })),
        };

        const workApi = await connection.getWorkApi();
        const result = await workApi.updateTeamFieldValues(patch, { project: resolvedProject, team: resolvedTeam });

        return {
          content: [
            { type: "text", text: `Project: ${resolvedProject}, Team: ${resolvedTeam}` },
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error setting team area paths: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.list_boards,
    "List the boards for a team in an Azure DevOps project. If a project or team is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      team: z.string().optional().describe("The name or ID of the Azure DevOps team. Reuse from prior context if already known. If not provided, a team selection prompt will be shown."),
    },
    async ({ project, team }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project to list boards for.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        let resolvedTeam = team;
        if (!resolvedTeam) {
          const result = await elicitTeam(server, connection, resolvedProject, "Select the Azure DevOps team to list boards for.");
          if ("response" in result) return result.response;
          resolvedTeam = result.resolved;
        }

        const workApi = await connection.getWorkApi();
        const boards = await workApi.getBoards({ project: resolvedProject, team: resolvedTeam });

        if (!boards || boards.length === 0) {
          return { content: [{ type: "text", text: "No boards found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(boards, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching boards: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.get_board_columns,
    "Get the columns of a board for a team in an Azure DevOps project. If a project or team is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      team: z.string().optional().describe("The name or ID of the Azure DevOps team. Reuse from prior context if already known. If not provided, a team selection prompt will be shown."),
      board: z.string().describe("The name or ID of the board (e.g. 'Stories', 'Features')."),
    },
    async ({ project, team, board }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        let resolvedTeam = team;
        if (!resolvedTeam) {
          const result = await elicitTeam(server, connection, resolvedProject, "Select the Azure DevOps team.");
          if ("response" in result) return result.response;
          resolvedTeam = result.resolved;
        }

        const workApi = await connection.getWorkApi();
        const columns = await workApi.getBoardColumns({ project: resolvedProject, team: resolvedTeam }, board);

        if (!columns || columns.length === 0) {
          return { content: [{ type: "text", text: "No board columns found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(columns, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching board columns: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.get_board_rows,
    "Get the rows (swimlanes) of a board for a team in an Azure DevOps project. If a project or team is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      team: z.string().optional().describe("The name or ID of the Azure DevOps team. Reuse from prior context if already known. If not provided, a team selection prompt will be shown."),
      board: z.string().describe("The name or ID of the board (e.g. 'Stories', 'Features')."),
    },
    async ({ project, team, board }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        let resolvedTeam = team;
        if (!resolvedTeam) {
          const result = await elicitTeam(server, connection, resolvedProject, "Select the Azure DevOps team.");
          if ("response" in result) return result.response;
          resolvedTeam = result.resolved;
        }

        const workApi = await connection.getWorkApi();
        const rows = await workApi.getBoardRows({ project: resolvedProject, team: resolvedTeam }, board);

        if (!rows || rows.length === 0) {
          return { content: [{ type: "text", text: "No board rows found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching board rows: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.get_backlog_configuration,
    "Get the backlog configuration (portfolio/requirement/task backlogs and their work item types) for a team. If a project or team is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      team: z.string().optional().describe("The name or ID of the Azure DevOps team. Reuse from prior context if already known. If not provided, a team selection prompt will be shown."),
    },
    async ({ project, team }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        let resolvedTeam = team;
        if (!resolvedTeam) {
          const result = await elicitTeam(server, connection, resolvedProject, "Select the Azure DevOps team.");
          if ("response" in result) return result.response;
          resolvedTeam = result.resolved;
        }

        const workApi = await connection.getWorkApi();
        const config = await workApi.getBacklogConfigurations({ project: resolvedProject, team: resolvedTeam });

        return {
          content: [{ type: "text", text: JSON.stringify(config, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching backlog configuration: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.get_team_days_off,
    "Get a team's days off for a specific iteration. If a project or team is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      team: z.string().optional().describe("The name or ID of the Azure DevOps team. Reuse from prior context if already known. If not provided, a team selection prompt will be shown."),
      iterationId: z.string().describe("The ID of the iteration to get days off for."),
    },
    async ({ project, team, iterationId }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        let resolvedTeam = team;
        if (!resolvedTeam) {
          const result = await elicitTeam(server, connection, resolvedProject, "Select the Azure DevOps team.");
          if ("response" in result) return result.response;
          resolvedTeam = result.resolved;
        }

        const workApi = await connection.getWorkApi();
        const daysOff = await workApi.getTeamDaysOff({ project: resolvedProject, team: resolvedTeam }, iterationId);

        return {
          content: [{ type: "text", text: JSON.stringify(daysOff, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching team days off: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.set_team_days_off,
    "Set a team's days off for a specific iteration (replaces the existing set). If a project or team is not specified, you will be prompted to select one.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project. Reuse from prior context if already known. If not provided, a project selection prompt will be shown."),
      team: z.string().optional().describe("The name or ID of the Azure DevOps team. Reuse from prior context if already known. If not provided, a team selection prompt will be shown."),
      iterationId: z.string().describe("The ID of the iteration to set days off for."),
      daysOff: z
        .array(
          z.object({
            start: z.string().describe("Start date in ISO format (e.g. '2023-01-02T00:00:00Z')."),
            end: z.string().describe("End date in ISO format (e.g. '2023-01-03T00:00:00Z')."),
          })
        )
        .describe("The full set of day-off ranges for the team in this iteration. Replaces the existing set; pass an empty array to clear."),
    },
    async ({ project, team, iterationId, daysOff }) => {
      try {
        const connection = await connectionProvider();

        let resolvedProject = project;
        if (!resolvedProject) {
          const result = await elicitProject(server, connection, "Select the Azure DevOps project.");
          if ("response" in result) return result.response;
          resolvedProject = result.resolved;
        }

        let resolvedTeam = team;
        if (!resolvedTeam) {
          const result = await elicitTeam(server, connection, resolvedProject, "Select the Azure DevOps team.");
          if ("response" in result) return result.response;
          resolvedTeam = result.resolved;
        }

        const patch: TeamSettingsDaysOffPatch = {
          daysOff: daysOff.map((d) => ({ start: new Date(d.start), end: new Date(d.end) })),
        };

        const workApi = await connection.getWorkApi();
        const result = await workApi.updateTeamDaysOff(patch, { project: resolvedProject, team: resolvedTeam }, iterationId);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error setting team days off: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );
}

export { WORK_TOOLS, configureWorkTools };

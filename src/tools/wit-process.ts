// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { GetProcessExpandLevel, GetWorkItemTypeExpand } from "azure-devops-node-api/interfaces/WorkItemTrackingProcessInterfaces.js";

const WIT_PROCESS_TOOLS = {
  list_processes: "witprocess_list_processes",
  get_process: "witprocess_get_process",
  list_work_item_types: "witprocess_list_work_item_types",
  get_work_item_type: "witprocess_get_work_item_type",
  list_work_item_type_fields: "witprocess_list_work_item_type_fields",
  list_states: "witprocess_list_states",
  get_state: "witprocess_get_state",
  list_behaviors: "witprocess_list_behaviors",
  get_behavior: "witprocess_get_behavior",
};

const WORK_ITEM_TYPE_EXPAND_MAP: Record<string, GetWorkItemTypeExpand> = {
  none: GetWorkItemTypeExpand.None,
  states: GetWorkItemTypeExpand.States,
  behaviors: GetWorkItemTypeExpand.Behaviors,
  layout: GetWorkItemTypeExpand.Layout,
};

function configureWitProcessTools(server: McpServer, _: () => Promise<string>, connectionProvider: () => Promise<WebApi>) {
  registerTool(
    server,
    WIT_PROCESS_TOOLS.list_processes,
    "List the processes (e.g. Agile, Scrum, Basic and inherited processes) in the organization.",
    {
      includeProjects: z.boolean().optional().describe("Whether to include the projects using each process. Defaults to false."),
    },
    async ({ includeProjects }) => {
      try {
        const connection = await connectionProvider();
        const processApi = await connection.getWorkItemTrackingProcessApi();
        const processes = await processApi.getListOfProcesses(includeProjects ? GetProcessExpandLevel.Projects : undefined);

        if (!processes || processes.length === 0) {
          return { content: [{ type: "text", text: "No processes found" }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(processes, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching processes: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    WIT_PROCESS_TOOLS.get_process,
    "Get a specific process by its type ID.",
    {
      processTypeId: z.string().describe("The type ID (GUID) of the process. Use witprocess_list_processes to discover IDs."),
      includeProjects: z.boolean().optional().describe("Whether to include the projects using the process. Defaults to false."),
    },
    async ({ processTypeId, includeProjects }) => {
      try {
        const connection = await connectionProvider();
        const processApi = await connection.getWorkItemTrackingProcessApi();
        const process = await processApi.getProcessByItsId(processTypeId, includeProjects ? GetProcessExpandLevel.Projects : undefined);

        return { content: [{ type: "text", text: JSON.stringify(process, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching process: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    WIT_PROCESS_TOOLS.list_work_item_types,
    "List the work item types defined in a process.",
    {
      processId: z.string().describe("The ID (GUID) of the process."),
      expand: z.enum(["none", "states", "behaviors", "layout"]).optional().describe("Optional detail to expand for each work item type."),
    },
    async ({ processId, expand }) => {
      try {
        const connection = await connectionProvider();
        const processApi = await connection.getWorkItemTrackingProcessApi();
        const workItemTypes = await processApi.getProcessWorkItemTypes(processId, expand ? WORK_ITEM_TYPE_EXPAND_MAP[expand] : undefined);

        if (!workItemTypes || workItemTypes.length === 0) {
          return { content: [{ type: "text", text: "No work item types found" }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(workItemTypes, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching work item types: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    WIT_PROCESS_TOOLS.get_work_item_type,
    "Get a specific work item type in a process by its reference name.",
    {
      processId: z.string().describe("The ID (GUID) of the process."),
      witRefName: z.string().describe("The reference name of the work item type (e.g. 'Agile.UserStory' or 'Microsoft.VSTS.WorkItemTypes.Bug')."),
      expand: z.enum(["none", "states", "behaviors", "layout"]).optional().describe("Optional detail to expand for the work item type."),
    },
    async ({ processId, witRefName, expand }) => {
      try {
        const connection = await connectionProvider();
        const processApi = await connection.getWorkItemTrackingProcessApi();
        const workItemType = await processApi.getProcessWorkItemType(processId, witRefName, expand ? WORK_ITEM_TYPE_EXPAND_MAP[expand] : undefined);

        return { content: [{ type: "text", text: JSON.stringify(workItemType, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching work item type: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    WIT_PROCESS_TOOLS.list_work_item_type_fields,
    "List the fields of a work item type in a process.",
    {
      processId: z.string().describe("The ID (GUID) of the process."),
      witRefName: z.string().describe("The reference name of the work item type."),
    },
    async ({ processId, witRefName }) => {
      try {
        const connection = await connectionProvider();
        const processApi = await connection.getWorkItemTrackingProcessApi();
        const fields = await processApi.getAllWorkItemTypeFields(processId, witRefName);

        if (!fields || fields.length === 0) {
          return { content: [{ type: "text", text: "No fields found" }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(fields, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching work item type fields: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    WIT_PROCESS_TOOLS.list_states,
    "List the state definitions of a work item type in a process.",
    {
      processId: z.string().describe("The ID (GUID) of the process."),
      witRefName: z.string().describe("The reference name of the work item type."),
    },
    async ({ processId, witRefName }) => {
      try {
        const connection = await connectionProvider();
        const processApi = await connection.getWorkItemTrackingProcessApi();
        const states = await processApi.getStateDefinitions(processId, witRefName);

        if (!states || states.length === 0) {
          return { content: [{ type: "text", text: "No state definitions found" }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(states, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching state definitions: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    WIT_PROCESS_TOOLS.get_state,
    "Get a specific state definition of a work item type in a process.",
    {
      processId: z.string().describe("The ID (GUID) of the process."),
      witRefName: z.string().describe("The reference name of the work item type."),
      stateId: z.string().describe("The ID of the state definition."),
    },
    async ({ processId, witRefName, stateId }) => {
      try {
        const connection = await connectionProvider();
        const processApi = await connection.getWorkItemTrackingProcessApi();
        const state = await processApi.getStateDefinition(processId, witRefName, stateId);

        return { content: [{ type: "text", text: JSON.stringify(state, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching state definition: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    WIT_PROCESS_TOOLS.list_behaviors,
    "List the behaviors defined in a process.",
    {
      processId: z.string().describe("The ID (GUID) of the process."),
    },
    async ({ processId }) => {
      try {
        const connection = await connectionProvider();
        const processApi = await connection.getWorkItemTrackingProcessApi();
        const behaviors = await processApi.getProcessBehaviors(processId);

        if (!behaviors || behaviors.length === 0) {
          return { content: [{ type: "text", text: "No behaviors found" }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(behaviors, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching behaviors: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    WIT_PROCESS_TOOLS.get_behavior,
    "Get a specific behavior in a process by its reference name.",
    {
      processId: z.string().describe("The ID (GUID) of the process."),
      behaviorRefName: z.string().describe("The reference name of the behavior."),
    },
    async ({ processId, behaviorRefName }) => {
      try {
        const connection = await connectionProvider();
        const processApi = await connection.getWorkItemTrackingProcessApi();
        const behavior = await processApi.getProcessBehavior(processId, behaviorRefName);

        return { content: [{ type: "text", text: JSON.stringify(behavior, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching behavior: ${errorMessage}` }], isError: true };
      }
    }
  );
}

export { WIT_PROCESS_TOOLS, configureWitProcessTools };

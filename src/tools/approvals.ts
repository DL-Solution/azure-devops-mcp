// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch } from "../shared/ado-rest.js";
import { requiredProject } from "../shared/common-params.js";

const APPROVALS_TOOLS = {
  list: "approvals_list",
  get: "approvals_get",
  update: "approvals_update",
  list_check_configurations: "approvals_list_check_configurations",
  get_check_configuration: "approvals_get_check_configuration",
  add_check_configuration: "approvals_add_check_configuration",
  update_check_configuration: "approvals_update_check_configuration",
  delete_check_configuration: "approvals_delete_check_configuration",
  get_check_run: "approvals_get_check_run",
  get_pipeline_permissions: "approvals_get_pipeline_permissions",
  set_pipeline_permissions: "approvals_set_pipeline_permissions",
};

// Check configurations and pipeline permissions are served on 7.1-preview.1.
const checksApiVersion = "7.1-preview.1";

// Protected resources that checks and pipeline permissions attach to.
const RESOURCE_TYPES = ["environment", "endpoint", "queue", "variablegroup", "securefile", "repository"] as const;

// The Approvals and Checks area is preview-only; 7.2-preview.2 is the current
// revision for both the query and the update operations.
const approvalsApiVersion = "7.2-preview.2";

const approvalStatuses = ["pending", "approved", "rejected", "skipped", "canceled", "timedOut", "deferred", "uninitiated", "all"] as const;

function configureApprovalsTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  async function request(project: string, pathAndQuery: string, method: string, body?: unknown): Promise<Response> {
    const connection = await connectionProvider();
    const token = await tokenProvider();
    const baseUrl = connection.serverUrl.replace(/\/$/, "");
    return adoFetch({
      url: `${baseUrl}/${encodeURIComponent(project)}/_apis/pipelines/${pathAndQuery}`,
      method,
      token,
      userAgent: userAgentProvider(),
      body,
    });
  }

  registerTool(
    server,
    APPROVALS_TOOLS.list,
    "List approvals of YAML pipeline stages, e.g. the pending approvals waiting on a user or on a protected resource. These are the approvals of multi-stage YAML pipelines; classic release approvals are handled by the release tools instead.",
    {
      project: requiredProject,
      approvalIds: z.array(z.string()).optional().describe("Only return these approval IDs (GUIDs)."),
      assignedTo: z.array(z.string()).optional().describe("Only return approvals assigned to these users. Accepts user IDs, descriptors or emails."),
      state: z.enum(approvalStatuses).optional().describe("Only return approvals in this state. Returns approvals of any status when omitted."),
      top: z.coerce.number().optional().describe("Maximum number of approvals to return."),
      expand: z.enum(["none", "steps", "permissions"]).optional().describe("Include extra details: 'steps' adds the individual approval steps, 'permissions' adds the current user's permissions."),
    },
    async ({ project, approvalIds, assignedTo, state, top, expand }) => {
      try {
        const params = new URLSearchParams({ "api-version": approvalsApiVersion });
        if (approvalIds?.length) params.append("approvalIds", approvalIds.join(","));
        if (assignedTo?.length) params.append("assignedTo", assignedTo.join(","));
        if (state) params.append("state", state);
        if (top !== undefined) params.append("top", String(top));
        if (expand) params.append("$expand", expand);

        const response = await request(project, `approvals?${params.toString()}`, "GET");
        if (!response.ok) {
          throw new Error(`Failed to list approvals (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing approvals: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    APPROVALS_TOOLS.get,
    "Get a single pipeline approval by its ID, including who it is assigned to and the instructions shown to the approvers.",
    {
      project: requiredProject,
      approvalId: z.string().describe("The ID (GUID) of the approval."),
      expand: z.enum(["none", "steps", "permissions"]).optional().describe("Include extra details: 'steps' adds the individual approval steps, 'permissions' adds the current user's permissions."),
    },
    async ({ project, approvalId, expand }) => {
      try {
        const params = new URLSearchParams({ "api-version": approvalsApiVersion });
        if (expand) params.append("$expand", expand);

        const response = await request(project, `approvals/${encodeURIComponent(approvalId)}?${params.toString()}`, "GET");
        if (response.status === 404) {
          return { content: [{ type: "text", text: `Approval '${approvalId}' not found` }], isError: true };
        }
        if (!response.ok) {
          throw new Error(`Failed to get approval (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching approval: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    APPROVALS_TOOLS.update,
    "Act on a pipeline approval: approve, reject, defer or reassign it. The caller must be an assigned approver; the API answers with the updated approval, whose status stays 'pending' while other approvers are still required.",
    {
      project: requiredProject,
      approvalId: z.string().describe("The ID (GUID) of the approval to act on."),
      status: z.enum(["approved", "rejected", "deferred", "pending"]).describe("The new status of the approval."),
      comment: z.string().optional().describe("Comment recorded with the decision."),
      deferredTo: z.string().optional().describe("Date (ISO 8601, UTC) the approval is deferred to. Only meaningful when status is 'deferred'."),
      reassignTo: z.string().optional().describe("Identity ID of the user to reassign the approval to."),
    },
    async ({ project, approvalId, status, comment, deferredTo, reassignTo }) => {
      try {
        const update: Record<string, unknown> = { approvalId, status };
        if (comment !== undefined) update.comment = comment;
        if (deferredTo !== undefined) update.deferredTo = deferredTo;
        if (reassignTo !== undefined) update.reassignTo = { id: reassignTo };

        const response = await request(project, `approvals?api-version=${approvalsApiVersion}`, "PATCH", [update]);
        if (!response.ok) {
          throw new Error(`Failed to update approval (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error updating approval: ${errorMessage}` }], isError: true };
      }
    }
  );

  /** Runs one request and returns its body as the tool result. */
  async function call(action: string, project: string, pathAndQuery: string, method: string, body?: unknown) {
    try {
      const response = await request(project, pathAndQuery, method, body);
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status}: ${text}`);
      }
      return { content: [{ type: "text" as const, text: text || "Done." }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Error ${action}: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }

  const resourceTypeParam = z
    .enum(RESOURCE_TYPES)
    .describe("The kind of protected resource: 'environment', 'endpoint' (service connection), 'queue' (agent queue), 'variablegroup', 'securefile' or 'repository'.");
  const resourceIdParam = z.string().describe("The resource ID: the environment or queue number, or the GUID of the service connection, variable group, secure file or repository.");
  const checkIdParam = z.coerce.number().min(1).describe("The ID of the check configuration.");

  registerTool(
    server,
    APPROVALS_TOOLS.list_check_configurations,
    "List the checks on protected resources — approvals, branch control, business hours, Azure Function or REST API calls — that a stage must pass before it may use them. Give one resource or several.",
    {
      project: requiredProject,
      resources: z
        .array(z.object({ type: resourceTypeParam, id: resourceIdParam }))
        .min(1)
        .describe("The resources whose checks to list."),
      includeSettings: z.boolean().default(true).describe("Include each check's settings, e.g. the approvers of an approval check."),
    },
    async ({ project, resources, includeSettings }) => {
      const expand = includeSettings ? "&$expand=settings" : "";
      if (resources.length === 1) {
        const [{ type, id }] = resources;
        return call(
          "listing check configurations",
          project,
          `checks/configurations?resourceType=${encodeURIComponent(type)}&resourceId=${encodeURIComponent(id)}${expand}&api-version=${checksApiVersion}`,
          "GET"
        );
      }
      return call("listing check configurations", project, `checks/queryconfigurations?api-version=${checksApiVersion}${expand}`, "POST", resources);
    }
  );

  registerTool(server, APPROVALS_TOOLS.get_check_configuration, "Get one check configuration with its settings.", { project: requiredProject, checkId: checkIdParam }, async ({ project, checkId }) =>
    call(`getting check configuration ${checkId}`, project, `checks/configurations/${checkId}?$expand=settings&api-version=${checksApiVersion}`, "GET")
  );

  const checkBodyParams = {
    checkTypeId: z
      .string()
      .describe(
        "The GUID of the check type. An approval check is '8C6F20A7-A545-4486-9777-F762FAFE0D4D'; for other kinds, copy the type of an existing check from approvals_list_check_configurations."
      ),
    settings: z
      .record(z.string(), z.unknown())
      .describe(
        'The check\'s settings, as approvals_get_check_configuration returns them. For an approval: { "approvers": [{ "id": "<identity GUID>" }], "minRequiredApprovers": 1, "requesterCannotBeApprover": true, "instructions": "…", "executionOrder": "anyOrder" }.'
      ),
    timeoutMinutes: z.coerce.number().min(1).optional().describe("How long the check may wait before it fails, in minutes. Omit for the default."),
  };

  registerTool(
    server,
    APPROVALS_TOOLS.add_check_configuration,
    "Add a check to a protected resource, e.g. require an approval before any pipeline deploys to the 'production' environment. It applies to every pipeline run that uses the resource from then on.",
    {
      project: requiredProject,
      resourceType: resourceTypeParam,
      resourceId: resourceIdParam,
      ...checkBodyParams,
    },
    async ({ project, resourceType, resourceId, checkTypeId, settings, timeoutMinutes }) =>
      call("adding a check configuration", project, `checks/configurations?api-version=${checksApiVersion}`, "POST", {
        type: { id: checkTypeId },
        settings,
        resource: { type: resourceType, id: resourceId },
        timeout: timeoutMinutes,
      })
  );

  registerTool(
    server,
    APPROVALS_TOOLS.update_check_configuration,
    "Replace a check's settings or timeout, e.g. change the approvers of an approval check. Pass the complete settings, not only the changed part.",
    {
      project: requiredProject,
      checkId: checkIdParam,
      resourceType: resourceTypeParam,
      resourceId: resourceIdParam,
      ...checkBodyParams,
    },
    async ({ project, checkId, resourceType, resourceId, checkTypeId, settings, timeoutMinutes }) =>
      call(`updating check configuration ${checkId}`, project, `checks/configurations/${checkId}?api-version=${checksApiVersion}`, "PATCH", {
        id: checkId,
        type: { id: checkTypeId },
        settings,
        resource: { type: resourceType, id: resourceId },
        timeout: timeoutMinutes,
      })
  );

  registerTool(
    server,
    APPROVALS_TOOLS.delete_check_configuration,
    "Remove a check from a protected resource. Pipelines can use the resource without passing it from then on — removing an approval on a production environment removes that gate.",
    { project: requiredProject, checkId: checkIdParam },
    async ({ project, checkId }) => call(`deleting check configuration ${checkId}`, project, `checks/configurations/${checkId}?api-version=${checksApiVersion}`, "DELETE")
  );

  registerTool(
    server,
    APPROVALS_TOOLS.get_check_run,
    "Get the evaluation of the checks a stage is waiting on: each check's status and result. Look for the waiting stage's Checkpoint records with pipelines_get_build_timeline (recordType 'Checkpoint') to find the check suite.",
    {
      project: requiredProject,
      checkSuiteId: z.string().describe("The GUID of the check suite."),
      includeResources: z.boolean().default(false).describe("Also return the resources the checks were evaluated for."),
    },
    async ({ project, checkSuiteId, includeResources }) =>
      call(`getting check run ${checkSuiteId}`, project, `checks/runs/${encodeURIComponent(checkSuiteId)}?${includeResources ? "$expand=resources&" : ""}api-version=${checksApiVersion}`, "GET")
  );

  registerTool(
    server,
    APPROVALS_TOOLS.get_pipeline_permissions,
    "List which pipelines may use a protected resource, and whether every pipeline is allowed to. A run that waits for 'permission needed' is missing from this list.",
    { project: requiredProject, resourceType: resourceTypeParam, resourceId: resourceIdParam },
    async ({ project, resourceType, resourceId }) =>
      call(
        `getting pipeline permissions of ${resourceType} ${resourceId}`,
        project,
        `pipelinepermissions/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}?api-version=${checksApiVersion}`,
        "GET"
      )
  );

  registerTool(
    server,
    APPROVALS_TOOLS.set_pipeline_permissions,
    "Allow or deny pipelines the use of a protected resource — individually, or all pipelines of the project at once. Opening a resource to all pipelines lets any pipeline, including new ones, use it without asking.",
    {
      project: requiredProject,
      resourceType: resourceTypeParam,
      resourceId: resourceIdParam,
      pipelines: z
        .array(z.object({ id: z.coerce.number().min(1).describe("The pipeline (definition) ID."), authorized: z.boolean().describe("true to allow, false to deny.") }))
        .optional()
        .describe("Individual pipelines to allow or deny."),
      allPipelinesAuthorized: z.boolean().optional().describe("true to open the resource to every pipeline, false to restrict it to the listed ones."),
    },
    async ({ project, resourceType, resourceId, pipelines, allPipelinesAuthorized }) => {
      if (!pipelines?.length && allPipelinesAuthorized === undefined) {
        return { content: [{ type: "text", text: "Nothing to change: give pipelines, allPipelinesAuthorized or both." }], isError: true };
      }
      return call(
        `setting pipeline permissions of ${resourceType} ${resourceId}`,
        project,
        `pipelinepermissions/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}?api-version=${checksApiVersion}`,
        "PATCH",
        {
          resource: { type: resourceType, id: resourceId },
          pipelines,
          allPipelines: allPipelinesAuthorized === undefined ? undefined : { authorized: allPipelinesAuthorized },
        }
      );
    }
  );
}

export { APPROVALS_TOOLS, configureApprovalsTools };

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch } from "../shared/ado-rest.js";
import { requiredProject } from "../shared/common-params.js";

const SERVICE_ENDPOINT_TOOLS = {
  list_service_endpoints: "serviceendpoint_list_service_endpoints",
  get_service_endpoint: "serviceendpoint_get_service_endpoint",
  create_service_endpoint: "serviceendpoint_create_service_endpoint",
  delete_service_endpoint: "serviceendpoint_delete_service_endpoint",
  update_service_endpoint: "serviceendpoint_update_service_endpoint",
  share_service_endpoint: "serviceendpoint_share_service_endpoint",
  list_execution_history: "serviceendpoint_list_execution_history",
  list_service_endpoint_types: "serviceendpoint_list_service_endpoint_types",
};

const serviceEndpointApiVersion = "7.1-preview.4";

// Types and execution history reject 7.1-preview.4; the released 7.1 serves every operation added here.
const serviceEndpointReleasedApiVersion = "7.1";

function configureServiceEndpointTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  async function request(method: string, pathAndQuery: string, body?: unknown): Promise<Response> {
    const connection = await connectionProvider();
    const token = await tokenProvider();
    const baseUrl = connection.serverUrl.replace(/\/$/, "");
    return adoFetch({ url: `${baseUrl}/${pathAndQuery}`, method, token, userAgent: userAgentProvider(), body });
  }

  registerTool(
    server,
    SERVICE_ENDPOINT_TOOLS.list_service_endpoints,
    "List service connections (service endpoints) in a project, e.g. connections to Azure, GitHub, Docker registries, or other services used by pipelines.",
    {
      project: requiredProject,
      type: z.string().optional().describe("Filter by endpoint type, e.g. 'azurerm', 'github', 'dockerregistry'."),
      includeFailed: z.boolean().optional().describe("Include endpoints that failed to be created/authorized."),
    },
    async ({ project, type, includeFailed }) => {
      try {
        const params = new URLSearchParams({ "api-version": serviceEndpointApiVersion });
        if (type) params.append("type", type);
        if (includeFailed !== undefined) params.append("includeFailed", String(includeFailed));

        const response = await request("GET", `${encodeURIComponent(project)}/_apis/serviceendpoint/endpoints?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list service endpoints (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing service endpoints: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    SERVICE_ENDPOINT_TOOLS.get_service_endpoint,
    "Get a single service connection (service endpoint) by its ID within a project.",
    {
      project: requiredProject,
      endpointId: z.string().describe("The ID (GUID) of the service endpoint."),
    },
    async ({ project, endpointId }) => {
      try {
        const response = await request("GET", `${encodeURIComponent(project)}/_apis/serviceendpoint/endpoints/${encodeURIComponent(endpointId)}?api-version=${serviceEndpointApiVersion}`);
        if (response.status === 404) {
          return { content: [{ type: "text", text: `Service endpoint '${endpointId}' not found` }], isError: true };
        }
        if (!response.ok) {
          throw new Error(`Failed to get service endpoint (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching service endpoint: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    SERVICE_ENDPOINT_TOOLS.create_service_endpoint,
    "Create a service connection (service endpoint). The endpoint object is passed through to the REST API; it must include name, type, url, authorization, and serviceEndpointProjectReferences (project scoping). See the Azure DevOps 'Endpoints - Create' REST API for the schema of each connection type.",
    {
      endpoint: z.record(z.unknown()).describe("The full service endpoint definition object (name, type, url, authorization, serviceEndpointProjectReferences, ...)."),
    },
    async ({ endpoint }) => {
      try {
        const response = await request("POST", `_apis/serviceendpoint/endpoints?api-version=${serviceEndpointApiVersion}`, endpoint);
        if (!response.ok) {
          throw new Error(`Failed to create service endpoint (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error creating service endpoint: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    SERVICE_ENDPOINT_TOOLS.delete_service_endpoint,
    "Delete a service connection (service endpoint) from the given projects. This is a destructive operation.",
    {
      endpointId: z.string().describe("The ID (GUID) of the service endpoint to delete."),
      projectIds: z.array(z.string()).min(1).describe("The IDs (GUIDs) of the projects from which to remove the endpoint."),
    },
    async ({ endpointId, projectIds }) => {
      try {
        const params = new URLSearchParams({ "api-version": serviceEndpointApiVersion, "projectIds": projectIds.join(",") });
        const response = await request("DELETE", `_apis/serviceendpoint/endpoints/${encodeURIComponent(endpointId)}?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to delete service endpoint (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: `Service endpoint '${endpointId}' deleted from project(s): ${projectIds.join(", ")}.` }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error deleting service endpoint: ${errorMessage}` }], isError: true };
      }
    }
  );

  async function call(action: string, method: string, pathAndQuery: string, body?: unknown) {
    try {
      const response = await request(method, pathAndQuery, body);
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status}: ${text}`);
      }
      const continuationToken = response.headers?.get("x-ms-continuationtoken");
      const result = continuationToken ? `${text}\n\nMore records: pass continuationToken ${continuationToken}.` : text;
      return { content: [{ type: "text" as const, text: result || "Done." }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Error ${action}: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }

  const endpointIdParam = z.string().describe("The ID (GUID) of the service endpoint.");

  registerTool(
    server,
    SERVICE_ENDPOINT_TOOLS.update_service_endpoint,
    "Replace a service connection's definition, e.g. to rename it, change its URL or rotate its credentials. Send the full endpoint as returned by serviceendpoint_get_service_endpoint with the fields changed; secrets the service does not return must be supplied again.",
    {
      endpointId: endpointIdParam,
      endpoint: z.record(z.unknown()).describe("The full service endpoint definition (id, name, type, url, authorization, data, serviceEndpointProjectReferences, ...)."),
      operation: z
        .string()
        .optional()
        .describe(
          "A special update the service performs instead of a plain replace, e.g. 'ConvertAuthenticationScheme' to move an Azure Resource Manager connection to workload identity federation. Leave out for a plain update."
        ),
    },
    async ({ endpointId, endpoint, operation }) => {
      const params = new URLSearchParams({ "api-version": serviceEndpointReleasedApiVersion });
      if (operation) params.append("operation", operation);
      return call(`updating service endpoint ${endpointId}`, "PUT", `_apis/serviceendpoint/endpoints/${encodeURIComponent(endpointId)}?${params.toString()}`, endpoint);
    }
  );

  registerTool(
    server,
    SERVICE_ENDPOINT_TOOLS.share_service_endpoint,
    "Share a service connection with other projects, so their pipelines can use its credentials. Each project gets its own name for the connection.",
    {
      endpointId: endpointIdParam,
      projects: z
        .array(
          z.object({
            projectId: z.string().describe("The ID (GUID) of the project to share with."),
            projectName: z.string().optional().describe("The name of that project."),
            name: z.string().describe("The name of the connection in that project."),
            description: z.string().optional().describe("The description of the connection in that project."),
          })
        )
        .min(1)
        .describe("The projects to share the connection with."),
    },
    async ({ endpointId, projects }) =>
      call(
        `sharing service endpoint ${endpointId}`,
        "PATCH",
        `_apis/serviceendpoint/endpoints/${encodeURIComponent(endpointId)}?api-version=${serviceEndpointReleasedApiVersion}`,
        projects.map(({ projectId, projectName, name, description }) => ({ name, description, projectReference: { id: projectId, name: projectName } }))
      )
  );

  registerTool(
    server,
    SERVICE_ENDPOINT_TOOLS.list_execution_history,
    "List the pipeline runs that used a service connection, newest first: the pipeline, the run, when and with what result. When more records exist the response ends with a continuationToken for the next page.",
    {
      project: requiredProject,
      endpointId: endpointIdParam,
      top: z.coerce.number().min(1).optional().describe("Maximum number of records to return."),
      continuationToken: z.coerce.number().optional().describe("The continuationToken from a previous page."),
    },
    async ({ project, endpointId, top, continuationToken }) => {
      const params = new URLSearchParams({ "api-version": serviceEndpointReleasedApiVersion });
      if (top !== undefined) params.append("top", String(top));
      if (continuationToken !== undefined) params.append("continuationToken", String(continuationToken));
      return call(
        `listing execution history of service endpoint ${endpointId}`,
        "GET",
        `${encodeURIComponent(project)}/_apis/serviceendpoint/${encodeURIComponent(endpointId)}/executionhistory?${params.toString()}`
      );
    }
  );

  registerTool(
    server,
    SERVICE_ENDPOINT_TOOLS.list_service_endpoint_types,
    "List the kinds of service connection the organization supports, e.g. 'azurerm', 'github', 'dockerregistry', 'kubernetes', with their authentication schemes and the inputs each needs. Use it to build the definition for serviceendpoint_create_service_endpoint. The full list is large; filter by type when you know it.",
    {
      type: z.string().optional().describe("Only this endpoint type, e.g. 'azurerm'."),
      scheme: z.string().optional().describe("Only this authentication scheme, e.g. 'WorkloadIdentityFederation', 'ServicePrincipal', 'UsernamePassword'."),
    },
    async ({ type, scheme }) => {
      const params = new URLSearchParams({ "api-version": serviceEndpointReleasedApiVersion });
      if (type) params.append("type", type);
      if (scheme) params.append("scheme", scheme);
      return call("listing service endpoint types", "GET", `_apis/serviceendpoint/types?${params.toString()}`);
    }
  );
}

export { SERVICE_ENDPOINT_TOOLS, configureServiceEndpointTools };

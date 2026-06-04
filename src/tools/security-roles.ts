// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { UserRoleAssignmentRef } from "azure-devops-node-api/interfaces/SecurityRolesInterfaces.js";

const SECURITY_ROLES_TOOLS = {
  list_definitions: "securityrole_list_definitions",
  list_assignments: "securityrole_list_assignments",
  set_assignment: "securityrole_set_assignment",
  set_assignments: "securityrole_set_assignments",
  remove_assignment: "securityrole_remove_assignment",
  remove_assignments: "securityrole_remove_assignments",
};

function configureSecurityRolesTools(server: McpServer, _: () => Promise<string>, connectionProvider: () => Promise<WebApi>) {
  const scopeIdField = z
    .string()
    .describe("The security namespace scope ID (e.g. 'distributedtask.globalagentpoolrole' for agent pools, 'distributedtask.serviceendpointrole' for service connections).");

  registerTool(
    server,
    SECURITY_ROLES_TOOLS.list_definitions,
    "List the security role definitions available for a scope.",
    {
      scopeId: scopeIdField,
    },
    async ({ scopeId }) => {
      try {
        const connection = await connectionProvider();
        const securityRolesApi = await connection.getSecurityRolesApi();
        const definitions = await securityRolesApi.getRoleDefinitions(scopeId);

        if (!definitions || definitions.length === 0) {
          return { content: [{ type: "text", text: "No role definitions found" }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(definitions, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching role definitions: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    SECURITY_ROLES_TOOLS.list_assignments,
    "List the role assignments for a resource within a scope.",
    {
      scopeId: scopeIdField,
      resourceId: z.string().describe("The ID of the resource (e.g. an agent pool ID, or '{projectId}_{serviceEndpointId}' for a service connection)."),
    },
    async ({ scopeId, resourceId }) => {
      try {
        const connection = await connectionProvider();
        const securityRolesApi = await connection.getSecurityRolesApi();
        const assignments = await securityRolesApi.getRoleAssignments(scopeId, resourceId);

        if (!assignments || assignments.length === 0) {
          return { content: [{ type: "text", text: "No role assignments found" }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(assignments, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching role assignments: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    SECURITY_ROLES_TOOLS.set_assignment,
    "Assign a security role to a single identity for a resource. Use securityrole_list_definitions to discover valid role names.",
    {
      scopeId: scopeIdField,
      resourceId: z.string().describe("The ID of the resource to assign the role on."),
      identityId: z.string().describe("The ID of the identity (user or group) to assign the role to."),
      roleName: z.string().describe("The name of the role to assign (e.g. 'Administrator', 'User', 'Reader')."),
    },
    async ({ scopeId, resourceId, identityId, roleName }) => {
      try {
        const connection = await connectionProvider();
        const roleAssignment = { roleName, userId: identityId } as unknown as UserRoleAssignmentRef;
        const securityRolesApi = await connection.getSecurityRolesApi();
        const result = await securityRolesApi.setRoleAssignment(roleAssignment, scopeId, resourceId, identityId);

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error setting role assignment: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    SECURITY_ROLES_TOOLS.set_assignments,
    "Assign security roles to multiple identities for a resource.",
    {
      scopeId: scopeIdField,
      resourceId: z.string().describe("The ID of the resource to assign the roles on."),
      assignments: z
        .array(
          z.object({
            identityId: z.string().describe("The ID of the identity (user or group)."),
            roleName: z.string().describe("The name of the role to assign."),
          })
        )
        .describe("The role assignments to set."),
    },
    async ({ scopeId, resourceId, assignments }) => {
      try {
        const connection = await connectionProvider();
        const roleAssignments = assignments.map((a) => ({ roleName: a.roleName, userId: a.identityId })) as unknown as UserRoleAssignmentRef[];
        const securityRolesApi = await connection.getSecurityRolesApi();
        const result = await securityRolesApi.setRoleAssignments(roleAssignments, scopeId, resourceId);

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error setting role assignments: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    SECURITY_ROLES_TOOLS.remove_assignment,
    "Remove a security role assignment from a single identity for a resource.",
    {
      scopeId: scopeIdField,
      resourceId: z.string().describe("The ID of the resource."),
      identityId: z.string().describe("The ID of the identity to remove the role assignment from."),
    },
    async ({ scopeId, resourceId, identityId }) => {
      try {
        const connection = await connectionProvider();
        const securityRolesApi = await connection.getSecurityRolesApi();
        await securityRolesApi.removeRoleAssignment(scopeId, resourceId, identityId);

        return { content: [{ type: "text", text: `Role assignment for ${identityId} removed` }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error removing role assignment: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    SECURITY_ROLES_TOOLS.remove_assignments,
    "Remove security role assignments from multiple identities for a resource.",
    {
      scopeId: scopeIdField,
      resourceId: z.string().describe("The ID of the resource."),
      identityIds: z.array(z.string()).describe("The IDs of the identities to remove role assignments from."),
    },
    async ({ scopeId, resourceId, identityIds }) => {
      try {
        const connection = await connectionProvider();
        const securityRolesApi = await connection.getSecurityRolesApi();
        await securityRolesApi.removeRoleAssignments(identityIds, scopeId, resourceId);

        return { content: [{ type: "text", text: `Removed ${identityIds.length} role assignment(s)` }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error removing role assignments: ${errorMessage}` }], isError: true };
      }
    }
  );
}

export { SECURITY_ROLES_TOOLS, configureSecurityRolesTools };

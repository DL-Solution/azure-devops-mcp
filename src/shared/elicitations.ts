// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";

interface ElicitResolved {
  resolved: string;
}

export interface ElicitResponse {
  response: { content: { type: "text"; text: string }[]; isError?: boolean };
}

export type ElicitResult = ElicitResolved | ElicitResponse;

// Whether the client can answer a form elicitation. Over the stateless HTTP transport every request
// lands on a fresh server that never saw the client's initialize, so the capabilities are unknown
// there and the answer is no — a picker could not be shown, and the SDK throws "Client does not
// support form elicitation." when asked. The model gets the choices in an error instead.
function canShowPicker(server: McpServer): boolean {
  return Boolean(server.server.getClientCapabilities()?.elicitation?.form);
}

function pickerUnavailable(argument: string, choices: string): ElicitResponse {
  return { response: { content: [{ type: "text", text: `No ${argument} was given and this client cannot show a picker. Pass "${argument}" — ${choices}.` }], isError: true } };
}

export async function elicitProject(server: McpServer, connection: WebApi, message?: string): Promise<ElicitResult> {
  // Check for default project from environment variable
  const defaultProject = process.env.ado_mcp_project;

  if (defaultProject) {
    return { resolved: defaultProject };
  }

  const coreApi = await connection.getCoreApi();
  const projects = await coreApi.getProjects("wellFormed", 100, 0, undefined, false);

  if (!projects || projects.length === 0) {
    return { response: { content: [{ type: "text", text: "No projects found to select from." }], isError: true } };
  }

  if (!canShowPicker(server)) {
    return pickerUnavailable("project", `one of: ${projects.map((p) => p.name ?? p.id).join(", ")}`);
  }

  const result = await server.server.elicitInput({
    mode: "form",
    message: message ?? "Select the Azure DevOps project.",
    requestedSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          title: "Project",
          description: "The Azure DevOps project.",
          oneOf: projects.map((p) => ({
            const: p.name ?? p.id ?? "",
            title: p.name ?? p.id ?? "Unknown project",
          })),
        },
      },
      required: ["project"],
    },
  });

  if (result.action !== "accept" || !result.content?.project) {
    return { response: { content: [{ type: "text", text: "Project selection cancelled." }] } };
  }

  return { resolved: String(result.content.project) };
}

export async function elicitTeam(server: McpServer, connection: WebApi, project: string, message?: string): Promise<ElicitResult> {
  // Check for default team from environment variable
  const defaultTeam = process.env.ado_mcp_team;

  if (defaultTeam) {
    return { resolved: defaultTeam };
  }

  const coreApi = await connection.getCoreApi();
  const teams = await coreApi.getTeams(project, undefined, undefined, undefined, false);

  if (!teams || teams.length === 0) {
    return { response: { content: [{ type: "text", text: "No teams found to select from." }], isError: true } };
  }

  if (!canShowPicker(server)) {
    return pickerUnavailable("team", `one of the teams in ${project}: ${teams.map((t) => t.name ?? t.id).join(", ")}`);
  }

  const result = await server.server.elicitInput({
    mode: "form",
    message: message ?? "Select the team.",
    requestedSchema: {
      type: "object",
      properties: {
        team: {
          type: "string",
          title: "Team",
          description: "The team from a specific Azure DevOps project.",
          oneOf: teams.map((t) => ({
            const: t.name ?? t.id ?? "",
            title: t.name ?? t.id ?? "Unknown team",
          })),
        },
      },
      required: ["team"],
    },
  });

  if (result.action !== "accept" || !result.content?.team) {
    return { response: { content: [{ type: "text", text: "Team selection cancelled." }] } };
  }

  return { resolved: String(result.content.team) };
}

/**
 * The project a tool acts on: the argument when given, otherwise the env
 * default or the user's pick. Returns the elicitation's own response when the
 * user could not pick one — hand it back as the tool result.
 */
export async function resolveProject(server: McpServer, connection: WebApi, project: string | undefined, message = "Select the Azure DevOps project."): Promise<{ project: string } | ElicitResponse> {
  if (project) {
    return { project };
  }
  const result = await elicitProject(server, connection, message);
  return "response" in result ? result : { project: result.resolved };
}

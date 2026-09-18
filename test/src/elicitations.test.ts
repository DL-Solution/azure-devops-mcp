// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { elicitProject, elicitTeam, resolveProject } from "../../src/shared/elicitations";
import { createToolServer } from "../mocks/tool-server";

describe("elicitations", () => {
  let server: McpServer;
  let mockCoreApi: { getProjects: jest.Mock; getTeams: jest.Mock };
  let mockConnection: { getCoreApi: jest.Mock };

  beforeEach(() => {
    server = createToolServer({ server: { elicitInput: jest.fn() } }) as unknown as McpServer;

    mockCoreApi = {
      getProjects: jest.fn(),
      getTeams: jest.fn(),
    };

    mockConnection = {
      getCoreApi: jest.fn().mockResolvedValue(mockCoreApi),
    };
  });

  describe("elicitProject", () => {
    const originalProjectEnv = process.env.ado_mcp_project;

    afterEach(() => {
      if (originalProjectEnv === undefined) {
        delete process.env.ado_mcp_project;
      } else {
        process.env.ado_mcp_project = originalProjectEnv;
      }
    });

    it("should use default message when no message is provided", async () => {
      delete process.env.ado_mcp_project;
      (mockCoreApi.getProjects as jest.Mock).mockResolvedValue([{ id: "proj-1", name: "ProjectAlpha" }]);

      const elicitMock = (server as unknown as { server: { elicitInput: jest.Mock } }).server.elicitInput as jest.Mock;
      elicitMock.mockResolvedValue({ action: "accept", content: { project: "ProjectAlpha" } });

      const result = await elicitProject(server, mockConnection as unknown as WebApi);

      const callArgs = elicitMock.mock.calls[0][0];
      expect(callArgs.message).toBe("Select the Azure DevOps project.");
      expect(result).toEqual({ resolved: "ProjectAlpha" });
    });

    it("should resolve to default project from ado_mcp_project env var without elicitation", async () => {
      process.env.ado_mcp_project = "DefaultProject";

      const elicitMock = (server as unknown as { server: { elicitInput: jest.Mock } }).server.elicitInput as jest.Mock;

      const result = await elicitProject(server, mockConnection as unknown as WebApi);

      expect(result).toEqual({ resolved: "DefaultProject" });
      expect(mockConnection.getCoreApi).not.toHaveBeenCalled();
      expect(mockCoreApi.getProjects).not.toHaveBeenCalled();
      expect(elicitMock).not.toHaveBeenCalled();
    });

    it("should not use empty ado_mcp_project env var as default", async () => {
      process.env.ado_mcp_project = "";
      (mockCoreApi.getProjects as jest.Mock).mockResolvedValue([{ id: "proj-1", name: "ProjectAlpha" }]);

      const elicitMock = (server as unknown as { server: { elicitInput: jest.Mock } }).server.elicitInput as jest.Mock;
      elicitMock.mockResolvedValue({ action: "accept", content: { project: "ProjectAlpha" } });

      const result = await elicitProject(server, mockConnection as unknown as WebApi);

      expect(mockCoreApi.getProjects).toHaveBeenCalled();
      expect(elicitMock).toHaveBeenCalled();
      expect(result).toEqual({ resolved: "ProjectAlpha" });
    });
  });

  describe("elicitTeam", () => {
    const originalTeamEnv = process.env.ado_mcp_team;

    afterEach(() => {
      if (originalTeamEnv === undefined) {
        delete process.env.ado_mcp_team;
      } else {
        process.env.ado_mcp_team = originalTeamEnv;
      }
    });

    it("should use default message when no message is provided", async () => {
      delete process.env.ado_mcp_team;
      (mockCoreApi.getTeams as jest.Mock).mockResolvedValue([{ id: "team-1", name: "Team One" }]);

      const elicitMock = (server as unknown as { server: { elicitInput: jest.Mock } }).server.elicitInput as jest.Mock;
      elicitMock.mockResolvedValue({ action: "accept", content: { team: "Team One" } });

      const result = await elicitTeam(server, mockConnection as unknown as WebApi, "ProjectAlpha");

      const callArgs = elicitMock.mock.calls[0][0];
      expect(callArgs.message).toBe("Select the team.");
      expect(result).toEqual({ resolved: "Team One" });
    });

    it("should fall back to team id when name is missing", async () => {
      delete process.env.ado_mcp_team;
      (mockCoreApi.getTeams as jest.Mock).mockResolvedValue([
        { id: "team-1", name: undefined },
        { id: undefined, name: undefined },
      ]);

      const elicitMock = (server as unknown as { server: { elicitInput: jest.Mock } }).server.elicitInput as jest.Mock;
      elicitMock.mockResolvedValue({ action: "accept", content: { team: "team-1" } });

      const result = await elicitTeam(server, mockConnection as unknown as WebApi, "ProjectAlpha");

      const schema = elicitMock.mock.calls[0][0].requestedSchema;
      const oneOf = schema.properties.team.oneOf;

      expect(oneOf[0]).toEqual({ const: "team-1", title: "team-1" });
      expect(oneOf[1]).toEqual({ const: "", title: "Unknown team" });
      expect(result).toEqual({ resolved: "team-1" });
    });

    it("should resolve to default team from ado_mcp_team env var without elicitation", async () => {
      process.env.ado_mcp_team = "DefaultTeam";

      const elicitMock = (server as unknown as { server: { elicitInput: jest.Mock } }).server.elicitInput as jest.Mock;

      const result = await elicitTeam(server, mockConnection as unknown as WebApi, "ProjectAlpha");

      expect(result).toEqual({ resolved: "DefaultTeam" });
      expect(mockConnection.getCoreApi).not.toHaveBeenCalled();
      expect(mockCoreApi.getTeams).not.toHaveBeenCalled();
      expect(elicitMock).not.toHaveBeenCalled();
    });

    it("should not use empty ado_mcp_team env var as default", async () => {
      process.env.ado_mcp_team = "";
      (mockCoreApi.getTeams as jest.Mock).mockResolvedValue([{ id: "team-1", name: "Team One" }]);

      const elicitMock = (server as unknown as { server: { elicitInput: jest.Mock } }).server.elicitInput as jest.Mock;
      elicitMock.mockResolvedValue({ action: "accept", content: { team: "Team One" } });

      const result = await elicitTeam(server, mockConnection as unknown as WebApi, "ProjectAlpha");

      expect(mockCoreApi.getTeams).toHaveBeenCalled();
      expect(elicitMock).toHaveBeenCalled();
      expect(result).toEqual({ resolved: "Team One" });
    });
  });

  describe("a client that cannot show a picker", () => {
    // Every request over the stateless HTTP transport lands on a fresh server that never saw the
    // client's initialize, so its capabilities are unknown there — the same as a client without
    // elicitation. Asking anyway throws the SDK's "Client does not support form elicitation."
    const originalProjectEnv = process.env.ado_mcp_project;
    const originalTeamEnv = process.env.ado_mcp_team;
    let elicitInput: jest.Mock;

    beforeEach(() => {
      delete process.env.ado_mcp_project;
      delete process.env.ado_mcp_team;
      elicitInput = jest.fn();
      server = createToolServer({ server: { elicitInput, getClientCapabilities: () => undefined } }) as unknown as McpServer;
    });

    afterEach(() => {
      if (originalProjectEnv === undefined) delete process.env.ado_mcp_project;
      else process.env.ado_mcp_project = originalProjectEnv;
      if (originalTeamEnv === undefined) delete process.env.ado_mcp_team;
      else process.env.ado_mcp_team = originalTeamEnv;
    });

    it("gets an error naming the projects to pass instead of a picker", async () => {
      mockCoreApi.getProjects.mockResolvedValue([{ id: "p1", name: "Hansa" }, { id: "p2", name: "mcpTest" }, { id: "p3" }]);

      const result = await elicitProject(server, mockConnection as unknown as WebApi);

      expect(result).toEqual({
        response: { content: [{ type: "text", text: 'No project was given and this client cannot show a picker. Pass "project" — one of: Hansa, mcpTest, p3.' }], isError: true },
      });
      expect(elicitInput).not.toHaveBeenCalled();
    });

    it("gets an error naming the project's teams to pass instead of a picker", async () => {
      mockCoreApi.getTeams.mockResolvedValue([
        { id: "t1", name: "Hansa Team" },
        { id: "t2", name: "Core" },
      ]);

      const result = await elicitTeam(server, mockConnection as unknown as WebApi, "Hansa");

      expect(result).toEqual({
        response: { content: [{ type: "text", text: 'No team was given and this client cannot show a picker. Pass "team" — one of the teams in Hansa: Hansa Team, Core.' }], isError: true },
      });
      expect(elicitInput).not.toHaveBeenCalled();
    });

    it("still uses the configured default project without asking", async () => {
      process.env.ado_mcp_project = "Hansa";

      expect(await elicitProject(server, mockConnection as unknown as WebApi)).toEqual({ resolved: "Hansa" });
    });
  });

  describe("resolveProject", () => {
    const originalProjectEnv = process.env.ado_mcp_project;

    afterEach(() => {
      if (originalProjectEnv === undefined) {
        delete process.env.ado_mcp_project;
      } else {
        process.env.ado_mcp_project = originalProjectEnv;
      }
    });

    it("returns the given argument without calling getCoreApi", async () => {
      delete process.env.ado_mcp_project;

      const result = await resolveProject(server, mockConnection as unknown as WebApi, "Contoso");

      expect(result).toEqual({ project: "Contoso" });
      expect(mockConnection.getCoreApi).not.toHaveBeenCalled();
    });

    it("falls back to the ado_mcp_project env default when omitted", async () => {
      process.env.ado_mcp_project = "P";

      const result = await resolveProject(server, mockConnection as unknown as WebApi, undefined);

      expect(result).toEqual({ project: "P" });
      expect(mockConnection.getCoreApi).not.toHaveBeenCalled();
    });

    it("returns the elicitation's response when there is nothing to select from", async () => {
      delete process.env.ado_mcp_project;
      (mockCoreApi.getProjects as jest.Mock).mockResolvedValue([]);

      const result = await resolveProject(server, mockConnection as unknown as WebApi, undefined);

      expect(result).toEqual({ response: { content: [{ type: "text", text: "No projects found to select from." }], isError: true } });
    });
  });
});

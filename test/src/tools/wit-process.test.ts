// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configureWitProcessTools } from "../../../src/tools/wit-process";

type TokenProviderMock = () => Promise<string>;
type ConnectionProviderMock = () => Promise<WebApi>;

interface ProcessApiMock {
  getListOfProcesses: jest.Mock;
  getProcessByItsId: jest.Mock;
  getProcessWorkItemTypes: jest.Mock;
  getProcessWorkItemType: jest.Mock;
  getAllWorkItemTypeFields: jest.Mock;
  getStateDefinitions: jest.Mock;
  getStateDefinition: jest.Mock;
  getProcessBehaviors: jest.Mock;
  getProcessBehavior: jest.Mock;
}

describe("configureWitProcessTools", () => {
  let server: McpServer;
  let tokenProvider: TokenProviderMock;
  let connectionProvider: ConnectionProviderMock;
  let mockConnection: { getWorkItemTrackingProcessApi: jest.Mock };
  let mockProcessApi: ProcessApiMock;

  beforeEach(() => {
    server = { tool: jest.fn() } as unknown as McpServer;
    tokenProvider = jest.fn();
    mockProcessApi = {
      getListOfProcesses: jest.fn(),
      getProcessByItsId: jest.fn(),
      getProcessWorkItemTypes: jest.fn(),
      getProcessWorkItemType: jest.fn(),
      getAllWorkItemTypeFields: jest.fn(),
      getStateDefinitions: jest.fn(),
      getStateDefinition: jest.fn(),
      getProcessBehaviors: jest.fn(),
      getProcessBehavior: jest.fn(),
    };
    mockConnection = {
      getWorkItemTrackingProcessApi: jest.fn().mockResolvedValue(mockProcessApi),
    };
    connectionProvider = jest.fn().mockResolvedValue(mockConnection);
  });

  const getHandler = (toolName: string) => {
    configureWitProcessTools(server, tokenProvider, connectionProvider);
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} tool not registered`);
    return call[3] as (params: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
  };

  describe("tool registration", () => {
    it("registers wit process tools on the server", () => {
      configureWitProcessTools(server, tokenProvider, connectionProvider);
      expect(server.tool as jest.Mock).toHaveBeenCalled();
    });
  });

  it("list_processes maps includeProjects to the expand level (=> 1)", async () => {
    const handler = getHandler("witprocess_list_processes");
    mockProcessApi.getListOfProcesses.mockResolvedValue([{ typeId: "p1", name: "Agile" }]);

    const result = await handler({ includeProjects: true });

    expect(mockProcessApi.getListOfProcesses).toHaveBeenCalledWith(1);
    expect(result.content[0].text).toContain("Agile");
  });

  it("list_processes omits the expand level when includeProjects is not set", async () => {
    const handler = getHandler("witprocess_list_processes");
    mockProcessApi.getListOfProcesses.mockResolvedValue([{ typeId: "p1" }]);

    await handler({});

    expect(mockProcessApi.getListOfProcesses).toHaveBeenCalledWith(undefined);
  });

  it("list_processes reports when none found", async () => {
    const handler = getHandler("witprocess_list_processes");
    mockProcessApi.getListOfProcesses.mockResolvedValue([]);

    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No processes found");
  });

  it("get_process passes the type id", async () => {
    const handler = getHandler("witprocess_get_process");
    mockProcessApi.getProcessByItsId.mockResolvedValue({ typeId: "p1" });

    const result = await handler({ processTypeId: "p1" });

    expect(mockProcessApi.getProcessByItsId).toHaveBeenCalledWith("p1", undefined);
    expect(result.content[0].text).toContain("p1");
  });

  it("list_work_item_types maps the expand (states => 1)", async () => {
    const handler = getHandler("witprocess_list_work_item_types");
    mockProcessApi.getProcessWorkItemTypes.mockResolvedValue([{ referenceName: "Agile.UserStory" }]);

    const result = await handler({ processId: "p1", expand: "states" });

    expect(mockProcessApi.getProcessWorkItemTypes).toHaveBeenCalledWith("p1", 1);
    expect(result.content[0].text).toContain("Agile.UserStory");
  });

  it("get_work_item_type maps the expand (layout => 4)", async () => {
    const handler = getHandler("witprocess_get_work_item_type");
    mockProcessApi.getProcessWorkItemType.mockResolvedValue({ referenceName: "Agile.Bug" });

    const result = await handler({ processId: "p1", witRefName: "Agile.Bug", expand: "layout" });

    expect(mockProcessApi.getProcessWorkItemType).toHaveBeenCalledWith("p1", "Agile.Bug", 4);
    expect(result.content[0].text).toContain("Agile.Bug");
  });

  it("list_work_item_type_fields passes process and wit", async () => {
    const handler = getHandler("witprocess_list_work_item_type_fields");
    mockProcessApi.getAllWorkItemTypeFields.mockResolvedValue([{ referenceName: "System.Title" }]);

    const result = await handler({ processId: "p1", witRefName: "Agile.UserStory" });

    expect(mockProcessApi.getAllWorkItemTypeFields).toHaveBeenCalledWith("p1", "Agile.UserStory");
    expect(result.content[0].text).toContain("System.Title");
  });

  it("list_states passes process and wit", async () => {
    const handler = getHandler("witprocess_list_states");
    mockProcessApi.getStateDefinitions.mockResolvedValue([{ name: "Active" }]);

    const result = await handler({ processId: "p1", witRefName: "Agile.UserStory" });

    expect(mockProcessApi.getStateDefinitions).toHaveBeenCalledWith("p1", "Agile.UserStory");
    expect(result.content[0].text).toContain("Active");
  });

  it("get_state passes the state id", async () => {
    const handler = getHandler("witprocess_get_state");
    mockProcessApi.getStateDefinition.mockResolvedValue({ id: "s1", name: "Done" });

    const result = await handler({ processId: "p1", witRefName: "Agile.UserStory", stateId: "s1" });

    expect(mockProcessApi.getStateDefinition).toHaveBeenCalledWith("p1", "Agile.UserStory", "s1");
    expect(result.content[0].text).toContain("Done");
  });

  it("list_behaviors passes the process id", async () => {
    const handler = getHandler("witprocess_list_behaviors");
    mockProcessApi.getProcessBehaviors.mockResolvedValue([{ referenceName: "System.PortfolioBehavior" }]);

    const result = await handler({ processId: "p1" });

    expect(mockProcessApi.getProcessBehaviors).toHaveBeenCalledWith("p1");
    expect(result.content[0].text).toContain("System.PortfolioBehavior");
  });

  it("get_behavior passes the behavior ref name", async () => {
    const handler = getHandler("witprocess_get_behavior");
    mockProcessApi.getProcessBehavior.mockResolvedValue({ referenceName: "System.PortfolioBehavior" });

    const result = await handler({ processId: "p1", behaviorRefName: "System.PortfolioBehavior" });

    expect(mockProcessApi.getProcessBehavior).toHaveBeenCalledWith("p1", "System.PortfolioBehavior");
    expect(result.content[0].text).toContain("System.PortfolioBehavior");
  });

  it("surfaces API errors", async () => {
    const handler = getHandler("witprocess_get_process");
    mockProcessApi.getProcessByItsId.mockRejectedValue(new Error("boom"));

    const result = await handler({ processTypeId: "p1" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error fetching process: boom");
  });
});

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Form layout of inherited process work item types: pages, groups, controls
// and the system controls in the header.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";

import { configureWitProcessTools, WIT_PROCESS_TOOLS } from "../../../src/tools/wit-process";
import { createToolServer } from "../../mocks/tool-server";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const WIT = { processId: "proc-1", witRefName: "MyAgile.Bug" };

describe("witprocess form layout tools", () => {
  let server: McpServer;
  let processApi: Record<string, jest.Mock>;
  let connectionProvider: () => Promise<WebApi>;

  beforeEach(() => {
    server = createToolServer() as unknown as McpServer;
    processApi = {
      getFormLayout: jest.fn(),
      addPage: jest.fn(),
      updatePage: jest.fn(),
      removePage: jest.fn(),
      addGroup: jest.fn(),
      updateGroup: jest.fn(),
      moveGroupToPage: jest.fn(),
      moveGroupToSection: jest.fn(),
      removeGroup: jest.fn(),
      createControlInGroup: jest.fn(),
      updateControl: jest.fn(),
      moveControlToGroup: jest.fn(),
      removeControlFromGroup: jest.fn(),
      getSystemControls: jest.fn(),
      updateSystemControl: jest.fn(),
      deleteSystemControl: jest.fn(),
    };
    connectionProvider = jest.fn().mockResolvedValue({
      getWorkItemTrackingProcessApi: jest.fn().mockResolvedValue(processApi),
    } as unknown as WebApi) as () => Promise<WebApi>;
  });

  function handlerFor(toolName: string): Handler {
    configureWitProcessTools(server, jest.fn() as () => Promise<string>, connectionProvider);
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as Handler;
  }

  const parsed = (result: { content: { text: string }[] }) => JSON.parse(result.content[0].text);

  it("gets the form layout", async () => {
    processApi.getFormLayout.mockResolvedValue({ pages: [{ id: "p1", label: "Details" }] });

    const result = await handlerFor(WIT_PROCESS_TOOLS.get_form_layout)(WIT);

    expect(processApi.getFormLayout).toHaveBeenCalledWith("proc-1", "MyAgile.Bug");
    expect(parsed(result)).toEqual({ pages: [{ id: "p1", label: "Details" }] });
  });

  // System process types are locked; the API refuses to even describe their layout.
  it("surfaces the locked-type refusal", async () => {
    processApi.getFormLayout.mockRejectedValue(new Error("VS403115: these work item types are locked"));

    const result = await handlerFor(WIT_PROCESS_TOOLS.get_form_layout)({ processId: "agile", witRefName: "Microsoft.VSTS.WorkItemTypes.Bug" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("VS403115");
  });

  describe("pages", () => {
    it("adds a page", async () => {
      processApi.addPage.mockResolvedValue({ id: "p9", label: "Release" });

      await handlerFor(WIT_PROCESS_TOOLS.add_page)({ ...WIT, label: "Release", order: 2, visible: true });

      expect(processApi.addPage).toHaveBeenCalledWith({ label: "Release", order: 2, visible: true }, "proc-1", "MyAgile.Bug");
    });

    it("updates a page by id", async () => {
      processApi.updatePage.mockResolvedValue({ id: "p9" });

      await handlerFor(WIT_PROCESS_TOOLS.update_page)({ ...WIT, pageId: "p9", visible: false });

      expect(processApi.updatePage).toHaveBeenCalledWith({ id: "p9", label: undefined, order: undefined, visible: false }, "proc-1", "MyAgile.Bug");
    });

    it("removes a page", async () => {
      processApi.removePage.mockResolvedValue(undefined);

      const result = await handlerFor(WIT_PROCESS_TOOLS.remove_page)({ ...WIT, pageId: "p9" });

      expect(processApi.removePage).toHaveBeenCalledWith("proc-1", "MyAgile.Bug", "p9");
      expect(parsed(result)).toEqual({ removed: "p9" });
    });
  });

  describe("groups", () => {
    it("adds a group to a section", async () => {
      processApi.addGroup.mockResolvedValue({ id: "g1" });

      await handlerFor(WIT_PROCESS_TOOLS.add_group)({ ...WIT, pageId: "p1", sectionId: "Section2", label: "Customer" });

      expect(processApi.addGroup).toHaveBeenCalledWith({ label: "Customer", order: undefined, visible: undefined }, "proc-1", "MyAgile.Bug", "p1", "Section2");
    });

    it("updates a group", async () => {
      processApi.updateGroup.mockResolvedValue({ id: "g1" });

      await handlerFor(WIT_PROCESS_TOOLS.update_group)({ ...WIT, pageId: "p1", sectionId: "Section2", groupId: "g1", label: "Clients" });

      expect(processApi.updateGroup).toHaveBeenCalledWith({ id: "g1", label: "Clients", order: undefined, visible: undefined }, "proc-1", "MyAgile.Bug", "p1", "Section2", "g1");
    });

    it("moves a group to another section of the same page", async () => {
      processApi.moveGroupToSection.mockResolvedValue({ id: "g1" });

      await handlerFor(WIT_PROCESS_TOOLS.move_group)({ ...WIT, pageId: "p1", sectionId: "Section2", groupId: "g1", toSectionId: "Section3", toPageId: "p1" });

      expect(processApi.moveGroupToSection).toHaveBeenCalledWith({ id: "g1", order: undefined }, "proc-1", "MyAgile.Bug", "p1", "Section3", "g1", "Section2");
      expect(processApi.moveGroupToPage).not.toHaveBeenCalled();
    });

    it("moves a group to another page", async () => {
      processApi.moveGroupToPage.mockResolvedValue({ id: "g1" });

      await handlerFor(WIT_PROCESS_TOOLS.move_group)({ ...WIT, pageId: "p1", sectionId: "Section2", groupId: "g1", toPageId: "p9", toSectionId: "Section1", order: 0 });

      expect(processApi.moveGroupToPage).toHaveBeenCalledWith({ id: "g1", order: 0 }, "proc-1", "MyAgile.Bug", "p9", "Section1", "g1", "p1", "Section2");
    });

    it("removes a group", async () => {
      processApi.removeGroup.mockResolvedValue(undefined);

      const result = await handlerFor(WIT_PROCESS_TOOLS.remove_group)({ ...WIT, pageId: "p1", sectionId: "Section2", groupId: "g1" });

      expect(processApi.removeGroup).toHaveBeenCalledWith("proc-1", "MyAgile.Bug", "p1", "Section2", "g1");
      expect(parsed(result)).toEqual({ removed: "g1" });
    });
  });

  describe("controls", () => {
    it("adds a field control whose id is the field reference name", async () => {
      processApi.createControlInGroup.mockResolvedValue({ id: "Custom.Severity" });

      await handlerFor(WIT_PROCESS_TOOLS.add_control)({ ...WIT, groupId: "g1", fieldReferenceName: "Custom.Severity", label: "Severity", readOnly: true, watermark: "pick one" });

      expect(processApi.createControlInGroup).toHaveBeenCalledWith(
        { id: "Custom.Severity", label: "Severity", order: undefined, readOnly: true, visible: undefined, watermark: "pick one" },
        "proc-1",
        "MyAgile.Bug",
        "g1"
      );
    });

    it("updates a control", async () => {
      processApi.updateControl.mockResolvedValue({ id: "Custom.Severity" });

      await handlerFor(WIT_PROCESS_TOOLS.update_control)({ ...WIT, groupId: "g1", controlId: "Custom.Severity", visible: false });

      expect(processApi.updateControl).toHaveBeenCalledWith(
        { id: "Custom.Severity", label: undefined, order: undefined, readOnly: undefined, visible: false, watermark: undefined },
        "proc-1",
        "MyAgile.Bug",
        "g1",
        "Custom.Severity"
      );
    });

    it("moves a control between groups", async () => {
      processApi.moveControlToGroup.mockResolvedValue({ id: "Custom.Severity" });

      await handlerFor(WIT_PROCESS_TOOLS.move_control)({ ...WIT, fromGroupId: "g1", toGroupId: "g2", controlId: "Custom.Severity", order: 1 });

      expect(processApi.moveControlToGroup).toHaveBeenCalledWith({ id: "Custom.Severity", order: 1 }, "proc-1", "MyAgile.Bug", "g2", "Custom.Severity", "g1");
    });

    it("removes a control", async () => {
      processApi.removeControlFromGroup.mockResolvedValue(undefined);

      const result = await handlerFor(WIT_PROCESS_TOOLS.remove_control)({ ...WIT, groupId: "g1", controlId: "Custom.Severity" });

      expect(processApi.removeControlFromGroup).toHaveBeenCalledWith("proc-1", "MyAgile.Bug", "g1", "Custom.Severity");
      expect(parsed(result)).toEqual({ removed: "Custom.Severity", groupId: "g1" });
    });
  });

  describe("system controls", () => {
    it("lists them", async () => {
      processApi.getSystemControls.mockResolvedValue([{ id: "System.AreaPath" }]);

      const result = await handlerFor(WIT_PROCESS_TOOLS.list_system_controls)(WIT);

      expect(processApi.getSystemControls).toHaveBeenCalledWith("proc-1", "MyAgile.Bug");
      expect(parsed(result)).toEqual([{ id: "System.AreaPath" }]);
    });

    it("hides one", async () => {
      processApi.updateSystemControl.mockResolvedValue({ id: "System.Reason", visible: false });

      await handlerFor(WIT_PROCESS_TOOLS.update_system_control)({ ...WIT, controlId: "System.Reason", visible: false });

      expect(processApi.updateSystemControl).toHaveBeenCalledWith({ id: "System.Reason", label: undefined, visible: false }, "proc-1", "MyAgile.Bug", "System.Reason");
    });

    it("resets one", async () => {
      processApi.deleteSystemControl.mockResolvedValue([{ id: "System.Reason", visible: true }]);

      const result = await handlerFor(WIT_PROCESS_TOOLS.reset_system_control)({ ...WIT, controlId: "System.Reason" });

      expect(processApi.deleteSystemControl).toHaveBeenCalledWith("proc-1", "MyAgile.Bug", "System.Reason");
      expect(parsed(result)).toEqual([{ id: "System.Reason", visible: true }]);
    });
  });

  it.each([
    [WIT_PROCESS_TOOLS.add_page, "addPage", { label: "X" }, "adding page 'X'"],
    [WIT_PROCESS_TOOLS.update_page, "updatePage", { pageId: "p1" }, "updating page 'p1'"],
    [WIT_PROCESS_TOOLS.remove_page, "removePage", { pageId: "p1" }, "removing page 'p1'"],
    [WIT_PROCESS_TOOLS.add_group, "addGroup", { pageId: "p1", sectionId: "Section1", label: "G" }, "adding group 'G'"],
    [WIT_PROCESS_TOOLS.update_group, "updateGroup", { pageId: "p1", sectionId: "Section1", groupId: "g1" }, "updating group 'g1'"],
    [WIT_PROCESS_TOOLS.move_group, "moveGroupToSection", { pageId: "p1", sectionId: "Section1", groupId: "g1", toSectionId: "Section2" }, "moving group 'g1'"],
    [WIT_PROCESS_TOOLS.remove_group, "removeGroup", { pageId: "p1", sectionId: "Section1", groupId: "g1" }, "removing group 'g1'"],
    [WIT_PROCESS_TOOLS.add_control, "createControlInGroup", { groupId: "g1", fieldReferenceName: "Custom.A" }, "adding control 'Custom.A'"],
    [WIT_PROCESS_TOOLS.update_control, "updateControl", { groupId: "g1", controlId: "Custom.A" }, "updating control 'Custom.A'"],
    [WIT_PROCESS_TOOLS.move_control, "moveControlToGroup", { fromGroupId: "g1", toGroupId: "g2", controlId: "Custom.A" }, "moving control 'Custom.A'"],
    [WIT_PROCESS_TOOLS.remove_control, "removeControlFromGroup", { groupId: "g1", controlId: "Custom.A" }, "removing control 'Custom.A'"],
    [WIT_PROCESS_TOOLS.list_system_controls, "getSystemControls", {}, "listing system controls of 'MyAgile.Bug'"],
    [WIT_PROCESS_TOOLS.update_system_control, "updateSystemControl", { controlId: "System.Reason" }, "updating system control 'System.Reason'"],
    [WIT_PROCESS_TOOLS.reset_system_control, "deleteSystemControl", { controlId: "System.Reason" }, "resetting system control 'System.Reason'"],
  ])("%s surfaces an API failure", async (tool, method, args, action) => {
    processApi[method].mockRejectedValue(new Error("TF400813"));

    const result = await handlerFor(tool)({ ...WIT, ...args });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(`Error ${action}: TF400813`);
  });
});

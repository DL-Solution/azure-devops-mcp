// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Organization field creation and work item comment reactions. Kept apart
// from work-items.test.ts, which is ~6k lines built around its own fs mock.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { CommentReactionType, FieldType, FieldUsage } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";

import { configureWorkItemTools, WORKITEM_TOOLS } from "../../../src/tools/work-items";
import { createToolServer } from "../../mocks/tool-server";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

describe("work item fields and comment reactions", () => {
  let server: McpServer;
  let elicitInput: jest.Mock;
  let witApi: Record<string, jest.Mock>;
  let getProjects: jest.Mock;
  let connectionProvider: () => Promise<WebApi>;

  beforeEach(() => {
    delete process.env.ado_mcp_project;
    elicitInput = jest.fn();
    server = createToolServer({ server: { elicitInput } }) as unknown as McpServer;
    witApi = {
      createField: jest.fn(),
      getCommentReactions: jest.fn(),
      getEngagedUsers: jest.fn(),
      createCommentReaction: jest.fn(),
      deleteCommentReaction: jest.fn(),
    };
    getProjects = jest.fn().mockResolvedValue([{ name: "Contoso" }]);
    connectionProvider = jest.fn().mockResolvedValue({
      serverUrl: "https://dev.azure.com/contoso",
      getWorkItemTrackingApi: jest.fn().mockResolvedValue(witApi),
      getCoreApi: jest.fn().mockResolvedValue({ getProjects }),
    } as unknown as WebApi) as () => Promise<WebApi>;
  });

  function handlerFor(toolName: string): Handler {
    configureWorkItemTools(server, jest.fn() as () => Promise<string>, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as Handler;
  }

  const parsed = (result: { content: { text: string }[] }) => JSON.parse(result.content[0].text);

  describe("wit_create_field", () => {
    it("creates a field with its type and usage spelled as the REST API documents them", async () => {
      witApi.createField.mockResolvedValue({ name: "Customer Impact", referenceName: "Custom.CustomerImpact", type: FieldType.Html, usage: FieldUsage.WorkItem });

      const result = await handlerFor(WORKITEM_TOOLS.create_field)({ name: "Customer Impact", referenceName: "Custom.CustomerImpact", type: "html", description: "Who is hurt" });

      expect(witApi.createField).toHaveBeenCalledWith({
        name: "Customer Impact",
        referenceName: "Custom.CustomerImpact",
        description: "Who is hurt",
        type: "html",
        usage: "workItem",
        isIdentity: undefined,
        isPicklist: undefined,
        picklistId: undefined,
        isPicklistSuggested: undefined,
      });
      expect(parsed(result)).toMatchObject({ referenceName: "Custom.CustomerImpact", type: "Html", usage: "WorkItem" });
    });

    it("marks an identity field", async () => {
      witApi.createField.mockResolvedValue({ name: "Reviewer" });

      await handlerFor(WORKITEM_TOOLS.create_field)({ name: "Reviewer", type: "identity" });

      expect(witApi.createField.mock.calls[0][0]).toMatchObject({ type: "identity", isIdentity: true });
    });

    it("links a picklist field to its list", async () => {
      witApi.createField.mockResolvedValue({ name: "Tier" });

      await handlerFor(WORKITEM_TOOLS.create_field)({ name: "Tier", type: "picklistString", picklistId: "list-1", isPicklistSuggested: true });

      expect(witApi.createField.mock.calls[0][0]).toMatchObject({ type: "picklistString", isPicklist: true, picklistId: "list-1", isPicklistSuggested: true });
    });

    it("refuses a picklist type without a list", async () => {
      const result = await handlerFor(WORKITEM_TOOLS.create_field)({ name: "Tier", type: "picklistInteger" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("needs picklistId");
      expect(witApi.createField).not.toHaveBeenCalled();
    });

    it("refuses a list on a type that is not a picklist", async () => {
      const result = await handlerFor(WORKITEM_TOOLS.create_field)({ name: "Tier", type: "string", picklistId: "list-1" });

      expect(result.isError).toBe(true);
      expect(witApi.createField).not.toHaveBeenCalled();
    });

    it("surfaces a rejected field", async () => {
      witApi.createField.mockRejectedValue(new Error("TF51535: field name already exists"));

      const result = await handlerFor(WORKITEM_TOOLS.create_field)({ name: "Title", type: "string" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("TF51535");
    });
  });

  describe("comment reactions", () => {
    const target = { project: "Contoso", workItemId: 325, commentId: 262999 };

    it("lists reactions with their type named", async () => {
      witApi.getCommentReactions.mockResolvedValue([{ commentId: 262999, type: CommentReactionType.Heart, count: 2, isCurrentUserEngaged: true, url: "x" }]);

      const result = await handlerFor(WORKITEM_TOOLS.list_comment_reactions)(target);

      expect(witApi.getCommentReactions).toHaveBeenCalledWith("Contoso", 325, 262999);
      expect(parsed(result)).toEqual([{ commentId: 262999, type: "Heart", count: 2, isCurrentUserEngaged: true }]);
    });

    it("asks for the project when none is given", async () => {
      elicitInput.mockResolvedValue({ action: "accept", content: { project: "Contoso" } });
      witApi.getCommentReactions.mockResolvedValue([]);

      await handlerFor(WORKITEM_TOOLS.list_comment_reactions)({ workItemId: 325, commentId: 262999 });

      expect(elicitInput).toHaveBeenCalled();
      expect(witApi.getCommentReactions).toHaveBeenCalledWith("Contoso", 325, 262999);
    });

    it.each([WORKITEM_TOOLS.list_comment_reactions, WORKITEM_TOOLS.list_comment_reaction_users, WORKITEM_TOOLS.add_comment_reaction, WORKITEM_TOOLS.remove_comment_reaction])(
      "%s stops when the project selection is cancelled",
      async (tool) => {
        elicitInput.mockResolvedValue({ action: "decline" });

        const result = await handlerFor(tool)({ workItemId: 325, commentId: 262999, reaction: "like" });

        expect(result.content[0].text).toBe("Project selection cancelled.");
        for (const method of Object.values(witApi)) expect(method).not.toHaveBeenCalled();
      }
    );

    it("lists who reacted, passing the reaction by name", async () => {
      witApi.getEngagedUsers.mockResolvedValue([{ id: "u1", displayName: "Ada", uniqueName: "ada@contoso.com", imageUrl: "x" }]);

      const result = await handlerFor(WORKITEM_TOOLS.list_comment_reaction_users)({ ...target, reaction: "hooray", top: 10, skip: 0 });

      expect(witApi.getEngagedUsers).toHaveBeenCalledWith("Contoso", 325, 262999, "hooray", 10, 0);
      expect(parsed(result)).toEqual([{ id: "u1", displayName: "Ada", uniqueName: "ada@contoso.com" }]);
    });

    it("adds a reaction", async () => {
      witApi.createCommentReaction.mockResolvedValue({ commentId: 262999, type: CommentReactionType.Like, count: 1, isCurrentUserEngaged: true });

      const result = await handlerFor(WORKITEM_TOOLS.add_comment_reaction)({ ...target, reaction: "like" });

      expect(witApi.createCommentReaction).toHaveBeenCalledWith("Contoso", 325, 262999, "like");
      expect(parsed(result)).toMatchObject({ type: "Like", count: 1 });
    });

    it("removes a reaction", async () => {
      witApi.deleteCommentReaction.mockResolvedValue({ commentId: 262999, type: CommentReactionType.Like, count: 0, isCurrentUserEngaged: false });

      const result = await handlerFor(WORKITEM_TOOLS.remove_comment_reaction)({ ...target, reaction: "like" });

      expect(witApi.deleteCommentReaction).toHaveBeenCalledWith("Contoso", 325, 262999, "like");
      expect(parsed(result)).toMatchObject({ count: 0, isCurrentUserEngaged: false });
    });

    it.each([
      [WORKITEM_TOOLS.list_comment_reactions, "getCommentReactions", "Error listing comment reactions"],
      [WORKITEM_TOOLS.list_comment_reaction_users, "getEngagedUsers", "Error listing users who reacted"],
      [WORKITEM_TOOLS.add_comment_reaction, "createCommentReaction", "Error adding comment reaction"],
      [WORKITEM_TOOLS.remove_comment_reaction, "deleteCommentReaction", "Error removing comment reaction"],
    ])("%s surfaces an API failure", async (tool, method, message) => {
      witApi[method].mockRejectedValue(new Error("comment not found"));

      const result = await handlerFor(tool)({ ...target, reaction: "like" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(`${message}: comment not found`);
    });
  });
});

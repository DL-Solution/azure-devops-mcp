// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Organization fields, comment reactions and versions, change history, type
// metadata, saved query search, batch deletion and project process migration.
// Kept apart from work-items.test.ts, which is ~6k lines built around its own fs mock.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { CommentReactionType, FieldType, FieldUsage, WorkItemExpand, WorkItemTypeFieldsExpandLevel } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";

import { configureWorkItemTools, WORKITEM_TOOLS } from "../../../src/tools/work-items";
import { createToolServer } from "../../mocks/tool-server";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

describe("work item fields and comment reactions", () => {
  let server: McpServer;
  let elicitInput: jest.Mock;
  let witApi: Record<string, jest.Mock>;
  let getProjects: jest.Mock;
  let mockFetch: jest.Mock;
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
      deleteComment: jest.fn(),
      getCommentVersions: jest.fn(),
      getCommentVersion: jest.fn(),
      getUpdates: jest.fn(),
      getUpdate: jest.fn(),
      getRevision: jest.fn(),
      getWorkItemTypeStates: jest.fn(),
      getWorkItemTypeFieldsWithReferences: jest.fn(),
      getWorkItemTypeFieldWithReferences: jest.fn(),
      searchQueries: jest.fn(),
      queryWorkItemsForArtifactUris: jest.fn(),
      deleteField: jest.fn(),
      updateField: jest.fn(),
      migrateProjectsProcess: jest.fn(),
    };
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    getProjects = jest.fn().mockResolvedValue([{ name: "Contoso" }]);
    connectionProvider = jest.fn().mockResolvedValue({
      serverUrl: "https://dev.azure.com/contoso",
      getWorkItemTrackingApi: jest.fn().mockResolvedValue(witApi),
      getCoreApi: jest.fn().mockResolvedValue({ getProjects }),
    } as unknown as WebApi) as () => Promise<WebApi>;
  });

  function handlerFor(toolName: string): Handler {
    configureWorkItemTools(server, jest.fn(() => Promise.resolve("token")) as () => Promise<string>, connectionProvider, () => "Jest");
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

  describe("comments, history and type metadata", () => {
    // Tool output that carries user-written text is spotlighted; strip the markers to read the JSON.
    const unwrap = (result: { content: { text: string }[] }) => JSON.parse(result.content[0].text.replace(/^[\s\S]*?\] <<[0-9a-f]+>>\n?/, "").replace(/\n?<<\/[0-9a-f]+>>\s*$/, ""));

    it("deletes a comment", async () => {
      witApi.deleteComment.mockResolvedValue(undefined);

      const result = await handlerFor(WORKITEM_TOOLS.delete_work_item_comment)({ project: "Contoso", workItemId: 5, commentId: 9 });

      expect(witApi.deleteComment).toHaveBeenCalledWith("Contoso", 5, 9);
      expect(parsed(result)).toEqual({ deleted: 9, workItemId: 5 });
    });

    it("stops deleting a comment when the project selection is cancelled", async () => {
      elicitInput.mockResolvedValue({ action: "cancel" });

      const result = await handlerFor(WORKITEM_TOOLS.delete_work_item_comment)({ workItemId: 5, commentId: 9 });

      expect(result.content[0].text).toBe("Project selection cancelled.");
      expect(witApi.deleteComment).not.toHaveBeenCalled();
    });

    it("lists all versions of a comment, or one", async () => {
      witApi.getCommentVersions.mockResolvedValue([{ version: 1 }, { version: 2 }]);
      const all = await handlerFor(WORKITEM_TOOLS.list_work_item_comment_versions)({ project: "Contoso", workItemId: 5, commentId: 9 });
      expect(witApi.getCommentVersions).toHaveBeenCalledWith("Contoso", 5, 9);
      expect(all.content[0].text).toContain("UNTRUSTED");
      expect(unwrap(all)).toEqual([{ version: 1 }, { version: 2 }]);

      witApi.getCommentVersion.mockResolvedValue({ version: 1 });
      await handlerFor(WORKITEM_TOOLS.list_work_item_comment_versions)({ project: "Contoso", workItemId: 5, commentId: 9, version: 1 });
      expect(witApi.getCommentVersion).toHaveBeenCalledWith("Contoso", 5, 9, 1);
    });

    it("stops listing comment versions when the project selection is cancelled", async () => {
      elicitInput.mockResolvedValue({ action: "decline" });

      const result = await handlerFor(WORKITEM_TOOLS.list_work_item_comment_versions)({ workItemId: 5, commentId: 9 });

      expect(result.content[0].text).toBe("Project selection cancelled.");
    });

    it("lists updates, or gets one", async () => {
      witApi.getUpdates.mockResolvedValue([{ id: 1 }]);
      const result = await handlerFor(WORKITEM_TOOLS.list_work_item_updates)({ workItemId: 5, top: 10, skip: 2 });
      expect(witApi.getUpdates).toHaveBeenCalledWith(5, 10, 2, undefined);
      expect(unwrap(result)).toEqual([{ id: 1 }]);

      witApi.getUpdate.mockResolvedValue({ id: 3 });
      await handlerFor(WORKITEM_TOOLS.list_work_item_updates)({ project: "Contoso", workItemId: 5, updateNumber: 3 });
      expect(witApi.getUpdate).toHaveBeenCalledWith(5, 3, "Contoso");
    });

    it("gets a revision with an expand, or reports it missing", async () => {
      witApi.getRevision.mockResolvedValue({ id: 5, rev: 2 });
      await handlerFor(WORKITEM_TOOLS.get_work_item_revision)({ workItemId: 5, revision: 2, expand: "Relations" });
      expect(witApi.getRevision).toHaveBeenCalledWith(5, 2, WorkItemExpand.Relations, undefined);

      witApi.getRevision.mockResolvedValue(null);
      const result = await handlerFor(WORKITEM_TOOLS.get_work_item_revision)({ workItemId: 5, revision: 99 });
      expect(result).toEqual({ content: [{ type: "text", text: "Revision 99 of work item 5 not found" }], isError: true });
    });

    it("lists the states of a type", async () => {
      witApi.getWorkItemTypeStates.mockResolvedValue([{ name: "New", category: "Proposed" }]);

      const result = await handlerFor(WORKITEM_TOOLS.list_work_item_type_states)({ project: "Contoso", type: "Bug" });

      expect(witApi.getWorkItemTypeStates).toHaveBeenCalledWith("Contoso", "Bug");
      expect(parsed(result)).toEqual([{ name: "New", category: "Proposed" }]);
    });

    it("lists the fields of a type with allowed values, or one field", async () => {
      witApi.getWorkItemTypeFieldsWithReferences.mockResolvedValue([]);
      await handlerFor(WORKITEM_TOOLS.list_work_item_type_fields)({ project: "Contoso", type: "Bug", expand: "AllowedValues" });
      expect(witApi.getWorkItemTypeFieldsWithReferences).toHaveBeenCalledWith("Contoso", "Bug", WorkItemTypeFieldsExpandLevel.AllowedValues);

      witApi.getWorkItemTypeFieldWithReferences.mockResolvedValue({ allowedValues: ["1", "2"] });
      const one = await handlerFor(WORKITEM_TOOLS.list_work_item_type_fields)({ project: "Contoso", type: "Bug", field: "Microsoft.VSTS.Common.Priority", expand: "All" });
      expect(witApi.getWorkItemTypeFieldWithReferences).toHaveBeenCalledWith("Contoso", "Bug", "Microsoft.VSTS.Common.Priority", WorkItemTypeFieldsExpandLevel.All);
      expect(parsed(one)).toEqual({ allowedValues: ["1", "2"] });

      witApi.getWorkItemTypeFieldWithReferences.mockResolvedValue(null);
      const missing = await handlerFor(WORKITEM_TOOLS.list_work_item_type_fields)({ project: "Contoso", type: "Bug", field: "Custom.Ghost", expand: "None" });
      expect(missing.content[0].text).toBe("Field 'Custom.Ghost' not found on 'Bug'");
    });

    it("searches saved queries", async () => {
      witApi.searchQueries.mockResolvedValue({ value: [{ name: "Active bugs" }], hasMore: false });

      const result = await handlerFor(WORKITEM_TOOLS.search_queries)({ project: "Contoso", filter: "bugs", top: 10, includeDeleted: true });

      expect(witApi.searchQueries).toHaveBeenCalledWith("Contoso", "bugs", 10, undefined, true);
      expect(parsed(result)).toMatchObject({ value: [{ name: "Active bugs" }] });
    });

    it("stops searching queries when the project selection is cancelled", async () => {
      elicitInput.mockResolvedValue({ action: "cancel" });

      const result = await handlerFor(WORKITEM_TOOLS.search_queries)({ filter: "bugs", top: 10 });

      expect(result.content[0].text).toBe("Project selection cancelled.");
    });

    it("finds work items linked to artifacts", async () => {
      witApi.queryWorkItemsForArtifactUris.mockResolvedValue({ artifactUrisQueryResult: { "vstfs:///Build/Build/7": [{ id: 116 }] } });

      const result = await handlerFor(WORKITEM_TOOLS.list_work_items_for_artifacts)({ artifactUris: ["vstfs:///Build/Build/7"] });

      expect(witApi.queryWorkItemsForArtifactUris).toHaveBeenCalledWith({ artifactUris: ["vstfs:///Build/Build/7"] }, undefined);
      expect(parsed(result)).toEqual({ "vstfs:///Build/Build/7": [{ id: 116 }] });
    });

    it("returns an empty map when nothing is linked", async () => {
      witApi.queryWorkItemsForArtifactUris.mockResolvedValue({});

      expect(parsed(await handlerFor(WORKITEM_TOOLS.list_work_items_for_artifacts)({ artifactUris: ["x"] }))).toEqual({});
    });
  });

  describe("deletion, fields and process migration", () => {
    const respond = (body: string, status = 200) => mockFetch.mockResolvedValue({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });

    it("deletes work items in one batch request", async () => {
      respond('{"results":[{"id":1,"statusCode":200}]}');

      const result = await handlerFor(WORKITEM_TOOLS.delete_work_items)({ project: "Contoso", ids: [1, 2], destroy: false, skipNotifications: true });

      const [url, init] = mockFetch.mock.calls[0] as [string, { method: string; body: string; headers: Record<string, string> }];
      expect(url).toBe("https://dev.azure.com/contoso/Contoso/_apis/wit/workitemsdelete?api-version=7.1");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer token");
      expect(JSON.parse(init.body)).toEqual({ ids: [1, 2], destroy: false, skipNotifications: true });
      expect(result.content[0].text).toBe('{"results":[{"id":1,"statusCode":200}]}');
    });

    it("surfaces a rejected batch deletion", async () => {
      respond("forbidden", 403);

      const result = await handlerFor(WORKITEM_TOOLS.delete_work_items)({ project: "Contoso", ids: [1], destroy: true });

      expect(result).toEqual({ content: [{ type: "text", text: "Error deleting work items: 403: forbidden" }], isError: true });
    });

    it("stops a batch deletion when the project selection is cancelled", async () => {
      elicitInput.mockResolvedValue({ action: "cancel" });

      const result = await handlerFor(WORKITEM_TOOLS.delete_work_items)({ ids: [1], destroy: false });

      expect(result.content[0].text).toBe("Project selection cancelled.");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("deletes an attachment, scoped to a project when given", async () => {
      respond("", 204);
      await handlerFor(WORKITEM_TOOLS.delete_attachment)({ project: "Contoso", attachmentId: "a-1" });
      expect(mockFetch.mock.calls[0][0]).toBe("https://dev.azure.com/contoso/Contoso/_apis/wit/attachments/a-1?api-version=7.1");
      expect((mockFetch.mock.calls[0][1] as { method: string }).method).toBe("DELETE");

      mockFetch.mockClear();
      respond("", 204);
      const result = await handlerFor(WORKITEM_TOOLS.delete_attachment)({ attachmentId: "a-1" });
      expect(mockFetch.mock.calls[0][0]).toBe("https://dev.azure.com/contoso/_apis/wit/attachments/a-1?api-version=7.1");
      expect(parsed(result)).toEqual({ deleted: "a-1" });
    });

    it("surfaces a failed attachment deletion", async () => {
      respond("not found", 404);

      const result = await handlerFor(WORKITEM_TOOLS.delete_attachment)({ attachmentId: "ghost" });

      expect(result.content[0].text).toBe("Error deleting attachment ghost: 404: not found");
    });

    it("deletes and restores a field", async () => {
      witApi.deleteField.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(WORKITEM_TOOLS.delete_field)({ field: "Custom.Impact" }))).toEqual({ deleted: "Custom.Impact" });
      expect(witApi.deleteField).toHaveBeenCalledWith("Custom.Impact");

      witApi.updateField.mockResolvedValue({ referenceName: "Custom.Impact", isDeleted: false });
      expect(parsed(await handlerFor(WORKITEM_TOOLS.restore_field)({ field: "Custom.Impact" }))).toMatchObject({ isDeleted: false });
      expect(witApi.updateField).toHaveBeenCalledWith({ isDeleted: false }, "Custom.Impact");
    });

    it("moves a project to another process", async () => {
      witApi.migrateProjectsProcess.mockResolvedValue({ projectId: "p", processId: "proc" });

      const result = await handlerFor(WORKITEM_TOOLS.migrate_project_process)({ project: "Contoso", processTypeId: "proc" });

      expect(witApi.migrateProjectsProcess).toHaveBeenCalledWith({ typeId: "proc" }, "Contoso");
      expect(parsed(result)).toEqual({ projectId: "p", processId: "proc" });
    });

    it.each([
      [WORKITEM_TOOLS.delete_work_item_comment, "deleteComment", { project: "C", workItemId: 1, commentId: 2 }, "deleting comment 2"],
      [WORKITEM_TOOLS.list_work_item_comment_versions, "getCommentVersions", { project: "C", workItemId: 1, commentId: 2 }, "listing versions of comment 2"],
      [WORKITEM_TOOLS.list_work_item_updates, "getUpdates", { workItemId: 1 }, "listing updates of work item 1"],
      [WORKITEM_TOOLS.get_work_item_revision, "getRevision", { workItemId: 1, revision: 2 }, "getting revision 2 of work item 1"],
      [WORKITEM_TOOLS.list_work_item_type_states, "getWorkItemTypeStates", { project: "C", type: "Bug" }, "listing states of 'Bug'"],
      [WORKITEM_TOOLS.list_work_item_type_fields, "getWorkItemTypeFieldsWithReferences", { project: "C", type: "Bug", expand: "None" }, "listing fields of 'Bug'"],
      [WORKITEM_TOOLS.search_queries, "searchQueries", { project: "C", filter: "x", top: 1 }, "searching queries for 'x'"],
      [WORKITEM_TOOLS.list_work_items_for_artifacts, "queryWorkItemsForArtifactUris", { artifactUris: ["x"] }, "looking up work items for artifacts"],
      [WORKITEM_TOOLS.delete_field, "deleteField", { field: "F" }, "deleting field 'F'"],
      [WORKITEM_TOOLS.restore_field, "updateField", { field: "F" }, "restoring field 'F'"],
      [WORKITEM_TOOLS.migrate_project_process, "migrateProjectsProcess", { project: "C", processTypeId: "p" }, "moving project 'C' to process p"],
    ])("%s surfaces an API failure", async (tool, method, args, action) => {
      witApi[method].mockRejectedValue(new Error("TF401232"));

      const result = await handlerFor(tool)(args);

      expect(result).toEqual({ content: [{ type: "text", text: `Error ${action}: TF401232` }], isError: true });
    });
  });
});

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configureWikiTools, WIKI_TOOLS } from "../../../src/tools/wiki";
import { createToolServer } from "../../mocks/tool-server";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text?: string; resource?: { uri: string; mimeType: string; blob: string } }[]; isError?: boolean }>;

describe("wiki page comments", () => {
  let server: McpServer;
  let mockFetch: jest.Mock;
  const base = "https://dev.azure.com/contoso/My%20Project/_apis/wiki/wikis/Docs.wiki";
  const project = { project: "My Project", wikiIdentifier: "Docs.wiki" };

  beforeEach(() => {
    server = createToolServer() as unknown as McpServer;
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    configureWikiTools(
      server,
      () => Promise.resolve("fake-token"),
      () => Promise.resolve({ serverUrl: "https://dev.azure.com/contoso/" } as unknown as WebApi),
      () => "Jest"
    );
  });

  function tool(name: string): Handler {
    const call = (server.tool as jest.Mock).mock.calls.find(([registered]) => registered === name);
    if (!call) throw new Error(`${name} not registered`);
    return call[3] as Handler;
  }

  const respondText = (body: string, status = 200) => mockFetch.mockResolvedValue({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });
  const respondBinary = (bytes: Buffer, status = 200) =>
    mockFetch.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(bytes.toString("utf-8")),
      arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    });

  it("registers every page comment tool", () => {
    for (const name of [
      WIKI_TOOLS.list_page_comments,
      WIKI_TOOLS.get_page_comment,
      WIKI_TOOLS.add_page_comment,
      WIKI_TOOLS.update_page_comment,
      WIKI_TOOLS.delete_page_comment,
      WIKI_TOOLS.add_page_comment_reaction,
      WIKI_TOOLS.remove_page_comment_reaction,
      WIKI_TOOLS.list_page_comment_reaction_users,
      WIKI_TOOLS.upload_page_comment_attachment,
      WIKI_TOOLS.get_page_comment_attachment,
    ]) {
      expect(() => tool(name)).not.toThrow();
    }
  });

  describe("wiki_list_page_comments", () => {
    it("lists comments with every optional filter", async () => {
      respondText('{"totalCount":1,"count":1,"comments":[{"id":354431}]}');

      const result = await tool(WIKI_TOOLS.list_page_comments)({
        ...project,
        pageId: 12,
        top: 5,
        continuationToken: "2026-09-18T08:15:07.98Z",
        excludeDeleted: true,
        expand: "renderedText",
        order: "asc",
      });

      expect(mockFetch.mock.calls[0][0]).toBe(
        `${base}/pages/12/comments?api-version=7.2-preview.1&%24top=5&continuationToken=2026-09-18T08%3A15%3A07.98Z&excludeDeleted=true&%24expand=renderedText&order=asc`
      );
      expect((mockFetch.mock.calls[0][1] as { method: string }).method).toBe("GET");
      expect(result.content[0].text).toBe('{"totalCount":1,"count":1,"comments":[{"id":354431}]}');
    });

    it("lists comments with no optional filters", async () => {
      respondText('{"totalCount":0,"count":0,"comments":[]}');

      await tool(WIKI_TOOLS.list_page_comments)({ ...project, pageId: 12 });

      expect(mockFetch.mock.calls[0][0]).toBe(`${base}/pages/12/comments?api-version=7.2-preview.1`);
    });

    it("lists the replies to one comment with parentId", async () => {
      respondText('{"totalCount":1,"count":1,"comments":[{"id":354780,"parentId":354779}]}');

      await tool(WIKI_TOOLS.list_page_comments)({ ...project, pageId: 49, parentId: 354779 });

      expect(mockFetch.mock.calls[0][0]).toBe(`${base}/pages/49/comments?api-version=7.2-preview.1&parentId=354779`);
    });

    it("surfaces REST errors", async () => {
      respondText("The wiki page id '999' does not exist.", 404);

      const result = await tool(WIKI_TOOLS.list_page_comments)({ ...project, pageId: 999 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error listing comments on wiki page 999: 404: The wiki page id '999' does not exist.");
    });
  });

  describe("wiki_get_page_comment", () => {
    it("gets a comment by ID", async () => {
      respondText('{"id":354431,"text":"hello"}');

      const result = await tool(WIKI_TOOLS.get_page_comment)({ ...project, pageId: 12, commentId: 354431 });

      expect(mockFetch.mock.calls[0][0]).toBe(`${base}/pages/12/comments/354431?api-version=7.2-preview.1`);
      expect(result.content[0].text).toBe('{"id":354431,"text":"hello"}');
    });

    it("passes excludeDeleted and expand", async () => {
      respondText('{"id":354431}');

      await tool(WIKI_TOOLS.get_page_comment)({ ...project, pageId: 12, commentId: 354431, excludeDeleted: false, expand: "reactions" });

      expect(mockFetch.mock.calls[0][0]).toBe(`${base}/pages/12/comments/354431?api-version=7.2-preview.1&excludeDeleted=false&%24expand=reactions`);
    });

    it("surfaces a missing comment as an error", async () => {
      respondText("The comment does not exist.", 404);

      const result = await tool(WIKI_TOOLS.get_page_comment)({ ...project, pageId: 12, commentId: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error getting wiki page comment 1: 404: The comment does not exist.");
    });
  });

  describe("wiki_add_page_comment", () => {
    it("adds a top-level comment", async () => {
      respondText('{"id":354432,"text":"new comment"}', 200);

      const result = await tool(WIKI_TOOLS.add_page_comment)({ ...project, pageId: 12, text: "new comment" });

      const [url, init] = mockFetch.mock.calls[0] as [string, { method: string; body: string }];
      expect(url).toBe(`${base}/pages/12/comments?api-version=7.2-preview.1`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({ text: "new comment" });
      expect(result.content[0].text).toBe('{"id":354432,"text":"new comment"}');
    });

    it("adds a reply with parentId", async () => {
      respondText('{"id":354433}');

      await tool(WIKI_TOOLS.add_page_comment)({ ...project, pageId: 12, text: "a reply", parentId: 354431 });

      const init = mockFetch.mock.calls[0][1] as { body: string };
      expect(JSON.parse(init.body)).toEqual({ text: "a reply", parentId: 354431 });
    });

    it("surfaces REST errors", async () => {
      respondText("Comments are disabled on this wiki.", 400);

      const result = await tool(WIKI_TOOLS.add_page_comment)({ ...project, pageId: 12, text: "x" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error adding a comment to wiki page 12: 400: Comments are disabled on this wiki.");
    });
  });

  describe("wiki_update_page_comment", () => {
    it("updates a comment's text", async () => {
      respondText('{"id":354431,"text":"edited","version":2}');

      const result = await tool(WIKI_TOOLS.update_page_comment)({ ...project, pageId: 12, commentId: 354431, text: "edited" });

      const [url, init] = mockFetch.mock.calls[0] as [string, { method: string; body: string }];
      expect(url).toBe(`${base}/pages/12/comments/354431?api-version=7.2-preview.1`);
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(init.body)).toEqual({ text: "edited" });
      expect(result.content[0].text).toBe('{"id":354431,"text":"edited","version":2}');
    });

    it("surfaces REST errors", async () => {
      respondText("Only the author can edit this comment.", 403);

      const result = await tool(WIKI_TOOLS.update_page_comment)({ ...project, pageId: 12, commentId: 354431, text: "edited" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error updating wiki page comment 354431: 403: Only the author can edit this comment.");
    });
  });

  describe("wiki_delete_page_comment", () => {
    it("deletes a comment", async () => {
      respondText("");

      const result = await tool(WIKI_TOOLS.delete_page_comment)({ ...project, pageId: 12, commentId: 354431 });

      const [url, init] = mockFetch.mock.calls[0] as [string, { method: string }];
      expect(url).toBe(`${base}/pages/12/comments/354431?api-version=7.2-preview.1`);
      expect(init.method).toBe("DELETE");
      expect(result.content[0].text).toBe("Done.");
    });

    it("surfaces REST errors", async () => {
      respondText("The comment does not exist.", 404);

      const result = await tool(WIKI_TOOLS.delete_page_comment)({ ...project, pageId: 12, commentId: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error deleting wiki page comment 1: 404: The comment does not exist.");
    });
  });

  describe("wiki_add_page_comment_reaction", () => {
    it("reacts to a comment", async () => {
      respondText('{"type":"like","count":1,"isCurrentUserEngaged":true}');

      const result = await tool(WIKI_TOOLS.add_page_comment_reaction)({ ...project, pageId: 12, commentId: 354431, reaction: "like" });

      const [url, init] = mockFetch.mock.calls[0] as [string, { method: string }];
      expect(url).toBe(`${base}/pages/12/comments/354431/reactions/like?api-version=7.2-preview.1`);
      expect(init.method).toBe("PUT");
      expect(result.content[0].text).toBe('{"type":"like","count":1,"isCurrentUserEngaged":true}');
    });

    it("surfaces REST errors", async () => {
      respondText("Unknown reaction type.", 400);

      const result = await tool(WIKI_TOOLS.add_page_comment_reaction)({ ...project, pageId: 12, commentId: 354431, reaction: "heart" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error adding reaction heart to wiki page comment 354431: 400: Unknown reaction type.");
    });
  });

  describe("wiki_remove_page_comment_reaction", () => {
    it("withdraws a reaction", async () => {
      respondText("");

      const result = await tool(WIKI_TOOLS.remove_page_comment_reaction)({ ...project, pageId: 12, commentId: 354431, reaction: "like" });

      const [url, init] = mockFetch.mock.calls[0] as [string, { method: string }];
      expect(url).toBe(`${base}/pages/12/comments/354431/reactions/like?api-version=7.2-preview.1`);
      expect(init.method).toBe("DELETE");
      expect(result.content[0].text).toBe("Done.");
    });

    it("surfaces REST errors", async () => {
      respondText("The comment does not exist.", 404);

      const result = await tool(WIKI_TOOLS.remove_page_comment_reaction)({ ...project, pageId: 12, commentId: 1, reaction: "like" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error removing reaction like from wiki page comment 1: 404: The comment does not exist.");
    });
  });

  describe("wiki_list_page_comment_reaction_users", () => {
    it("lists engaged users with paging", async () => {
      respondText('{"count":0,"value":[]}');

      const result = await tool(WIKI_TOOLS.list_page_comment_reaction_users)({ ...project, pageId: 12, commentId: 354431, reaction: "like", top: 5, skip: 1 });

      expect(mockFetch.mock.calls[0][0]).toBe(`${base}/pages/12/comments/354431/reactions/like/users?api-version=7.2-preview.1&%24top=5&%24skip=1`);
      expect(result.content[0].text).toBe('{"count":0,"value":[]}');
    });

    it("lists engaged users without paging", async () => {
      respondText('{"count":0,"value":[]}');

      await tool(WIKI_TOOLS.list_page_comment_reaction_users)({ ...project, pageId: 12, commentId: 354431, reaction: "like" });

      expect(mockFetch.mock.calls[0][0]).toBe(`${base}/pages/12/comments/354431/reactions/like/users?api-version=7.2-preview.1`);
    });

    it("surfaces REST errors", async () => {
      respondText("The comment does not exist.", 404);

      const result = await tool(WIKI_TOOLS.list_page_comment_reaction_users)({ ...project, pageId: 12, commentId: 1, reaction: "like" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error listing users who reacted like to wiki page comment 1: 404: The comment does not exist.");
    });
  });

  describe("wiki_upload_page_comment_attachment", () => {
    it("uploads decoded file bytes as octet-stream", async () => {
      respondText('{"id":"a1b2","url":"https://dev.azure.com/contoso/_apis/wiki/wikis/Docs.wiki/pages/12/comments/attachments/a1b2"}', 201);

      const result = await tool(WIKI_TOOLS.upload_page_comment_attachment)({ ...project, pageId: 12, fileName: "screenshot.png", contentBase64: "aGVsbG8=" });

      const [url, init] = mockFetch.mock.calls[0] as [string, { method: string; body: Buffer; headers: Record<string, string> }];
      expect(url).toBe(`${base}/pages/12/comments/attachments?fileName=screenshot.png&api-version=7.2-preview.1`);
      expect(init.method).toBe("POST");
      expect(Buffer.isBuffer(init.body)).toBe(true);
      expect(init.body.toString("utf-8")).toBe("hello");
      expect(init.headers["Content-Type"]).toBe("application/octet-stream");
      expect(result.content[0].text).toContain("a1b2");
    });

    it("strips whitespace from the base64 content before decoding", async () => {
      respondText('{"id":"a1b2"}', 201);

      await tool(WIKI_TOOLS.upload_page_comment_attachment)({ ...project, pageId: 12, fileName: "x.txt", contentBase64: "aGVs\nbG8=" });

      const init = mockFetch.mock.calls[0][1] as { body: Buffer };
      expect(init.body.toString("utf-8")).toBe("hello");
    });

    it("surfaces REST errors", async () => {
      respondText("too large", 413);

      const result = await tool(WIKI_TOOLS.upload_page_comment_attachment)({ ...project, pageId: 12, fileName: "big.bin", contentBase64: "AAAA" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error uploading wiki page comment attachment big.bin: 413: too large");
    });
  });

  describe("wiki_get_page_comment_attachment", () => {
    it("returns a binary attachment as a base64 resource", async () => {
      respondBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const result = await tool(WIKI_TOOLS.get_page_comment_attachment)({ ...project, pageId: 12, attachmentId: "a1b2", fileName: "screenshot.png" });

      expect(mockFetch.mock.calls[0][0]).toBe(`${base}/pages/12/comments/attachments/a1b2?api-version=7.2-preview.1`);
      expect(result.content[0].type).toBe("resource");
      expect(result.content[0].resource?.mimeType).toBe("image/png");
      expect(result.content[0].resource?.blob).toBe(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"));
    });

    it("returns a text attachment as external content", async () => {
      respondBinary(Buffer.from("plain text content", "utf-8"));

      const result = await tool(WIKI_TOOLS.get_page_comment_attachment)({ ...project, pageId: 12, attachmentId: "a1b2", fileName: "notes.txt" });

      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("plain text content");
    });

    it("defaults to a binary resource when fileName is omitted", async () => {
      respondBinary(Buffer.from([1, 2, 3]));

      const result = await tool(WIKI_TOOLS.get_page_comment_attachment)({ ...project, pageId: 12, attachmentId: "a1b2" });

      expect(result.content[0].type).toBe("resource");
      expect(result.content[0].resource?.mimeType).toBe("application/octet-stream");
    });

    it("surfaces REST errors", async () => {
      respondText("The attachment does not exist.", 404);

      const result = await tool(WIKI_TOOLS.get_page_comment_attachment)({ ...project, pageId: 12, attachmentId: "missing" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error downloading wiki page comment attachment: 404: The attachment does not exist.");
    });

    it("reports non-Error failures", async () => {
      mockFetch.mockRejectedValue("boom");

      const result = await tool(WIKI_TOOLS.get_page_comment_attachment)({ ...project, pageId: 12, attachmentId: "a1b2" });

      expect(result.content[0].text).toBe("Error downloading wiki page comment attachment: boom");
    });
  });
});

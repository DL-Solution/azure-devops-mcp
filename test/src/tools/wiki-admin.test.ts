// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configureWikiTools, WIKI_TOOLS } from "../../../src/tools/wiki";
import { createToolServer } from "../../mocks/tool-server";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

describe("wiki administration", () => {
  let server: McpServer;
  let mockFetch: jest.Mock;
  const base = "https://dev.azure.com/contoso/My%20Project/_apis/wiki/wikis/Docs.wiki";

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

  const respond = (body: string, status = 200) => mockFetch.mockResolvedValue({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });
  const project = { project: "My Project", wikiIdentifier: "Docs.wiki" };

  it("renames a wiki and replaces its published branches", async () => {
    respond('{"name":"Handbook"}');

    const result = await tool(WIKI_TOOLS.update_wiki)({ ...project, name: "Handbook", versions: ["main"] });

    const [url, init] = mockFetch.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe(`${base}?api-version=7.2-preview.2`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ name: "Handbook", versions: [{ version: "main", versionType: "branch" }] });
    expect(result.content[0].text).toContain("Handbook");
  });

  it("refuses a wiki update with nothing to change", async () => {
    const result = await tool(WIKI_TOOLS.update_wiki)(project);

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("deletes a wiki", async () => {
    respond("");

    const result = await tool(WIKI_TOOLS.delete_wiki)(project);

    expect(mockFetch.mock.calls[0][0]).toBe(`${base}?api-version=7.2-preview.2`);
    expect((mockFetch.mock.calls[0][1] as { method: string }).method).toBe("DELETE");
    expect(result.content[0].text).toBe("Done.");
  });

  it("gets page view stats", async () => {
    respond('{"id":12,"viewStats":[]}');

    await tool(WIKI_TOOLS.get_page_stats)({ ...project, pageId: 12, pageViewsForDays: 30 });

    expect(mockFetch.mock.calls[0][0]).toBe(`${base}/pages/12/stats?api-version=7.2-preview.1&pageViewsForDays=30`);
  });

  it("reports a missing page as an error", async () => {
    respond("The wiki page id '1' does not exist.", 404);

    const result = await tool(WIKI_TOOLS.get_page_stats)({ ...project, pageId: 1 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error getting stats of wiki page 1: 404: The wiki page id '1' does not exist.");
  });

  it("deletes a page by path on a branch", async () => {
    respond("{}");

    await tool(WIKI_TOOLS.delete_page)({ ...project, path: "/Drafts/Old", comment: "cleanup", branch: "main" });

    const [url, init] = mockFetch.mock.calls[0] as [string, { method: string }];
    expect(url).toBe(`${base}/pages?api-version=7.2-preview.1&comment=cleanup&path=%2FDrafts%2FOld&versionDescriptor.version=main&versionDescriptor.versionType=branch`);
    expect(init.method).toBe("DELETE");
  });

  it("deletes a page by ID", async () => {
    respond("");

    const result = await tool(WIKI_TOOLS.delete_page)({ ...project, pageId: 7 });

    expect(mockFetch.mock.calls[0][0]).toBe(`${base}/pages/7?api-version=7.2-preview.1`);
    expect(result.content[0].text).toBe("Done.");
  });

  it("needs exactly one of path or page ID to delete", async () => {
    expect((await tool(WIKI_TOOLS.delete_page)(project)).isError).toBe(true);
    expect((await tool(WIKI_TOOLS.delete_page)({ ...project, path: "/a", pageId: 1 })).isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("moves a page", async () => {
    respond('{"page":{}}');

    await tool(WIKI_TOOLS.move_page)({ ...project, path: "/Drafts/Overview", newPath: "/Architecture/Overview", newOrder: 0 });

    const [url, init] = mockFetch.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe(`${base}/pagemoves?api-version=7.2-preview.1`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ path: "/Drafts/Overview", newPath: "/Architecture/Overview", newOrder: 0 });
  });

  it("surfaces REST errors", async () => {
    respond("page not found", 404);

    const result = await tool(WIKI_TOOLS.move_page)({ ...project, path: "/x", newPath: "/y" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error moving wiki page /x: 404: page not found");
  });

  it("uploads an attachment as base64 text", async () => {
    respond('{"name":"diagram.png","path":"/.attachments/diagram.png"}', 201);

    const result = await tool(WIKI_TOOLS.upload_attachment)({ ...project, name: "diagram.png", contentBase64: "iVBO\nRw0K", branch: "main" });

    const [url, init] = mockFetch.mock.calls[0] as [string, { method: string; body: string; headers: Record<string, string> }];
    expect(url).toBe(`${base}/attachments?name=diagram.png&api-version=7.2-preview.1&versionDescriptor.version=main&versionDescriptor.versionType=branch`);
    expect(init.method).toBe("PUT");
    expect(init.body).toBe("iVBORw0K");
    expect(init.headers["Content-Type"]).toBe("application/octet-stream");
    expect(result.content[0].text).toContain("/.attachments/diagram.png");
  });

  it("surfaces attachment upload errors", async () => {
    respond("too large", 413);

    const result = await tool(WIKI_TOOLS.upload_attachment)({ ...project, name: "big.bin", contentBase64: "AAAA" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error uploading wiki attachment big.bin: 413: too large");
  });

  it("reports non-Error failures", async () => {
    mockFetch.mockRejectedValue("boom");

    const result = await tool(WIKI_TOOLS.delete_wiki)(project);

    expect(result.content[0].text).toBe("Error deleting wiki Docs.wiki: boom");
  });
});

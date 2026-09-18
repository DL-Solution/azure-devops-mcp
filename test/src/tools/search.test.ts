// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";

import { configureSearchTools, SEARCH_TOOLS } from "../../../src/tools/search";
import { createToolServer } from "../../mocks/tool-server";

describe("configureSearchTools", () => {
  let server: McpServer;
  let tokenProvider: () => Promise<string>;
  let connectionProvider: () => Promise<WebApi>;
  let mockFetch: jest.Mock;
  let mockGitApi: { getItem: jest.Mock; getItems: jest.Mock };

  beforeEach(() => {
    server = createToolServer() as unknown as McpServer;
    tokenProvider = jest.fn(() => Promise.resolve("fake-token")) as () => Promise<string>;
    mockGitApi = { getItem: jest.fn(), getItems: jest.fn() };
    connectionProvider = jest.fn().mockResolvedValue({
      serverUrl: "https://dev.azure.com/contoso",
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    } as unknown as WebApi) as () => Promise<WebApi>;
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  function getHandler(toolName: string) {
    configureSearchTools(server, tokenProvider, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
  }

  const ok = (body: string, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: () => Promise.resolve(body),
  });

  it("registers all three search tools", () => {
    configureSearchTools(server, tokenProvider, connectionProvider, () => "Jest");
    const names = (server.tool as jest.Mock).mock.calls.map(([name]) => name);
    expect(names).toEqual(expect.arrayContaining([SEARCH_TOOLS.search_code, SEARCH_TOOLS.search_wiki, SEARCH_TOOLS.search_workitem]));
  });

  describe("search_wiki", () => {
    it("posts to the almsearch host with the search text and paging", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_wiki);
      mockFetch.mockResolvedValue(ok('{"count":0,"results":[]}'));

      const result = await handler({ searchText: "onboarding", includeFacets: false, skip: 0, top: 10 });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://almsearch.dev.azure.com/contoso/_apis/search/wikisearchresults?api-version=7.2-preview.1");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer fake-token");
      expect(JSON.parse(init.body)).toMatchObject({ searchText: "onboarding", $skip: 0, $top: 10 });
      expect(result.content[0].text).toContain("count");
    });

    it("sends project and wiki filters only when provided", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_wiki);
      mockFetch.mockResolvedValue(ok("{}"));

      await handler({ searchText: "release", project: ["Contoso"], wiki: ["Docs"], includeFacets: true, skip: 5, top: 20 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.filters).toEqual({ Project: ["Contoso"], Wiki: ["Docs"] });
      expect(body.includeFacets).toBe(true);
      expect(body.$skip).toBe(5);
    });

    it("omits the filters object when no filter is given", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_wiki);
      mockFetch.mockResolvedValue(ok("{}"));

      await handler({ searchText: "release", includeFacets: false, skip: 0, top: 10 });

      expect(JSON.parse(mockFetch.mock.calls[0][1].body).filters).toBeUndefined();
    });

    it("returns the page path the wiki tools take instead of the page's git file path", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_wiki);
      mockFetch.mockResolvedValue(
        ok(
          JSON.stringify({
            count: 3,
            results: [
              { path: "/Сервіси/Мікросервіс-«Адресний-класифікатор».md", wiki: { mappedPath: "/" } },
              { path: "/Q%26A/Pre%2Dflight-check%3A-steps.md", wiki: { mappedPath: "/" } },
              { path: "/docs/Getting-started.md", wiki: { mappedPath: "/docs" } },
            ],
          })
        )
      );

      const result = await handler({ searchText: "x", includeFacets: false, skip: 0, top: 10 });

      const paths = JSON.parse(result.content[0].text).results.map((r: { path: string }) => r.path);
      expect(paths).toEqual(["/Сервіси/Мікросервіс «Адресний класифікатор»", "/Q&A/Pre-flight check: steps", "/Getting started"]);
    });

    it("keeps a malformed percent sequence as it is instead of failing", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_wiki);
      mockFetch.mockResolvedValue(ok(JSON.stringify({ count: 1, results: [{ path: "/100%-done.md" }] })));

      const result = await handler({ searchText: "x", includeFacets: false, skip: 0, top: 10 });

      expect(JSON.parse(result.content[0].text).results[0].path).toBe("/100% done");
    });

    it("keeps the project, the wiki and the highlights but drops the per-letter pattern hits", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_wiki);
      mockFetch.mockResolvedValue(
        ok(
          JSON.stringify({
            count: 1,
            results: [
              {
                fileName: "Setup.md",
                path: "/Setup.md",
                collection: { name: "contoso" },
                project: { id: "p1", name: "Contoso", visibility: "Private" },
                wiki: { name: "Contoso.wiki", id: "w1", mappedPath: "/", version: "wikiMaster" },
                contentId: "abc",
                hits: [
                  { fieldReferenceName: "fileNames.pattern", highlights: ["S<highlighthit>e</highlighthit>tup"] },
                  { fieldReferenceName: "content.pattern", highlights: ["<highlighthit>a</highlighthit>"] },
                  { fieldReferenceName: "fileNames", highlights: ["<highlighthit>Setup</highlighthit>"] },
                  { fieldReferenceName: "content", highlights: ["Run <highlighthit>setup</highlighthit> first.", "Then test."] },
                ],
              },
            ],
            infoCode: 0,
            facets: {},
          })
        )
      );

      const result = await handler({ searchText: "setup", includeFacets: false, skip: 0, top: 10 });

      expect(JSON.parse(result.content[0].text)).toEqual({
        count: 1,
        results: [
          {
            project: "Contoso",
            wiki: "Contoso.wiki",
            path: "/Setup",
            highlights: ["<highlighthit>Setup</highlighthit>", "Run <highlighthit>setup</highlighthit> first.", "Then test."],
          },
        ],
      });
    });

    it("passes facets through when they were asked for", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_wiki);
      mockFetch.mockResolvedValue(ok(JSON.stringify({ count: 0, results: [], facets: { Project: [{ name: "Contoso", resultCount: 3 }] } })));

      const result = await handler({ searchText: "x", includeFacets: true, skip: 0, top: 10 });

      expect(JSON.parse(result.content[0].text).facets).toEqual({ Project: [{ name: "Contoso", resultCount: 3 }] });
    });

    it("throws when the search API rejects the request", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_wiki);
      mockFetch.mockResolvedValue(ok("", 403));

      await expect(handler({ searchText: "secret", includeFacets: false, skip: 0, top: 10 })).rejects.toThrow(/403/);
    });
  });

  describe("search_workitem", () => {
    it("posts the work item query with its filters", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_workitem);
      mockFetch.mockResolvedValue(ok('{"count":1,"results":[]}'));

      const result = await handler({
        searchText: "login fails",
        project: ["Contoso"],
        areaPath: ["Contoso\\Web"],
        workItemType: ["Bug"],
        state: ["Active"],
        assignedTo: ["ada@contoso.com"],
        includeFacets: false,
        skip: 0,
        top: 10,
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/_apis/search/workitemsearchresults");
      const body = JSON.parse(init.body);
      expect(body.searchText).toBe("login fails");
      expect(body.filters).toEqual({
        "System.TeamProject": ["Contoso"],
        "System.AreaPath": ["Contoso\\Web"],
        "System.WorkItemType": ["Bug"],
        "System.State": ["Active"],
        "System.AssignedTo": ["ada@contoso.com"],
      });
      expect(result.content[0].text).toContain("count");
    });

    it("throws when the search API rejects the request", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_workitem);
      mockFetch.mockResolvedValue(ok("", 500));

      await expect(handler({ searchText: "x", includeFacets: false, skip: 0, top: 10 })).rejects.toThrow(/500/);
    });
  });

  describe("search_code", () => {
    it("normalizes a single project string into an array filter", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_code);
      mockFetch.mockResolvedValue(ok('{"results":[]}'));

      await handler({ searchText: "TODO", project: ["Contoso"], includeFacets: false, skip: 0, top: 5 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.filters).toEqual({ Project: ["Contoso"] });
    });

    it("throws when the code search API rejects the request", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_code);
      mockFetch.mockResolvedValue(ok("", 401));

      await expect(handler({ searchText: "TODO", includeFacets: false, skip: 0, top: 5 })).rejects.toThrow(/401/);
    });

    const codeResult = (path: string, offsets: number[], extra: Record<string, unknown> = {}) => ({
      fileName: path.split("/").pop(),
      path,
      matches: { content: offsets.map((charOffset) => ({ charOffset, length: 4, line: 0, column: 0, codeSnippet: null, type: "content" })), fileName: [] },
      collection: { name: "DefaultCollection" },
      project: { name: "Contoso", id: "p1" },
      repository: { name: "web", id: "r1", type: "git" },
      versions: [{ branchName: "main", changeId: "c0ffee" }],
      contentId: "abc",
      ...extra,
    });

    it("returns each file's matching lines with their numbers instead of the whole file", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_code);
      const content = "import x\r\n// TODO one\nconst a = 1; // TODO two\nend\n";
      mockFetch.mockResolvedValue(ok(JSON.stringify({ count: 1, results: [codeResult("/src/a.ts", [content.indexOf("TODO"), content.lastIndexOf("TODO")])], infoCode: 0 })));
      mockGitApi.getItem.mockResolvedValue({ content, path: "/src/a.ts", _links: {} });

      const result = await handler({ searchText: "TODO", includeFacets: false, skip: 0, top: 5 });

      expect(JSON.parse(result.content[0].text)).toEqual({
        count: 1,
        results: [
          {
            project: "Contoso",
            repository: "web",
            branch: "main",
            path: "/src/a.ts",
            commitId: "c0ffee",
            matches: [
              { line: 2, text: "// TODO one" },
              { line: 3, text: "const a = 1; // TODO two" },
            ],
          },
        ],
      });
      const [repositoryId, path, project] = mockGitApi.getItem.mock.calls[0];
      expect([repositoryId, path, project]).toEqual(["r1", "/src/a.ts", "p1"]);
      expect(mockGitApi.getItem.mock.calls[0][8]).toMatchObject({ version: "c0ffee" });
    });

    it("lists a line once however many matches it holds, and counts the lines past the limit", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_code);
      const content = Array.from({ length: 15 }, (_, i) => `hit hit ${i}`).join("\n");
      const offsets = content.split("\n").flatMap((line, i) => {
        const start = content.split("\n").slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
        return [start, start + 4];
      });
      mockFetch.mockResolvedValue(ok(JSON.stringify({ count: 1, results: [codeResult("/a.txt", offsets)] })));
      mockGitApi.getItem.mockResolvedValue({ content });

      const result = await handler({ searchText: "hit", includeFacets: false, skip: 0, top: 5 });

      const file = JSON.parse(result.content[0].text).results[0];
      expect(file.matches).toHaveLength(10);
      expect(file.matches[0]).toEqual({ line: 1, text: "hit hit 0" });
      expect(file.moreMatches).toBe(5);
    });

    it("cuts a very long line down to the part around the match", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_code);
      const content = `${"a".repeat(5000)}NEEDLE${"b".repeat(5000)}`;
      mockFetch.mockResolvedValue(ok(JSON.stringify({ count: 1, results: [codeResult("/min.js", [5000])] })));
      mockGitApi.getItem.mockResolvedValue({ content });

      const result = await handler({ searchText: "NEEDLE", includeFacets: false, skip: 0, top: 5 });

      const { text } = JSON.parse(result.content[0].text).results[0].matches[0];
      expect(text).toContain("NEEDLE");
      expect(text.length).toBeLessThanOrEqual(202);
      expect(text.startsWith("…")).toBe(true);
      expect(text.endsWith("…")).toBe(true);
    });

    it("marks a file name match and skips fetching a file with no content matches", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_code);
      mockFetch.mockResolvedValue(ok(JSON.stringify({ count: 1, results: [codeResult("/todo.md", [], { matches: { content: [], fileName: [{ charOffset: 0, length: 4 }] } })] })));

      const result = await handler({ searchText: "todo", includeFacets: false, skip: 0, top: 5 });

      expect(JSON.parse(result.content[0].text).results[0]).toMatchObject({ path: "/todo.md", fileNameMatch: true });
      expect(mockGitApi.getItem).not.toHaveBeenCalled();
    });

    it("reports a file it could not read next to the others instead of failing the search", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_code);
      mockFetch.mockResolvedValue(ok(JSON.stringify({ count: 2, results: [codeResult("/gone.ts", [0]), codeResult("/ok.ts", [0])] })));
      mockGitApi.getItem.mockRejectedValueOnce(new Error("TF401174: The item could not be found")).mockResolvedValueOnce({ content: "TODO" });

      const result = await handler({ searchText: "TODO", includeFacets: false, skip: 0, top: 5 });

      const [gone, found] = JSON.parse(result.content[0].text).results;
      expect(gone).toMatchObject({ path: "/gone.ts", error: "TF401174: The item could not be found" });
      expect(gone.matches).toBeUndefined();
      expect(found.matches).toEqual([{ line: 1, text: "TODO" }]);
    });

    it("says why it cannot show the lines of a result that names no commit", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_code);
      mockFetch.mockResolvedValue(ok(JSON.stringify({ count: 1, results: [codeResult("/a.ts", [0], { versions: [] })] })));

      const result = await handler({ searchText: "x", includeFacets: false, skip: 0, top: 5 });

      expect(JSON.parse(result.content[0].text).results[0].error).toMatch(/does not name the project, repository, path and commit/);
      expect(mockGitApi.getItem).not.toHaveBeenCalled();
    });

    it("explains a non-zero infoCode instead of passing off an unready index as no matches", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_code);
      mockFetch.mockResolvedValue(ok('{"count":0,"results":[],"infoCode":6}'));

      const result = await handler({ searchText: "image", includeFacets: false, skip: 0, top: 5 });

      expect(result.content[0].text).toMatch(/^Search returned infoCode 6: the organization is being onboarded .*an empty result does not mean nothing matches\.\n\{"count":0/);
    });
  });

  describe("infoCode notes", () => {
    it("adds no note when infoCode is 0", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_workitem);
      mockFetch.mockResolvedValue(ok('{"count":0,"results":[],"infoCode":0}'));

      const result = await handler({ searchText: "x", includeFacets: false, skip: 0, top: 10 });

      expect(result.content[0].text).toBe('{"count":0,"results":[],"infoCode":0}');
    });

    it("describes a code that does not mean the index is unready without the incompleteness warning", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_wiki);
      mockFetch.mockResolvedValue(ok('{"count":0,"results":[],"infoCode":4}'));

      const result = await handler({ searchText: "*log", includeFacets: false, skip: 0, top: 10 });

      expect(result.content[0].text).toBe('Search returned infoCode 4: prefix wildcard queries are not supported.\n{"count":0,"results":[]}');
    });

    it("labels an undocumented code as such", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_workitem);
      mockFetch.mockResolvedValue(ok('{"count":0,"infoCode":42}'));

      const result = await handler({ searchText: "x", includeFacets: false, skip: 0, top: 10 });

      expect(result.content[0].text).toMatch(/^Search returned infoCode 42: an undocumented condition/);
    });

    it("leaves a body that is not JSON untouched", async () => {
      const handler = getHandler(SEARCH_TOOLS.search_wiki);
      mockFetch.mockResolvedValue(ok("not json"));

      const result = await handler({ searchText: "x", includeFacets: false, skip: 0, top: 10 });

      expect(result.content[0].text).toBe("not json");
    });
  });
});

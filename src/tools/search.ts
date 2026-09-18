// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { errorMessage } from "../shared/tool-results.js";
import { WebApi } from "azure-devops-node-api";
import { IGitApi } from "azure-devops-node-api/GitApi.js";
import { z } from "zod";
import { apiVersion } from "../utils.js";
import { subdomainBaseUrl } from "../shared/ado-rest.js";
import { GitVersionType, VersionControlRecursionType } from "azure-devops-node-api/interfaces/GitInterfaces.js";

const SEARCH_TOOLS = {
  search_code: "search_code",
  search_wiki: "search_wiki",
  search_workitem: "search_workitem",
};

function configureSearchTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  registerTool(
    server,
    SEARCH_TOOLS.search_code,
    "Search Azure DevOps Repositories for a given search text. Returns each matching file with its matching lines (numbered, at most 10 per file); read a whole file with repo_get_file_content.",
    {
      searchText: z.string().describe("Keywords to search for in code repositories"),
      project: z
        .union([z.string().transform((value) => [value]), z.array(z.string())])
        .optional()
        .describe("Filter by projects"),
      repository: z.array(z.string()).optional().describe("Filter by repositories"),
      path: z.array(z.string()).optional().describe("Filter by paths"),
      branch: z.array(z.string()).optional().describe("Filter by branches"),
      includeFacets: z.boolean().default(false).describe("Include facets in the search results"),
      skip: z.coerce.number().default(0).describe("Number of results to skip"),
      top: z.coerce.number().default(5).describe("Maximum number of results to return"),
    },
    async ({ searchText, project, repository, path, branch, includeFacets, skip, top }) => {
      const accessToken = await tokenProvider();
      const connection = await connectionProvider();
      const url = `${subdomainBaseUrl(connection.serverUrl, "almsearch")}/_apis/search/codesearchresults?api-version=${apiVersion}`;

      const requestBody: Record<string, unknown> = {
        searchText,
        includeFacets,
        $skip: skip,
        $top: top,
      };

      const filters: Record<string, string[]> = {};
      if (project && project.length > 0) filters.Project = project;
      if (repository && repository.length > 0) filters.Repository = repository;
      if (path && path.length > 0) filters.Path = path;
      if (branch && branch.length > 0) filters.Branch = branch;

      if (Object.keys(filters).length > 0) {
        requestBody.filters = filters;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "User-Agent": userAgentProvider(),
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Azure DevOps Code Search API error: ${response.status} ${response.statusText}`);
      }

      const resultJson = JSON.parse(await response.text()) as SearchResponse<CodeSearchResult>;

      const gitApi = await connection.getGitApi();
      const results = await Promise.all((resultJson.results ?? []).map((result) => summarizeCodeResult(result, gitApi)));

      return {
        content: [{ type: "text", text: withInfoCodeNote(resultJson.infoCode, JSON.stringify(compactResponse(resultJson, results))) }],
      };
    }
  );

  registerTool(
    server,
    SEARCH_TOOLS.search_wiki,
    "Search Azure DevOps Wiki for a given search text",
    {
      searchText: z.string().describe("Keywords to search for wiki pages"),
      project: z.array(z.string()).optional().describe("Filter by projects"),
      wiki: z.array(z.string()).optional().describe("Filter by wiki names"),
      includeFacets: z.boolean().default(false).describe("Include facets in the search results"),
      skip: z.coerce.number().default(0).describe("Number of results to skip"),
      top: z.coerce.number().default(10).describe("Maximum number of results to return"),
    },
    async ({ searchText, project, wiki, includeFacets, skip, top }) => {
      const connection = await connectionProvider();
      const accessToken = await tokenProvider();
      const url = `${subdomainBaseUrl(connection.serverUrl, "almsearch")}/_apis/search/wikisearchresults?api-version=${apiVersion}`;

      const requestBody: Record<string, unknown> = {
        searchText,
        includeFacets,
        $skip: skip,
        $top: top,
      };

      const filters: Record<string, string[]> = {};
      if (project && project.length > 0) filters.Project = project;
      if (wiki && wiki.length > 0) filters.Wiki = wiki;

      if (Object.keys(filters).length > 0) {
        requestBody.filters = filters;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "User-Agent": userAgentProvider(),
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Azure DevOps Wiki Search API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.text();
      return {
        content: [{ type: "text", text: withInfoCodeNote(readInfoCode(result), compactWikiResults(result)) }],
      };
    }
  );

  registerTool(
    server,
    SEARCH_TOOLS.search_workitem,
    "Get Azure DevOps Work Item search results for a given search text",
    {
      searchText: z.string().describe("Search text to find in work items"),
      project: z.array(z.string()).optional().describe("Filter by projects"),
      areaPath: z.array(z.string()).optional().describe("Filter by area paths"),
      workItemType: z.array(z.string()).optional().describe("Filter by work item types"),
      state: z.array(z.string()).optional().describe("Filter by work item states"),
      assignedTo: z.array(z.string()).optional().describe("Filter by assigned to users"),
      includeFacets: z.boolean().default(false).describe("Include facets in the search results"),
      skip: z.coerce.number().default(0).describe("Number of results to skip for pagination"),
      top: z.coerce.number().default(10).describe("Number of results to return"),
    },
    async ({ searchText, project, areaPath, workItemType, state, assignedTo, includeFacets, skip, top }) => {
      const connection = await connectionProvider();
      const accessToken = await tokenProvider();
      const url = `${subdomainBaseUrl(connection.serverUrl, "almsearch")}/_apis/search/workitemsearchresults?api-version=${apiVersion}`;

      const requestBody: Record<string, unknown> = {
        searchText,
        includeFacets,
        $skip: skip,
        $top: top,
      };

      const filters: Record<string, unknown> = {};
      if (project && project.length > 0) filters["System.TeamProject"] = project;
      if (areaPath && areaPath.length > 0) filters["System.AreaPath"] = areaPath;
      if (workItemType && workItemType.length > 0) filters["System.WorkItemType"] = workItemType;
      if (state && state.length > 0) filters["System.State"] = state;
      if (assignedTo && assignedTo.length > 0) filters["System.AssignedTo"] = assignedTo;

      if (Object.keys(filters).length > 0) {
        requestBody.filters = filters;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "User-Agent": userAgentProvider(),
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Azure DevOps Work Item Search API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.text();
      return {
        content: [{ type: "text", text: withInfoCodeNote(readInfoCode(result), result) }],
      };
    }
  );
}

// Meanings from the Search REST API reference (CodeSearchResponse.infoCode). A non-zero code
// usually comes with count 0, which otherwise reads exactly like "nothing matched".
const INFO_CODES: Record<number, string> = {
  1: "the organization is being reindexed",
  2: "indexing of the organization has not started (is the Code Search extension installed?)",
  3: "the request is invalid",
  4: "prefix wildcard queries are not supported",
  5: "multi-word queries with a code type facet are not supported",
  6: "the organization is being onboarded to search and its index is not ready yet",
  7: "the organization is being onboarded or reindexed",
  8: "top was trimmed to the maximum number of results allowed",
  9: "branches are being indexed",
  10: "faceting is not enabled",
  11: "work items are not accessible",
  19: "phrase queries with code type filters are not supported",
  20: "wildcard queries with code type filters are not supported",
};

// Codes after which an empty or short result says nothing about whether the text exists.
const INDEX_NOT_READY = new Set([1, 2, 6, 7, 9]);

function readInfoCode(body: string): number | undefined {
  try {
    const parsed = JSON.parse(body) as { infoCode?: unknown };
    return typeof parsed.infoCode === "number" ? parsed.infoCode : undefined;
  } catch {
    return undefined;
  }
}

function withInfoCodeNote(infoCode: number | undefined, text: string): string {
  if (!infoCode) return text;
  const meaning = INFO_CODES[infoCode] ?? "an undocumented condition reported by the search service";
  const consequence = INDEX_NOT_READY.has(infoCode) ? " The results are incomplete: an empty result does not mean nothing matches." : "";
  return `Search returned infoCode ${infoCode}: ${meaning}.${consequence}\n${text}`;
}

interface SearchResponse<T> {
  count?: number;
  results?: T[];
  infoCode?: number;
  facets?: Record<string, unknown>;
}

// The search response as the model needs it: the service's own envelope minus infoCode, which
// withInfoCodeNote spells out, and minus the empty facets object it sends when none were asked for.
function compactResponse(response: SearchResponse<unknown>, results: unknown[]): Record<string, unknown> {
  const facets = response.facets && Object.keys(response.facets).length > 0 ? response.facets : undefined;
  return { count: response.count, results, facets };
}

// Wiki search returns the page's file in the wiki's git repository ("/Q%26A/Pre%2Dflight-check.md"),
// while the wiki API addresses pages by title path ("/Q&A/Pre-flight check"). A wiki stores a page
// title as its file name with spaces turned into "-" and "-" and other special characters
// percent-encoded; a code wiki's files also sit under its mappedPath.
function wikiPagePath(filePath: string, mappedPath?: string): string {
  let path = filePath;
  if (mappedPath && mappedPath !== "/" && path.startsWith(`${mappedPath.replace(/\/$/, "")}/`)) {
    path = path.slice(mappedPath.replace(/\/$/, "").length);
  }
  return path
    .replace(/\.md$/i, "")
    .split("/")
    .map((segment) => {
      const spaced = segment.replace(/-/g, " ");
      try {
        return decodeURIComponent(spaced);
      } catch {
        return spaced;
      }
    })
    .join("/");
}

interface WikiSearchResult {
  path?: string;
  project?: { name?: string };
  wiki?: { name?: string; mappedPath?: string };
  hits?: { fieldReferenceName?: string; highlights?: string[] }[];
}

// Each hit comes twice: once per matched word ("content") and once per matched letter
// ("content.pattern", every character wrapped in its own <highlighthit>), which made up most
// of a wiki search response and says nothing the word hits do not.
function compactWikiResults(body: string): string {
  let response: SearchResponse<WikiSearchResult>;
  try {
    response = JSON.parse(body);
  } catch {
    return body;
  }
  const results = (response.results ?? []).map((result) => ({
    project: result.project?.name,
    wiki: result.wiki?.name,
    path: typeof result.path === "string" ? wikiPagePath(result.path, result.wiki?.mappedPath) : undefined,
    highlights: (result.hits ?? []).filter((hit) => !hit.fieldReferenceName?.endsWith(".pattern")).flatMap((hit) => hit.highlights ?? []),
  }));
  return JSON.stringify(compactResponse(response, results));
}

interface CodeSearchResult {
  path?: string;
  matches?: { content?: { charOffset?: number }[]; fileName?: unknown[] };
  project?: { id?: string; name?: string };
  repository?: { id?: string; name?: string };
  versions?: { branchName?: string; changeId?: string }[];
}

const MAX_LINES_PER_FILE = 10;
const MAX_LINE_LENGTH = 200;

// Code search locates a match only by charOffset (UTF-16 units, i.e. a JS string index); its
// line and column are always 0. So the file is read at the indexed commit and the matching
// lines are cut out of it — the whole file used to be returned instead, 94% of the response.
async function summarizeCodeResult(result: CodeSearchResult, gitApi: IGitApi): Promise<Record<string, unknown>> {
  const version = result.versions?.[0];
  const summary: Record<string, unknown> = {
    project: result.project?.name,
    repository: result.repository?.name,
    branch: version?.branchName,
    path: result.path,
    commitId: version?.changeId,
  };
  if (result.matches?.fileName?.length) summary.fileNameMatch = true;

  const offsets = (result.matches?.content ?? []).map((match) => match.charOffset).filter((offset): offset is number => typeof offset === "number");
  if (offsets.length === 0) return summary;

  const projectId = result.project?.id;
  const repositoryId = result.repository?.id;
  if (!projectId || !repositoryId || !result.path || !version?.changeId) {
    summary.error = "The search result does not name the project, repository, path and commit needed to read the matching lines.";
    return summary;
  }

  try {
    const item = await gitApi.getItem(
      repositoryId,
      result.path,
      projectId,
      undefined,
      VersionControlRecursionType.None,
      false, // includeContentMetadata
      false, // latestProcessedChange
      false, // download
      { version: version.changeId, versionType: GitVersionType.Commit },
      true, // includeContent
      true, // resolveLfs
      true // sanitize
    );
    const lines = matchingLines(item.content ?? "", offsets);
    summary.matches = lines.slice(0, MAX_LINES_PER_FILE);
    if (lines.length > MAX_LINES_PER_FILE) summary.moreMatches = lines.length - MAX_LINES_PER_FILE;
  } catch (error) {
    summary.error = errorMessage(error);
  }
  return summary;
}

function matchingLines(content: string, offsets: number[]): { line: number; text: string }[] {
  const lines: { line: number; text: string }[] = [];
  let lineNumber = 1;
  let lineStart = 0;
  for (const offset of [...offsets].sort((a, b) => a - b)) {
    if (offset > content.length) break;
    let newline = content.indexOf("\n", lineStart);
    while (newline !== -1 && newline < offset) {
      lineNumber++;
      lineStart = newline + 1;
      newline = content.indexOf("\n", lineStart);
    }
    if (lines.at(-1)?.line === lineNumber) continue;
    const line = content.slice(lineStart, newline === -1 ? content.length : newline).replace(/\r$/, "");
    lines.push({ line: lineNumber, text: excerpt(line, offset - lineStart) });
  }
  return lines;
}

// A minified file can hold the whole program on one line.
function excerpt(line: string, column: number): string {
  if (line.length <= MAX_LINE_LENGTH) return line;
  const start = Math.max(0, Math.min(column - MAX_LINE_LENGTH / 2, line.length - MAX_LINE_LENGTH));
  const end = start + MAX_LINE_LENGTH;
  return `${start > 0 ? "…" : ""}${line.slice(start, end)}${end < line.length ? "…" : ""}`;
}

export { SEARCH_TOOLS, configureSearchTools };

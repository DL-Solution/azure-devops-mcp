// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { IGitApi } from "azure-devops-node-api/GitApi.js";
import { z } from "zod";
import { apiVersion } from "../utils.js";
import { subdomainBaseUrl } from "../shared/ado-rest.js";
import { VersionControlRecursionType } from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { GitItem } from "azure-devops-node-api/interfaces/GitInterfaces.js";

const SEARCH_TOOLS = {
  search_code: "search_code",
  search_wiki: "search_wiki",
  search_workitem: "search_workitem",
};

function configureSearchTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  registerTool(
    server,
    SEARCH_TOOLS.search_code,
    "Search Azure DevOps Repositories for a given search text",
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

      const resultText = await response.text();
      const resultJson = JSON.parse(resultText) as { results?: SearchResult[]; infoCode?: number };

      const gitApi = await connection.getGitApi();
      const combinedResults = await fetchCombinedResults(resultJson.results ?? [], gitApi);

      return {
        content: [{ type: "text", text: withInfoCodeNote(resultJson.infoCode, resultText + JSON.stringify(combinedResults)) }],
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
        content: [{ type: "text", text: withInfoCodeNote(readInfoCode(result), result) }],
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

interface SearchResult {
  project?: { id?: string };
  repository?: { id?: string };
  path?: string;
  versions?: { changeId?: string }[];
  [key: string]: unknown;
}

type CombinedResult = { gitItem: GitItem } | { error: string };

async function fetchCombinedResults(topSearchResults: SearchResult[], gitApi: IGitApi): Promise<CombinedResult[]> {
  const combinedResults: CombinedResult[] = [];
  for (const searchResult of topSearchResults) {
    try {
      const projectId = searchResult.project?.id;
      const repositoryId = searchResult.repository?.id;
      const filePath = searchResult.path;
      const changeId = Array.isArray(searchResult.versions) && searchResult.versions.length > 0 ? searchResult.versions[0].changeId : undefined;
      if (!projectId || !repositoryId || !filePath || !changeId) {
        combinedResults.push({
          error: `Missing projectId, repositoryId, filePath, or changeId in the result: ${JSON.stringify(searchResult)}`,
        });
        continue;
      }

      const versionDescriptor = changeId ? { version: changeId, versionType: 2, versionOptions: 0 } : undefined;

      const item = await gitApi.getItem(
        repositoryId,
        filePath,
        projectId,
        undefined,
        VersionControlRecursionType.None,
        true, // includeContentMetadata
        false, // latestProcessedChange
        false, // download
        versionDescriptor,
        true, // includeContent
        true, // resolveLfs
        true // sanitize
      );
      combinedResults.push({
        gitItem: item,
      });
    } catch (err) {
      combinedResults.push({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return combinedResults;
}

export { SEARCH_TOOLS, configureSearchTools };

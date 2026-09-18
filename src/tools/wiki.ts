// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { WikiPagesBatchRequest, WikiCreateParametersV2, WikiType } from "azure-devops-node-api/interfaces/WikiInterfaces.js";
import { GitVersionType } from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { apiVersion, extractAdoStreamError, getOrgFromUrl } from "../utils.js";
import { createExternalContentResponse } from "../shared/content-safety.js";
import { adoFetch } from "../shared/ado-rest.js";
import { requiredProject, continuationTokenParam } from "../shared/common-params.js";
import { jsonResult, toolError } from "../shared/tool-results.js";

const WIKI_TOOLS = {
  list_wikis: "wiki_list_wikis",
  get_wiki: "wiki_get_wiki",
  list_wiki_pages: "wiki_list_pages",
  get_wiki_page: "wiki_get_page",
  get_wiki_page_content: "wiki_get_page_content",
  create_or_update_page: "wiki_create_or_update_page",
  create_wiki: "wiki_create_wiki",
  update_wiki: "wiki_update_wiki",
  delete_wiki: "wiki_delete_wiki",
  delete_page: "wiki_delete_page",
  move_page: "wiki_move_page",
  upload_attachment: "wiki_upload_attachment",
  get_page_stats: "wiki_get_page_stats",
  list_page_comments: "wiki_list_page_comments",
  get_page_comment: "wiki_get_page_comment",
  add_page_comment: "wiki_add_page_comment",
  update_page_comment: "wiki_update_page_comment",
  delete_page_comment: "wiki_delete_page_comment",
  add_page_comment_reaction: "wiki_add_page_comment_reaction",
  remove_page_comment_reaction: "wiki_remove_page_comment_reaction",
  list_page_comment_reaction_users: "wiki_list_page_comment_reaction_users",
  upload_page_comment_attachment: "wiki_upload_page_comment_attachment",
  get_page_comment_attachment: "wiki_get_page_comment_attachment",
};

function configureWikiTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  registerTool(
    server,
    WIKI_TOOLS.get_wiki,
    "Get the wiki by wikiIdentifier",
    {
      wikiIdentifier: z.string().describe("The unique identifier of the wiki."),
      project: z.string().optional().describe("The project name or ID where the wiki is located. If not provided, the default project will be used."),
    },
    async ({ wikiIdentifier, project }) => {
      try {
        const connection = await connectionProvider();
        const wikiApi = await connection.getWikiApi();
        const wiki = await wikiApi.getWiki(wikiIdentifier, project);

        if (!wiki) {
          return { content: [{ type: "text", text: "No wiki found" }], isError: true };
        }

        return jsonResult(wiki);
      } catch (error) {
        return toolError("fetching wiki", error);
      }
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.list_wikis,
    "Retrieve a list of wikis for an organization or project.",
    {
      project: z.string().optional().describe("The project name or ID to filter wikis. If not provided, all wikis in the organization will be returned."),
    },
    async ({ project }) => {
      try {
        const connection = await connectionProvider();
        const wikiApi = await connection.getWikiApi();
        const wikis = await wikiApi.getAllWikis(project);

        if (!wikis) {
          return { content: [{ type: "text", text: "No wikis found" }], isError: true };
        }

        return jsonResult(wikis);
      } catch (error) {
        return toolError("fetching wikis", error);
      }
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.list_wiki_pages,
    "Retrieve a list of wiki pages for a specific wiki and project.",
    {
      wikiIdentifier: z.string().describe("The unique identifier of the wiki."),
      project: z.string().describe("The project name or ID where the wiki is located."),
      top: z.coerce.number().default(20).describe("The maximum number of pages to return, up to 100. Defaults to 20."),
      continuationToken: continuationTokenParam,
      pageViewsForDays: z.coerce.number().optional().describe("Number of days to retrieve page views for. If not specified, page views are not included."),
    },
    async ({ wikiIdentifier, project, top = 20, continuationToken, pageViewsForDays }) => {
      try {
        const connection = await connectionProvider();
        const wikiApi = await connection.getWikiApi();

        const pagesBatchRequest: WikiPagesBatchRequest = {
          top,
          continuationToken,
          pageViewsForDays,
        };

        const pages = await wikiApi.getPagesBatch(pagesBatchRequest, project, wikiIdentifier);

        if (!pages) {
          return { content: [{ type: "text", text: "No wiki pages found" }], isError: true };
        }

        return jsonResult(pages);
      } catch (error) {
        return toolError("fetching wiki pages", error);
      }
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.get_wiki_page,
    "Retrieve wiki page metadata by path. This tool does not return page content. Returns isError: true if the page is not found.",
    {
      wikiIdentifier: z.string().describe("The unique identifier of the wiki."),
      project: z.string().describe("The project name or ID where the wiki is located."),
      path: z.string().describe("The path of the wiki page (e.g., '/Home' or '/Documentation/Setup')."),
      recursionLevel: z
        .enum(["None", "OneLevel", "OneLevelPlusNestedEmptyFolders", "Full"])
        .optional()
        .describe("Recursion level for subpages. 'None' returns only the specified page. 'OneLevel' includes direct children. 'Full' includes all descendants."),
    },
    async ({ wikiIdentifier, project, path, recursionLevel }) => {
      try {
        const connection = await connectionProvider();
        const accessToken = await tokenProvider();

        // Normalize the path
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        //const encodedPath = encodeURIComponent(normalizedPath);

        // Build the URL for the wiki page API
        const baseUrl = connection.serverUrl.replace(/\/$/, "");
        const params = new URLSearchParams({
          "path": normalizedPath,
          "api-version": apiVersion,
        });

        if (recursionLevel) {
          params.append("recursionLevel", recursionLevel);
        }

        const url = `${baseUrl}/${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiIdentifier)}/pages?${params.toString()}`;

        const response = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "User-Agent": userAgentProvider(),
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to get wiki page (${response.status}): ${errorText}`);
        }

        const pageData = await response.json();

        return jsonResult(pageData);
      } catch (error) {
        return toolError("fetching wiki page metadata", error);
      }
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.get_wiki_page_content,
    "Retrieve wiki page content. Provide either a 'url' parameter OR the combination of 'wikiIdentifier' and 'project' parameters. " + "Returns isError: true if the wiki page is not found.",
    {
      url: z
        .string()
        .optional()
        .describe(
          "The full URL of the wiki page to retrieve content for. If provided, wikiIdentifier, project, and path are ignored. Supported patterns: https://dev.azure.com/{org}/{project}/_wiki/wikis/{wikiIdentifier}?pagePath=%2FMy%20Page and https://dev.azure.com/{org}/{project}/_wiki/wikis/{wikiIdentifier}/{pageId}/Page-Title"
        ),
      wikiIdentifier: z.string().optional().describe("The unique identifier of the wiki. Required if url is not provided."),
      project: z.string().optional().describe("The project name or ID where the wiki is located. Required if url is not provided."),
      path: z.string().optional().describe("The path of the wiki page to retrieve content for. Optional, defaults to root page if not provided."),
    },
    async ({ url, wikiIdentifier, project, path }: { url?: string; wikiIdentifier?: string; project?: string; path?: string }) => {
      try {
        const hasUrl = !!url;
        const hasPair = !!wikiIdentifier && !!project;

        if (hasUrl && hasPair) {
          return { content: [{ type: "text", text: "Error fetching wiki page content: Provide either 'url' OR 'wikiIdentifier' with 'project', not both." }], isError: true };
        }
        if (!hasUrl && !hasPair) {
          return { content: [{ type: "text", text: "Error fetching wiki page content: You must provide either 'url' OR both 'wikiIdentifier' and 'project'." }], isError: true };
        }

        const connection = await connectionProvider();
        const wikiApi = await connection.getWikiApi();
        let resolvedProject = project;
        let resolvedWiki = wikiIdentifier;
        let resolvedPath: string | undefined = path;
        let pageContent: string | undefined;

        if (url) {
          const parsed = parseWikiUrl(url);

          if ("error" in parsed) {
            return { content: [{ type: "text", text: `Error fetching wiki page content: ${parsed.error}` }], isError: true };
          }

          // Only the project and wiki are read from the URL; the request itself
          // goes to the connected organization. A link into another organization
          // would therefore silently return a same-named page from this one.
          const configuredOrg = getOrgFromUrl(connection.serverUrl);
          const urlOrg = getOrgFromUrl(url);
          if (configuredOrg && urlOrg !== configuredOrg) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error fetching wiki page content: The URL targets organization '${urlOrg ?? "unknown"}', but this server is connected to '${configuredOrg}'. Cross-organization requests are not allowed.`,
                },
              ],
              isError: true,
            };
          }

          resolvedProject = parsed.project;
          resolvedWiki = parsed.wikiIdentifier;

          if (parsed.pagePath) {
            resolvedPath = parsed.pagePath;
          }

          if (parsed.pageId) {
            try {
              const accessToken = await tokenProvider();
              const baseUrl = connection.serverUrl.replace(/\/$/, "");
              const restUrl = `${baseUrl}/${encodeURIComponent(resolvedProject)}/_apis/wiki/wikis/${encodeURIComponent(resolvedWiki)}/pages/${parsed.pageId}?includeContent=true&api-version=7.1`;
              const resp = await fetch(restUrl, {
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                  "User-Agent": userAgentProvider(),
                },
              });
              if (resp.ok) {
                const json = await resp.json();
                if (json && typeof json.content === "string") {
                  pageContent = json.content;
                } else if (json && json.path) {
                  resolvedPath = json.path;
                }
              } else if (resp.status === 404) {
                return { content: [{ type: "text", text: `Error fetching wiki page content: Page with id ${parsed.pageId} not found` }], isError: true };
              }
            } catch {}
          }
        }

        if (!pageContent) {
          if (!resolvedPath) {
            resolvedPath = "/";
          }
          // resolvedProject and resolvedWiki are guaranteed to be defined here:
          // - the url branch errors out in parseWikiUrl when project/wikiIdentifier are missing
          // - the pair branch enforces both via the hasPair check above
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const stream = await wikiApi.getPageText(resolvedProject!, resolvedWiki!, resolvedPath, undefined, undefined, true);
          if (!stream) {
            return { content: [{ type: "text", text: "No wiki page content found" }], isError: true };
          }
          pageContent = await streamToString(stream);

          const streamError = extractAdoStreamError(pageContent);
          if (streamError) {
            return {
              content: [{ type: "text", text: `Error fetching wiki page content: ${streamError}` }],
              isError: true,
            };
          }
        }

        return createExternalContentResponse(pageContent, "wiki page");
      } catch (error) {
        return toolError("fetching wiki page content", error);
      }
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.create_or_update_page,
    "Create or update a wiki page with content.",
    {
      wikiIdentifier: z.string().describe("The unique identifier or name of the wiki."),
      path: z.string().describe("The path of the wiki page (e.g., '/Home' or '/Documentation/Setup')."),
      content: z.string().describe("The content of the wiki page in markdown format."),
      project: z.string().optional().describe("The project name or ID where the wiki is located. If not provided, the default project will be used."),
      etag: z.string().optional().describe("ETag for editing existing pages (optional, will be fetched if not provided)."),
      branch: z.string().default("wikiMaster").describe("The branch name for the wiki repository. Defaults to 'wikiMaster' which is the default branch for Azure DevOps wikis."),
    },
    async ({ wikiIdentifier, path, content, project, etag, branch = "wikiMaster" }) => {
      try {
        const connection = await connectionProvider();
        const accessToken = await tokenProvider();

        // Normalize the path
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        const encodedPath = encodeURIComponent(normalizedPath);

        // Build the URL for the wiki page API with version descriptor
        const baseUrl = connection.serverUrl;
        const projectParam = project || "";
        const url = `${baseUrl}/${encodeURIComponent(projectParam)}/_apis/wiki/wikis/${encodeURIComponent(wikiIdentifier)}/pages?path=${encodedPath}&versionDescriptor.versionType=branch&versionDescriptor.version=${encodeURIComponent(branch)}&api-version=7.1`;

        // First, try to create a new page (PUT without ETag)
        try {
          const createResponse = await fetch(url, {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "User-Agent": userAgentProvider(),
            },
            body: JSON.stringify({ content: content }),
          });

          if (createResponse.ok) {
            const result = await createResponse.json();
            return {
              content: [
                {
                  type: "text",
                  text: `Successfully created wiki page at path: ${normalizedPath}. Response: ${JSON.stringify(result)}`,
                },
              ],
            };
          }

          // If creation failed with 409 (Conflict) or 500 (Page exists), try to update it
          if (createResponse.status === 409 || createResponse.status === 500) {
            // Page exists, we need to get the ETag and update it
            let currentEtag = etag;

            if (!currentEtag) {
              // Fetch current page to get ETag
              const getResponse = await fetch(url, {
                method: "GET",
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                  "User-Agent": userAgentProvider(),
                },
              });

              if (getResponse.ok) {
                currentEtag = getResponse.headers.get("etag") || getResponse.headers.get("ETag") || undefined;
                if (!currentEtag) {
                  const pageData = await getResponse.json();
                  currentEtag = pageData.eTag;
                }
              }

              if (!currentEtag) {
                throw new Error("Could not retrieve ETag for existing page");
              }
            }

            // Now update the existing page with ETag
            const updateResponse = await fetch(url, {
              method: "PUT",
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "User-Agent": userAgentProvider(),
                "If-Match": currentEtag,
              },
              body: JSON.stringify({ content: content }),
            });

            if (updateResponse.ok) {
              const result = await updateResponse.json();
              return {
                content: [
                  {
                    type: "text",
                    text: `Successfully updated wiki page at path: ${normalizedPath}. Response: ${JSON.stringify(result)}`,
                  },
                ],
              };
            } else {
              const errorText = await updateResponse.text();
              throw new Error(`Failed to update page (${updateResponse.status}): ${errorText}`);
            }
          } else {
            const errorText = await createResponse.text();
            throw new Error(`Failed to create page (${createResponse.status}): ${errorText}`);
          }
        } catch (fetchError) {
          throw fetchError;
        }
      } catch (error) {
        return toolError("creating/updating wiki page", error);
      }
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.create_wiki,
    "Provision a new wiki in a project. Use type 'projectWiki' to create the project's default wiki (required once before wiki pages can be created), or 'codeWiki' to publish a wiki from an existing Git repository.",
    {
      name: z.string().describe("The name of the wiki to create."),
      project: z.string().describe("The project name or ID in which to create the wiki."),
      type: z
        .enum(["projectWiki", "codeWiki"])
        .optional()
        .default("projectWiki")
        .describe("The wiki type. 'projectWiki' provisions the project's default wiki; 'codeWiki' publishes a wiki backed by a Git repository. Defaults to 'projectWiki'."),
      repositoryId: z.string().optional().describe("Required for 'codeWiki': the ID of the Git repository that backs the wiki."),
      mappedPath: z.string().optional().describe("For 'codeWiki': the folder path inside the repository shown as the wiki. Defaults to '/'."),
      version: z.string().optional().describe("Required for 'codeWiki': the repository branch name that backs the wiki (e.g. 'main')."),
    },
    async ({ name, project, type = "projectWiki", repositoryId, mappedPath, version }) => {
      try {
        const connection = await connectionProvider();
        const coreApi = await connection.getCoreApi();
        const projectInfo = await coreApi.getProject(project);

        if (!projectInfo || !projectInfo.id) {
          return { content: [{ type: "text", text: `Project '${project}' not found` }], isError: true };
        }

        const isCodeWiki = type === "codeWiki";
        if (isCodeWiki && (!repositoryId || !version)) {
          return { content: [{ type: "text", text: "For a 'codeWiki', both repositoryId and version (branch) are required." }], isError: true };
        }

        const wikiCreateParams: WikiCreateParametersV2 = {
          name,
          projectId: projectInfo.id,
          type: isCodeWiki ? WikiType.CodeWiki : WikiType.ProjectWiki,
          ...(isCodeWiki
            ? {
                repositoryId,
                mappedPath: mappedPath ?? "/",
                version: { version, versionType: GitVersionType.Branch },
              }
            : {}),
        };

        const wikiApi = await connection.getWikiApi();
        const wiki = await wikiApi.createWiki(wikiCreateParams, projectInfo.id);

        if (!wiki) {
          return { content: [{ type: "text", text: "Wiki was not created" }], isError: true };
        }

        return jsonResult(wiki);
      } catch (error) {
        return toolError("creating wiki", error);
      }
    }
  );

  async function call(action: string, run: () => Promise<string>) {
    try {
      return { content: [{ type: "text" as const, text: (await run()) || "Done." }] };
    } catch (error) {
      return toolError(action, error);
    }
  }

  // Page moves, page deletes and attachments have no azure-devops-node-api method, and the client
  // turns a 404 into null and shifts view-stat days into local time, so these tools call REST directly.
  async function rest(method: string, pathAndQuery: string, body?: unknown): Promise<string> {
    const connection = await connectionProvider();
    const token = await tokenProvider();
    const baseUrl = connection.serverUrl.replace(/\/$/, "");
    const response = await adoFetch({ url: `${baseUrl}/${pathAndQuery}`, method, token, userAgent: userAgentProvider(), body });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status}: ${text}`);
    }
    return text;
  }

  const wikiIdentifierParam = z.string().describe("The wiki name or ID.");
  const versionParams = (params: URLSearchParams, branch: string | undefined) => {
    if (branch) {
      params.append("versionDescriptor.version", branch);
      params.append("versionDescriptor.versionType", "branch");
    }
  };
  const branchParam = z.string().optional().describe("For a code wiki: the published branch to change. The wiki's first version when omitted.");

  const pageIdParam = z.coerce.number().int().min(1).describe("The wiki page ID, from wiki_list_pages or wiki_get_page.");
  const commentIdParam = z.coerce.number().int().min(1).describe("The comment ID, from wiki_list_page_comments.");
  // The reactions a wiki page comment accepts, as the REST API spells them — the same set work item comments use.
  const PAGE_COMMENT_REACTIONS = ["like", "dislike", "heart", "hooray", "smile", "confused"] as const;
  const pageCommentReactionParam = z.enum(PAGE_COMMENT_REACTIONS).describe("The reaction.");
  const pageCommentExpandParam = z
    .enum(["none", "reactions", "renderedText", "all"])
    .optional()
    .describe("Extra data to include ('$expand'). 'renderedText' adds the rendered HTML; 'reactions' includes each comment's reaction counts.");
  const pageCommentsPath = (project: string, wikiId: string, pageId: number) => `${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pages/${pageId}/comments`;

  registerTool(
    server,
    WIKI_TOOLS.update_wiki,
    "Rename a wiki, or change which branches of a code wiki are published. versions replaces the whole list of published branches.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      name: z.string().optional().describe("The new name of the wiki."),
      versions: z.array(z.string()).optional().describe("For a code wiki: every branch to publish, e.g. ['main', 'release/1.0']."),
    },
    async ({ project, wikiIdentifier, name, versions }) => {
      if (name === undefined && !versions?.length) {
        return { content: [{ type: "text", text: "Nothing to change: give name, versions or both." }], isError: true };
      }
      return call(`updating wiki ${wikiIdentifier}`, () =>
        rest("PATCH", `${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiIdentifier)}?api-version=${apiVersion}`, {
          name,
          versions: versions?.map((version) => ({ version, versionType: "branch" })),
        })
      );
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.delete_wiki,
    "Delete a wiki. For a code wiki this unpublishes it; the repository and its files stay.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
    },
    async ({ project, wikiIdentifier }) =>
      call(`deleting wiki ${wikiIdentifier}`, () => rest("DELETE", `${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiIdentifier)}?api-version=${apiVersion}`))
  );

  registerTool(
    server,
    WIKI_TOOLS.delete_page,
    "Delete a wiki page by path or by ID. The deletion is a commit to the wiki's repository.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      path: z.string().optional().describe("The page path, e.g. '/Architecture/Overview'."),
      pageId: z.coerce.number().min(1).optional().describe("The page ID, instead of path."),
      comment: z.string().optional().describe("The commit comment."),
      branch: branchParam,
    },
    async ({ project, wikiIdentifier, path, pageId, comment, branch }) => {
      if ((path === undefined) === (pageId === undefined)) {
        return { content: [{ type: "text", text: "Give exactly one of path or pageId." }], isError: true };
      }
      const params = new URLSearchParams({ "api-version": apiVersion });
      if (comment) params.append("comment", comment);
      return call(`deleting wiki page ${path ?? pageId}`, async () => {
        if (pageId !== undefined) {
          return rest("DELETE", `${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiIdentifier)}/pages/${pageId}?${params.toString()}`);
        }
        params.append("path", path as string);
        versionParams(params, branch);
        return rest("DELETE", `${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiIdentifier)}/pages?${params.toString()}`);
      });
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.move_page,
    "Move or rename a wiki page, or change its position among its siblings.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      path: z.string().describe("The current page path, e.g. '/Drafts/Overview'."),
      newPath: z.string().describe("The new page path, e.g. '/Architecture/Overview'. The same as path to only reorder."),
      newOrder: z.coerce.number().min(0).optional().describe("The position among the pages of the new parent, starting at 0."),
      comment: z.string().optional().describe("The commit comment."),
      branch: branchParam,
    },
    async ({ project, wikiIdentifier, path, newPath, newOrder, comment, branch }) => {
      const params = new URLSearchParams({ "api-version": apiVersion });
      if (comment) params.append("comment", comment);
      versionParams(params, branch);
      return call(`moving wiki page ${path}`, () =>
        rest("POST", `${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiIdentifier)}/pagemoves?${params.toString()}`, { path, newPath, newOrder })
      );
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.upload_attachment,
    "Upload a file to a wiki, e.g. an image for a page. Returns the attachment's path; reference it from page markdown as ![name](path).",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      name: z.string().describe("The file name, e.g. 'diagram.png'."),
      contentBase64: z.string().describe("The file content, base64-encoded."),
      branch: branchParam,
    },
    async ({ project, wikiIdentifier, name, contentBase64, branch }) => {
      const params = new URLSearchParams({ "name": name, "api-version": apiVersion });
      versionParams(params, branch);
      return call(`uploading wiki attachment ${name}`, async () => {
        const connection = await connectionProvider();
        const token = await tokenProvider();
        const baseUrl = connection.serverUrl.replace(/\/$/, "");
        // The service expects the base64 text itself as the body, not the decoded bytes.
        const response = await fetch(`${baseUrl}/${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiIdentifier)}/attachments?${params.toString()}`, {
          method: "PUT",
          headers: { "Authorization": `Bearer ${token}`, "User-Agent": userAgentProvider(), "Content-Type": "application/octet-stream" },
          body: contentBase64.replace(/\s/g, ""),
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`${response.status}: ${text}`);
        }
        return text;
      });
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.get_page_stats,
    "Get how often a wiki page was viewed, per day.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      pageId: z.coerce.number().min(1).describe("The page ID."),
      pageViewsForDays: z.coerce.number().min(1).max(30).optional().describe("How many days back, including today. Up to 30."),
    },
    async ({ project, wikiIdentifier, pageId, pageViewsForDays }) =>
      call(`getting stats of wiki page ${pageId}`, () => {
        const params = new URLSearchParams({ "api-version": apiVersion });
        if (pageViewsForDays !== undefined) params.append("pageViewsForDays", String(pageViewsForDays));
        return rest("GET", `${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiIdentifier)}/pages/${pageId}/stats?${params.toString()}`);
      })
  );

  registerTool(
    server,
    WIKI_TOOLS.list_page_comments,
    "List the comments on a wiki page, newest first unless order is 'asc'.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      pageId: pageIdParam,
      top: z.coerce.number().optional().describe("Maximum number of comments to return."),
      continuationToken: continuationTokenParam,
      excludeDeleted: z.boolean().optional().describe("Omit deleted comments when true."),
      expand: pageCommentExpandParam,
      order: z.enum(["asc", "desc"]).optional().describe("Sort order by creation date. Defaults to newest first."),
    },
    async ({ project, wikiIdentifier, pageId, top, continuationToken, excludeDeleted, expand, order }) => {
      const params = new URLSearchParams({ "api-version": apiVersion });
      if (top !== undefined) params.append("$top", String(top));
      if (continuationToken) params.append("continuationToken", continuationToken);
      if (excludeDeleted !== undefined) params.append("excludeDeleted", String(excludeDeleted));
      if (expand) params.append("$expand", expand);
      if (order) params.append("order", order);
      return call(`listing comments on wiki page ${pageId}`, () => rest("GET", `${pageCommentsPath(project, wikiIdentifier, pageId)}?${params.toString()}`));
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.get_page_comment,
    "Get a single wiki page comment by ID.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      pageId: pageIdParam,
      commentId: commentIdParam,
      excludeDeleted: z.boolean().optional().describe("When true, a deleted comment is not returned."),
      expand: pageCommentExpandParam,
    },
    async ({ project, wikiIdentifier, pageId, commentId, excludeDeleted, expand }) => {
      const params = new URLSearchParams({ "api-version": apiVersion });
      if (excludeDeleted !== undefined) params.append("excludeDeleted", String(excludeDeleted));
      if (expand) params.append("$expand", expand);
      return call(`getting wiki page comment ${commentId}`, () => rest("GET", `${pageCommentsPath(project, wikiIdentifier, pageId)}/${commentId}?${params.toString()}`));
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.add_page_comment,
    "Add a comment to a wiki page. text is markdown. Set parentId to reply to an existing comment instead of starting a new thread.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      pageId: pageIdParam,
      text: z.string().describe("The comment text, in markdown."),
      parentId: z.coerce.number().int().min(1).optional().describe("The ID of the comment to reply to, from wiki_list_page_comments."),
    },
    async ({ project, wikiIdentifier, pageId, text, parentId }) =>
      call(`adding a comment to wiki page ${pageId}`, () => rest("POST", `${pageCommentsPath(project, wikiIdentifier, pageId)}?api-version=${apiVersion}`, { text, parentId }))
  );

  registerTool(
    server,
    WIKI_TOOLS.update_page_comment,
    "Update the text of an existing wiki page comment. text is markdown.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      pageId: pageIdParam,
      commentId: commentIdParam,
      text: z.string().describe("The new comment text, in markdown."),
    },
    async ({ project, wikiIdentifier, pageId, commentId, text }) =>
      call(`updating wiki page comment ${commentId}`, () => rest("PATCH", `${pageCommentsPath(project, wikiIdentifier, pageId)}/${commentId}?api-version=${apiVersion}`, { text }))
  );

  registerTool(
    server,
    WIKI_TOOLS.delete_page_comment,
    "Delete a wiki page comment by ID.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      pageId: pageIdParam,
      commentId: commentIdParam,
    },
    async ({ project, wikiIdentifier, pageId, commentId }) =>
      call(`deleting wiki page comment ${commentId}`, () => rest("DELETE", `${pageCommentsPath(project, wikiIdentifier, pageId)}/${commentId}?api-version=${apiVersion}`))
  );

  registerTool(
    server,
    WIKI_TOOLS.add_page_comment_reaction,
    "React to a wiki page comment as yourself, e.g. 'like'.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      pageId: pageIdParam,
      commentId: commentIdParam,
      reaction: pageCommentReactionParam,
    },
    async ({ project, wikiIdentifier, pageId, commentId, reaction }) =>
      call(`adding reaction ${reaction} to wiki page comment ${commentId}`, () =>
        rest("PUT", `${pageCommentsPath(project, wikiIdentifier, pageId)}/${commentId}/reactions/${reaction}?api-version=${apiVersion}`)
      )
  );

  registerTool(
    server,
    WIKI_TOOLS.remove_page_comment_reaction,
    "Withdraw your own reaction from a wiki page comment. Other people's reactions are not affected.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      pageId: pageIdParam,
      commentId: commentIdParam,
      reaction: pageCommentReactionParam,
    },
    async ({ project, wikiIdentifier, pageId, commentId, reaction }) =>
      call(`removing reaction ${reaction} from wiki page comment ${commentId}`, () =>
        rest("DELETE", `${pageCommentsPath(project, wikiIdentifier, pageId)}/${commentId}/reactions/${reaction}?api-version=${apiVersion}`)
      )
  );

  registerTool(
    server,
    WIKI_TOOLS.list_page_comment_reaction_users,
    "List who gave a particular reaction to a wiki page comment.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      pageId: pageIdParam,
      commentId: commentIdParam,
      reaction: pageCommentReactionParam,
      top: z.coerce.number().min(1).optional().describe("Maximum number of people to return."),
      skip: z.coerce.number().min(0).optional().describe("Number of people to skip."),
    },
    async ({ project, wikiIdentifier, pageId, commentId, reaction, top, skip }) => {
      const params = new URLSearchParams({ "api-version": apiVersion });
      if (top !== undefined) params.append("$top", String(top));
      if (skip !== undefined) params.append("$skip", String(skip));
      return call(`listing users who reacted ${reaction} to wiki page comment ${commentId}`, () =>
        rest("GET", `${pageCommentsPath(project, wikiIdentifier, pageId)}/${commentId}/reactions/${reaction}/users?${params.toString()}`)
      );
    }
  );

  registerTool(
    server,
    WIKI_TOOLS.upload_page_comment_attachment,
    "Upload a file to attach to a wiki page comment, e.g. a screenshot. Returns the attachment reference; reference its url from a comment's markdown.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      pageId: pageIdParam,
      fileName: z.string().describe("The file name, e.g. 'screenshot.png'."),
      contentBase64: z.string().describe("The file content, base64-encoded."),
    },
    async ({ project, wikiIdentifier, pageId, fileName, contentBase64 }) =>
      call(`uploading wiki page comment attachment ${fileName}`, async () => {
        const connection = await connectionProvider();
        const token = await tokenProvider();
        const baseUrl = connection.serverUrl.replace(/\/$/, "");
        const params = new URLSearchParams({ "fileName": fileName, "api-version": apiVersion });
        const response = await fetch(`${baseUrl}/${pageCommentsPath(project, wikiIdentifier, pageId)}/attachments?${params.toString()}`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "User-Agent": userAgentProvider(), "Content-Type": "application/octet-stream" },
          body: Buffer.from(contentBase64.replace(/\s/g, ""), "base64"),
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`${response.status}: ${text}`);
        }
        return text;
      })
  );

  registerTool(
    server,
    WIKI_TOOLS.get_page_comment_attachment,
    "Download an attachment from a wiki page comment by its ID. Returns the content as a base64-encoded resource, or as text if it looks like a text file.",
    {
      project: requiredProject,
      wikiIdentifier: wikiIdentifierParam,
      pageId: pageIdParam,
      attachmentId: z.string().describe("The GUID of the attachment, from wiki_upload_page_comment_attachment or a comment's markdown link."),
      fileName: z.string().optional().describe("The file name, e.g. 'screenshot.png'. Used to determine the MIME type."),
    },
    async ({ project, wikiIdentifier, pageId, attachmentId, fileName }) => {
      try {
        const connection = await connectionProvider();
        const token = await tokenProvider();
        const baseUrl = connection.serverUrl.replace(/\/$/, "");
        const url = `${baseUrl}/${pageCommentsPath(project, wikiIdentifier, pageId)}/attachments/${encodeURIComponent(attachmentId)}?api-version=${apiVersion}`;
        const response = await fetch(url, {
          headers: { "Authorization": `Bearer ${token}`, "User-Agent": userAgentProvider() },
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${response.status}: ${text}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const mimeType = attachmentMimeType(fileName);

        if (mimeType.startsWith("text/")) {
          return createExternalContentResponse(buffer.toString("utf-8"), "wiki page comment attachment");
        }

        const base64Data = buffer.toString("base64");
        return {
          content: [
            {
              type: "resource" as const,
              resource: { uri: `data:${mimeType};base64,${base64Data}`, mimeType, blob: base64Data },
            },
          ],
        };
      } catch (error) {
        return toolError("downloading wiki page comment attachment", error);
      }
    }
  );
}

// A small, local guess at MIME type from a file extension — mirrors the same lookup
// wit_get_work_item_attachment uses (src/tools/work-items.ts), kept local since neither
// module exports it and the set of extensions worth special-casing is short.
function attachmentMimeType(fileName: string | undefined): string {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    webp: "image/webp",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    csv: "text/csv",
    html: "text/html",
    htm: "text/html",
    xml: "text/xml",
    json: "application/json",
    yaml: "text/yaml",
    yml: "text/yaml",
    zip: "application/zip",
  };
  return (ext && mimeTypes[ext]) ?? "application/octet-stream";
}

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => (data += chunk));
    stream.on("end", () => resolve(data));
    stream.on("error", reject);
  });
}

// Helper to parse Azure DevOps wiki page URLs.
// Supported examples:
//  - https://dev.azure.com/org/project/_wiki/wikis/wikiIdentifier?wikiVersion=GBmain&pagePath=%2FHome
//  - https://dev.azure.com/org/project/_wiki/wikis/wikiIdentifier/123/Title-Of-Page
// Returns either a structured object OR an error message inside { error }.
function parseWikiUrl(url: string): { project: string; wikiIdentifier: string; pagePath?: string; pageId?: number; error?: undefined } | { error: string } {
  try {
    const u = new URL(url);
    // Path segments after host
    // Expect pattern: /{project}/_wiki/wikis/{wikiIdentifier}[/{pageId}/...]
    const segments = u.pathname.split("/").filter(Boolean); // remove empty
    const idx = segments.findIndex((s) => s === "_wiki");
    if (idx < 1 || segments[idx + 1] !== "wikis") {
      return { error: "URL does not match expected wiki pattern (missing /_wiki/wikis/ segment)." };
    }
    const project = segments[idx - 1];
    const wikiIdentifier = segments[idx + 2];
    if (!project || !wikiIdentifier) {
      return { error: "Could not extract project or wikiIdentifier from URL." };
    }

    // Query form with pagePath
    const pagePathParam = u.searchParams.get("pagePath");
    if (pagePathParam) {
      let decoded = decodeURIComponent(pagePathParam);
      if (!decoded.startsWith("/")) decoded = "/" + decoded;
      return { project, wikiIdentifier, pagePath: decoded };
    }

    // Path ID form: .../wikis/{wikiIdentifier}/{pageId}/...
    const afterWiki = segments.slice(idx + 3); // elements after wikiIdentifier
    if (afterWiki.length >= 1) {
      const maybeId = parseInt(afterWiki[0], 10);
      if (!isNaN(maybeId)) {
        return { project, wikiIdentifier, pageId: maybeId };
      }
    }

    // If nothing else specified, treat as root page
    return { project, wikiIdentifier, pagePath: "/" };
  } catch {
    return { error: "Invalid URL format." };
  }
}

export { WIKI_TOOLS, configureWikiTools };

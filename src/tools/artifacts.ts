// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch, subdomainBaseUrl } from "../shared/ado-rest.js";
import { errorMessage, toolError } from "../shared/tool-results.js";

const ARTIFACTS_TOOLS = {
  list_feeds: "artifacts_list_feeds",
  get_feed: "artifacts_get_feed",
  create_feed: "artifacts_create_feed",
  list_packages: "artifacts_list_packages",
  update_feed: "artifacts_update_feed",
  delete_feed: "artifacts_delete_feed",
  list_deleted_feeds: "artifacts_list_deleted_feeds",
  restore_feed: "artifacts_restore_feed",
  destroy_feed: "artifacts_destroy_feed",
  get_feed_permissions: "artifacts_get_feed_permissions",
  set_feed_permissions: "artifacts_set_feed_permissions",
  get_global_permissions: "artifacts_get_global_permissions",
  set_global_permissions: "artifacts_set_global_permissions",
  list_feed_views: "artifacts_list_feed_views",
  create_feed_view: "artifacts_create_feed_view",
  update_feed_view: "artifacts_update_feed_view",
  delete_feed_view: "artifacts_delete_feed_view",
  get_retention_policy: "artifacts_get_retention_policy",
  set_retention_policy: "artifacts_set_retention_policy",
  delete_retention_policy: "artifacts_delete_retention_policy",
  list_package_changes: "artifacts_list_package_changes",
  get_package: "artifacts_get_package",
  list_package_versions: "artifacts_list_package_versions",
  get_package_version: "artifacts_get_package_version",
  get_package_version_provenance: "artifacts_get_package_version_provenance",
  get_package_metrics: "artifacts_get_package_metrics",
  list_deleted_packages: "artifacts_list_deleted_packages",
  get_package_version_by_name: "artifacts_get_package_version_by_name",
  update_package_version: "artifacts_update_package_version",
  delete_package_version: "artifacts_delete_package_version",
  restore_package_version: "artifacts_restore_package_version",
  destroy_package_version: "artifacts_destroy_package_version",
  get_upstreaming_behavior: "artifacts_get_upstreaming_behavior",
  set_upstreaming_behavior: "artifacts_set_upstreaming_behavior",
};

const PROTOCOLS = ["nuget", "npm", "pypi", "maven", "upack", "cargo"] as const;
type Protocol = (typeof PROTOCOLS)[number];

// Routes of the protocol APIs (served from the pkgs host), relative to "_apis/packaging/".
// Written out whole so each maps to one documented operation; {placeholders} are filled by fillRoute.
// npm is the odd one out: an active version has no "packages/" segment.
const VERSION_ROUTES: Record<Protocol, string> = {
  nuget: "feeds/{feed}/nuget/packages/{name}/versions/{version}",
  npm: "feeds/{feed}/npm/{npmName}/versions/{version}",
  pypi: "feeds/{feed}/pypi/packages/{name}/versions/{version}",
  maven: "feeds/{feed}/maven/groups/{groupId}/artifacts/{artifactId}/versions/{version}",
  upack: "feeds/{feed}/upack/packages/{name}/versions/{version}",
  cargo: "feeds/{feed}/cargo/packages/{name}/versions/{version}",
};

const RECYCLE_BIN_ROUTES: Record<Protocol, string> = {
  nuget: "feeds/{feed}/nuget/RecycleBin/packages/{name}/versions/{version}",
  npm: "feeds/{feed}/npm/RecycleBin/packages/{npmName}/versions/{version}",
  pypi: "feeds/{feed}/pypi/RecycleBin/packages/{name}/versions/{version}",
  maven: "feeds/{feed}/maven/RecycleBin/groups/{groupId}/artifacts/{artifactId}/versions/{version}",
  upack: "feeds/{feed}/upack/RecycleBin/packages/{name}/versions/{version}",
  cargo: "feeds/{feed}/cargo/RecycleBin/packages/{name}/versions/{version}",
};

// Universal Packages have no upstreams.
const UPSTREAMING_ROUTES: Record<Exclude<Protocol, "upack">, string> = {
  nuget: "feeds/{feed}/nuget/packages/{name}/upstreaming",
  npm: "feeds/{feed}/npm/packages/{npmName}/upstreaming",
  pypi: "feeds/{feed}/pypi/packages/{name}/upstreaming",
  maven: "feeds/{feed}/maven/groups/{groupId}/artifacts/{artifactId}/upstreaming",
  cargo: "feeds/{feed}/cargo/packages/{name}/upstreaming",
};

/**
 * Fills a protocol route for a package. Maven packages are named "groupId:artifactId";
 * npm packages may be scoped ("@scope/name"), and the scope stays a route segment of its own.
 */
function fillRoute(template: string, protocol: Protocol, feedId: string, packageName: string, version = ""): string {
  const values: Record<string, string> = { feed: encodeURIComponent(feedId), name: encodeURIComponent(packageName), version: encodeURIComponent(version) };
  if (protocol === "maven") {
    const { groupId, artifactId } = mavenCoordinates(packageName);
    values.groupId = encodeURIComponent(groupId);
    values.artifactId = encodeURIComponent(artifactId);
  }
  if (protocol === "npm") values.npmName = npmName(packageName);
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key]);
}

/** The route of one package version, in the feed or in its recycle bin. */
export function protocolVersionRoute(protocol: Protocol, feedId: string, packageName: string, version: string, recycleBin = false): string {
  return fillRoute((recycleBin ? RECYCLE_BIN_ROUTES : VERSION_ROUTES)[protocol], protocol, feedId, packageName, version);
}

/** The upstreaming-behavior route of a package. */
export function upstreamingRoute(protocol: Exclude<Protocol, "upack">, feedId: string, packageName: string): string {
  return fillRoute(UPSTREAMING_ROUTES[protocol], protocol, feedId, packageName);
}

function mavenCoordinates(packageName: string): { groupId: string; artifactId: string } {
  const separator = packageName.lastIndexOf(":");
  if (separator <= 0 || separator === packageName.length - 1) {
    throw new Error(`A Maven package is named 'groupId:artifactId', got '${packageName}'.`);
  }
  return { groupId: packageName.slice(0, separator), artifactId: packageName.slice(separator + 1) };
}

/** "@scope/name" keeps its "@" and slash as separate route segments. */
function npmName(packageName: string): string {
  const scoped = packageName.match(/^@([^/]+)\/(.+)$/);
  return scoped ? `@${encodeURIComponent(scoped[1])}/${encodeURIComponent(scoped[2])}` : encodeURIComponent(packageName);
}

const artifactsApiVersion = "7.1-preview.1";

function configureArtifactsTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  // Feeds can be organization- or project-scoped. When a project is supplied the
  // path is prefixed with it; otherwise the feed is organization-scoped.
  async function request(method: string, project: string | undefined, pathAndQuery: string, body?: unknown, host = "feeds", contentType?: string): Promise<Response> {
    const connection = await connectionProvider();
    const token = await tokenProvider();
    const baseUrl = subdomainBaseUrl(connection.serverUrl, host);
    const scope = project ? `${encodeURIComponent(project)}/` : "";
    return adoFetch({ url: `${baseUrl}/${scope}_apis/packaging/${pathAndQuery}`, method, token, userAgent: userAgentProvider(), body, contentType });
  }

  /** Runs one request and turns the response into a tool result; `empty` is the text for a body-less success. */
  async function call(
    action: string,
    method: string,
    project: string | undefined,
    pathAndQuery: string,
    options: { body?: unknown; host?: string; contentType?: string; empty?: string; notFound?: string } = {}
  ) {
    try {
      const response = await request(method, project, pathAndQuery, options.body, options.host, options.contentType);
      if (response.status === 404 && options.notFound) {
        return { content: [{ type: "text" as const, text: options.notFound }], isError: true };
      }
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status}: ${text}`);
      }
      return { content: [{ type: "text" as const, text: text || options.empty || "Done." }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Error ${action}: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }

  const withVersion = (query: Record<string, string | number | boolean | undefined> = {}) => {
    const params = new URLSearchParams({ "api-version": artifactsApiVersion });
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.append(key, String(value));
    }
    return params.toString();
  };

  const projectParam = z.string().optional().describe("The project of a project-scoped feed. Omit for an organization-scoped feed.");
  const feedParam = z.string().describe("The ID or name of the feed.");

  registerTool(
    server,
    ARTIFACTS_TOOLS.list_feeds,
    "List Azure Artifacts feeds in the organization (or in a project, if specified).",
    {
      project: z.string().optional().describe("The name or ID of the project for project-scoped feeds. Omit for organization-scoped feeds."),
      feedRole: z.enum(["administrator", "contributor", "collaborator", "reader"]).optional().describe("Only return feeds where the caller has at least this role."),
    },
    async ({ project, feedRole }) => {
      try {
        const params = new URLSearchParams({ "api-version": artifactsApiVersion });
        if (feedRole) params.append("feedRole", feedRole);

        const response = await request("GET", project, `feeds?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list feeds (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        return toolError("listing feeds", error);
      }
    }
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.get_feed,
    "Get a single Azure Artifacts feed by its ID or name.",
    {
      feedId: z.string().describe("The ID or name of the feed."),
      project: z.string().optional().describe("The name or ID of the project for project-scoped feeds. Omit for organization-scoped feeds."),
    },
    async ({ feedId, project }) => {
      try {
        const response = await request("GET", project, `feeds/${encodeURIComponent(feedId)}?api-version=${artifactsApiVersion}`);
        if (response.status === 404) {
          return { content: [{ type: "text", text: `Feed '${feedId}' not found` }], isError: true };
        }
        if (!response.ok) {
          throw new Error(`Failed to get feed (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        return toolError("fetching feed", error);
      }
    }
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.create_feed,
    "Create a new Azure Artifacts feed in the organization (or in a project, if specified).",
    {
      name: z.string().describe("The name of the feed to create."),
      description: z.string().optional().describe("An optional description for the feed."),
      project: z.string().optional().describe("The name or ID of the project for a project-scoped feed. Omit for an organization-scoped feed."),
    },
    async ({ name, description, project }) => {
      try {
        const response = await request("POST", project, `feeds?api-version=${artifactsApiVersion}`, { name, description });
        if (!response.ok) {
          throw new Error(`Failed to create feed (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        return toolError("creating feed", error);
      }
    }
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.list_packages,
    "List packages in an Azure Artifacts feed, optionally filtered by protocol or name.",
    {
      feedId: z.string().describe("The ID or name of the feed."),
      project: z.string().optional().describe("The name or ID of the project for project-scoped feeds. Omit for organization-scoped feeds."),
      protocolType: z.string().optional().describe("Filter by protocol, e.g. 'npm', 'nuget', 'pypi', 'maven', 'upack'."),
      packageNameQuery: z.string().optional().describe("Filter packages whose name contains this substring."),
      top: z.coerce.number().default(50).describe("Maximum number of packages to return. Defaults to 50."),
    },
    async ({ feedId, project, protocolType, packageNameQuery, top }) => {
      try {
        const params = new URLSearchParams({ "api-version": artifactsApiVersion, "$top": String(top) });
        if (protocolType) params.append("protocolType", protocolType);
        if (packageNameQuery) params.append("packageNameQuery", packageNameQuery);

        const response = await request("GET", project, `feeds/${encodeURIComponent(feedId)}/packages?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list packages (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        return toolError("listing packages", error);
      }
    }
  );

  // ------------------------------------------------------------------ feeds ---

  registerTool(
    server,
    ARTIFACTS_TOOLS.update_feed,
    "Change a feed's settings: rename it, change its description, turn upstream sources on or off, replace the list of upstream sources, or hide deleted package versions. Only the fields you pass change; upstreamSources replaces the whole list, so read it with artifacts_get_feed first.",
    {
      feedId: feedParam,
      project: projectParam,
      name: z.string().optional().describe("New feed name."),
      description: z.string().optional().describe("New description."),
      upstreamEnabled: z.boolean().optional().describe("Whether the feed may pull packages from its upstream sources."),
      upstreamSources: z
        .array(z.record(z.string(), z.unknown()))
        .optional()
        .describe("The complete list of upstream sources, each as artifacts_get_feed returns it (name, protocol, location, upstreamSourceType, …)."),
      hideDeletedPackageVersions: z.boolean().optional().describe("Hide deleted package versions from package listings."),
      badgesEnabled: z.boolean().optional().describe("Allow public badges for packages in the feed."),
    },
    async ({ feedId, project, ...changes }) =>
      call(`updating feed '${feedId}'`, "PATCH", project, `feeds/${encodeURIComponent(feedId)}?${withVersion()}`, { body: changes, notFound: `Feed '${feedId}' not found` })
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.delete_feed,
    "Delete a feed with all of its packages. It moves to the feed recycle bin for 30 days and can be brought back with artifacts_restore_feed; until then every build and client using it fails to restore packages.",
    { feedId: feedParam, project: projectParam },
    async ({ feedId, project }) =>
      call(`deleting feed '${feedId}'`, "DELETE", project, `feeds/${encodeURIComponent(feedId)}?${withVersion()}`, {
        empty: `Feed '${feedId}' was moved to the recycle bin.`,
        notFound: `Feed '${feedId}' not found`,
      })
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.list_deleted_feeds,
    "List the feeds in the recycle bin, with when each was deleted and when it will be erased for good.",
    { project: projectParam },
    async ({ project }) => call("listing deleted feeds", "GET", project, `feedrecyclebin?${withVersion()}`)
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.restore_feed,
    "Restore a deleted feed and all of its packages from the recycle bin.",
    { feedId: z.string().describe("The ID of the deleted feed, as listed by artifacts_list_deleted_feeds."), project: projectParam },
    async ({ feedId, project }) =>
      call(`restoring feed '${feedId}'`, "PATCH", project, `feedrecyclebin/${encodeURIComponent(feedId)}?${withVersion()}`, {
        body: [{ op: "replace", path: "/isDeleted", value: false }],
        contentType: "application/json-patch+json",
        empty: `Feed '${feedId}' was restored.`,
      })
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.destroy_feed,
    "Permanently erase a feed that is in the recycle bin, with every package it held. This cannot be undone.",
    { feedId: z.string().describe("The ID of the deleted feed, as listed by artifacts_list_deleted_feeds."), project: projectParam },
    async ({ feedId, project }) =>
      call(`erasing feed '${feedId}'`, "DELETE", project, `feedrecyclebin/${encodeURIComponent(feedId)}?${withVersion()}`, {
        empty: `Feed '${feedId}' was permanently deleted.`,
      })
  );

  const roleParam = z.enum(["reader", "collaborator", "contributor", "administrator", "none"]);

  registerTool(
    server,
    ARTIFACTS_TOOLS.get_feed_permissions,
    "List who has which role on a feed: reader (install), collaborator (also save packages from upstreams), contributor (also publish), administrator.",
    {
      feedId: feedParam,
      project: projectParam,
      excludeInheritedPermissions: z.boolean().optional().describe("Leave out roles inherited from the project or organization."),
      identityDescriptor: z.string().optional().describe("Only the role of this identity."),
      includeIds: z.boolean().optional().describe("Also return each identity's ID."),
    },
    async ({ feedId, project, excludeInheritedPermissions, identityDescriptor, includeIds }) =>
      call(
        `fetching permissions of feed '${feedId}'`,
        "GET",
        project,
        `feeds/${encodeURIComponent(feedId)}/permissions?${withVersion({ excludeInheritedPermissions, identityDescriptor, includeIds })}`
      )
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.set_feed_permissions,
    "Give identities a role on a feed, or remove their role with 'none'. Only the listed identities change.",
    {
      feedId: feedParam,
      project: projectParam,
      permissions: z
        .array(
          z.object({
            identityDescriptor: z.string().describe("The identity descriptor, e.g. 'Microsoft.TeamFoundation.Identity;S-1-9-…', as artifacts_get_feed_permissions returns it."),
            role: roleParam.describe("The role to give; 'none' removes the identity's role."),
          })
        )
        .min(1)
        .describe("The role changes to apply."),
    },
    async ({ feedId, project, permissions }) =>
      call(`setting permissions of feed '${feedId}'`, "PATCH", project, `feeds/${encodeURIComponent(feedId)}/permissions?${withVersion()}`, { body: permissions })
  );

  registerTool(server, ARTIFACTS_TOOLS.get_global_permissions, "List who may create feeds and who administers all feeds in the organization.", {}, async () =>
    call("fetching global feed permissions", "GET", undefined, `globalpermissions?${withVersion()}`)
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.set_global_permissions,
    "Set who may create feeds ('feedCreator') and who administers every feed ('administrator') across the organization. Only the listed identities change.",
    {
      permissions: z
        .array(
          z.object({
            identityDescriptor: z.string().describe("The identity descriptor, as artifacts_get_global_permissions returns it."),
            role: z.enum(["feedCreator", "administrator", "none"]).describe("The organization-wide role; 'none' removes it."),
          })
        )
        .min(1)
        .describe("The role changes to apply."),
    },
    async ({ permissions }) => call("setting global feed permissions", "PATCH", undefined, `globalpermissions?${withVersion()}`, { body: permissions })
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.list_feed_views,
    "List a feed's views, such as @Local, @Prerelease and @Release. A view is a filtered subset of the feed that consumers can point at; package versions are promoted into it.",
    { feedId: feedParam, project: projectParam },
    async ({ feedId, project }) => call(`listing views of feed '${feedId}'`, "GET", project, `feeds/${encodeURIComponent(feedId)}/views?${withVersion()}`)
  );

  const visibilityParam = z
    .enum(["private", "collection", "organization", "aadTenant"])
    .optional()
    .describe("Who may read the view: 'private' (feed readers), 'organization', 'collection', or everyone in the Entra tenant ('aadTenant').");

  registerTool(
    server,
    ARTIFACTS_TOOLS.create_feed_view,
    "Create a release view on a feed, e.g. 'Beta'. Promote package versions into it with artifacts_update_package_version.",
    {
      feedId: feedParam,
      project: projectParam,
      name: z.string().describe("The view name."),
      visibility: visibilityParam,
    },
    async ({ feedId, project, name, visibility }) =>
      call(`creating view '${name}'`, "POST", project, `feeds/${encodeURIComponent(feedId)}/views?${withVersion()}`, { body: { name, type: "release", visibility } })
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.update_feed_view,
    "Rename a feed view or change who may read it.",
    {
      feedId: feedParam,
      project: projectParam,
      viewId: z.string().describe("The ID or name of the view."),
      name: z.string().optional().describe("New view name."),
      visibility: visibilityParam,
    },
    async ({ feedId, project, viewId, name, visibility }) =>
      call(`updating view '${viewId}'`, "PATCH", project, `feeds/${encodeURIComponent(feedId)}/views/${encodeURIComponent(viewId)}?${withVersion()}`, { body: { name, visibility } })
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.delete_feed_view,
    "Delete a view from a feed. The packages stay in the feed; consumers pointing at the view lose access through it.",
    { feedId: feedParam, project: projectParam, viewId: z.string().describe("The ID or name of the view.") },
    async ({ feedId, project, viewId }) =>
      call(`deleting view '${viewId}'`, "DELETE", project, `feeds/${encodeURIComponent(feedId)}/views/${encodeURIComponent(viewId)}?${withVersion()}`, {
        empty: `View '${viewId}' was deleted.`,
      })
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.get_retention_policy,
    "Get a feed's retention policy: how many versions of each package are kept and for how long recently downloaded versions are spared.",
    { feedId: feedParam, project: projectParam },
    async ({ feedId, project }) => call(`fetching the retention policy of feed '${feedId}'`, "GET", project, `feeds/${encodeURIComponent(feedId)}/retentionpolicies?${withVersion()}`)
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.set_retention_policy,
    "Set a feed's retention policy. Versions beyond the limit are deleted automatically, oldest first; versions in a view and recently downloaded ones are kept.",
    {
      feedId: feedParam,
      project: projectParam,
      countLimit: z.coerce.number().min(1).describe("Maximum number of versions kept per package."),
      daysToKeepRecentlyDownloadedPackages: z.coerce.number().min(1).optional().describe("Spare versions downloaded within this many days, even beyond the limit."),
    },
    async ({ feedId, project, countLimit, daysToKeepRecentlyDownloadedPackages }) =>
      call(`setting the retention policy of feed '${feedId}'`, "PUT", project, `feeds/${encodeURIComponent(feedId)}/retentionpolicies?${withVersion()}`, {
        body: { countLimit, daysToKeepRecentlyDownloadedPackages },
      })
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.delete_retention_policy,
    "Remove a feed's retention policy, so package versions are kept until someone deletes them.",
    { feedId: feedParam, project: projectParam },
    async ({ feedId, project }) =>
      call(`removing the retention policy of feed '${feedId}'`, "DELETE", project, `feeds/${encodeURIComponent(feedId)}/retentionpolicies?${withVersion()}`, {
        empty: `The retention policy of feed '${feedId}' was removed.`,
      })
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.list_package_changes,
    "List package changes in a feed — publishes, deletions, promotions — in batches. Each package version appears once, with its latest change; pass the returned continuationToken to read the next batch.",
    {
      feedId: feedParam,
      project: projectParam,
      continuationToken: z.coerce.number().optional().describe("The token from the previous batch. Omit to start from the beginning."),
      batchSize: z.coerce.number().min(1).max(1000).optional().describe("Changes per batch, up to 1000."),
    },
    async ({ feedId, project, continuationToken, batchSize }) =>
      call(`listing package changes of feed '${feedId}'`, "GET", project, `feeds/${encodeURIComponent(feedId)}/packagechanges?${withVersion({ continuationToken, batchSize })}`)
  );

  // --------------------------------------------------------------- packages ---

  const packageIdParam = z.string().describe("The package ID (GUID), as artifacts_list_packages returns it.");
  const versionIdParam = z.string().describe("The package version ID (GUID), as artifacts_list_package_versions returns it.");

  registerTool(
    server,
    ARTIFACTS_TOOLS.get_package,
    "Get one package of a feed by its ID, with its latest version or all of them.",
    {
      feedId: feedParam,
      project: projectParam,
      packageId: packageIdParam,
      includeAllVersions: z.boolean().optional().describe("Return every version rather than only the latest."),
      includeDeleted: z.boolean().optional().describe("Also return deleted versions."),
    },
    async ({ feedId, project, packageId, includeAllVersions, includeDeleted }) =>
      call(`fetching package '${packageId}'`, "GET", project, `feeds/${encodeURIComponent(feedId)}/packages/${encodeURIComponent(packageId)}?${withVersion({ includeAllVersions, includeDeleted })}`, {
        notFound: `Package '${packageId}' not found in feed '${feedId}'`,
      })
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.list_package_versions,
    "List the versions of a package, with the views each is in, whether it is listed, and when it was published.",
    {
      feedId: feedParam,
      project: projectParam,
      packageId: packageIdParam,
      isListed: z.boolean().optional().describe("Only listed (true) or unlisted (false) versions."),
      isDeleted: z.boolean().optional().describe("Only deleted (true) or active (false) versions."),
    },
    async ({ feedId, project, packageId, isListed, isDeleted }) =>
      call(
        `listing versions of package '${packageId}'`,
        "GET",
        project,
        `feeds/${encodeURIComponent(feedId)}/packages/${encodeURIComponent(packageId)}/versions?${withVersion({ isListed, isDeleted })}`
      )
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.get_package_version,
    "Get one version of a package by ID: its author, views, dependencies, files, tags and where it came from (sourceChain).",
    { feedId: feedParam, project: projectParam, packageId: packageIdParam, packageVersionId: versionIdParam },
    async ({ feedId, project, packageId, packageVersionId }) =>
      call(
        `fetching package version '${packageVersionId}'`,
        "GET",
        project,
        `feeds/${encodeURIComponent(feedId)}/packages/${encodeURIComponent(packageId)}/versions/${encodeURIComponent(packageVersionId)}?${withVersion()}`,
        { notFound: `Package version '${packageVersionId}' not found` }
      )
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.get_package_version_provenance,
    "Get the provenance of a package version: who or what published it (for example a pipeline run, with its details) and with which client.",
    { feedId: feedParam, project: projectParam, packageId: packageIdParam, packageVersionId: versionIdParam },
    async ({ feedId, project, packageId, packageVersionId }) =>
      call(
        `fetching the provenance of package version '${packageVersionId}'`,
        "GET",
        project,
        `feeds/${encodeURIComponent(feedId)}/packages/${encodeURIComponent(packageId)}/versions/${encodeURIComponent(packageVersionId)}/provenance?${withVersion()}`
      )
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.get_package_metrics,
    "Get download counts and unique users for packages, or for the versions of one package when packageId is given.",
    {
      feedId: feedParam,
      project: projectParam,
      packageIds: z.array(z.string()).optional().describe("Packages to report on. Required unless packageId is given."),
      packageId: z.string().optional().describe("Report on the versions of this package instead."),
      packageVersionIds: z.array(z.string()).optional().describe("With packageId: the versions to report on. Required with packageId."),
    },
    async ({ feedId, project, packageIds, packageId, packageVersionIds }) => {
      if (packageId) {
        if (!packageVersionIds?.length) {
          return { content: [{ type: "text", text: "packageVersionIds is required with packageId." }], isError: true };
        }
        return call("fetching package version metrics", "POST", project, `feeds/${encodeURIComponent(feedId)}/packages/${encodeURIComponent(packageId)}/versionmetricsbatch?${withVersion()}`, {
          body: { packageVersionIds },
        });
      }
      if (!packageIds?.length) {
        return { content: [{ type: "text", text: "Give packageIds, or packageId with packageVersionIds." }], isError: true };
      }
      return call("fetching package metrics", "POST", project, `feeds/${encodeURIComponent(feedId)}/packagemetricsbatch?${withVersion()}`, { body: { packageIds } });
    }
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.list_deleted_packages,
    "List packages in a feed's recycle bin, or the deleted versions of one package when packageId is given. Deleted versions can be restored with artifacts_restore_package_version.",
    {
      feedId: feedParam,
      project: projectParam,
      packageId: z.string().optional().describe("List the deleted versions of this package."),
      protocolType: z.string().optional().describe("Only packages of this protocol, e.g. 'NuGet', 'npm', 'PyPI', 'Maven', 'UPack'."),
      packageNameQuery: z.string().optional().describe("Only packages whose name contains this text."),
      top: z.coerce.number().min(1).optional().describe("Maximum number of packages to return."),
    },
    async ({ feedId, project, packageId, protocolType, packageNameQuery, top }) =>
      packageId
        ? call(
            `listing deleted versions of package '${packageId}'`,
            "GET",
            project,
            `feeds/${encodeURIComponent(feedId)}/RecycleBin/Packages/${encodeURIComponent(packageId)}/Versions?${withVersion()}`
          )
        : call("listing deleted packages", "GET", project, `feeds/${encodeURIComponent(feedId)}/RecycleBin/Packages?${withVersion({ protocolType, packageNameQuery, $top: top })}`)
  );

  // ----------------------------------------------- versions, by protocol ---

  const protocolParam = z.enum(PROTOCOLS).describe("The package protocol: 'nuget', 'npm', 'pypi', 'maven', 'upack' (Universal Packages) or 'cargo'.");
  const packageNameParam = z.string().describe("The package name as the protocol spells it: 'Newtonsoft.Json', '@scope/name' for a scoped npm package, 'groupId:artifactId' for Maven.");
  const versionParam = z.string().describe("The version, e.g. '1.4.0'.");
  const versionTarget = { feedId: feedParam, project: projectParam, protocol: protocolParam, packageName: packageNameParam, version: versionParam };

  /** Resolves the protocol route, or returns an error result for a malformed name. */
  function routeOrError(build: () => string): { route: string } | { error: { content: { type: "text"; text: string }[]; isError: true } } {
    try {
      return { route: build() };
    } catch (error) {
      return { error: { content: [{ type: "text", text: errorMessage(error) }], isError: true } };
    }
  }

  registerTool(
    server,
    ARTIFACTS_TOOLS.get_package_version_by_name,
    "Get a package version by protocol, name and version number rather than by IDs: whether it is listed or deleted, its views and publish date. Set fromRecycleBin to look at a deleted version.",
    { ...versionTarget, fromRecycleBin: z.boolean().default(false).describe("Look the version up in the recycle bin.") },
    async ({ feedId, project, protocol, packageName, version, fromRecycleBin }) => {
      const resolved = routeOrError(() => protocolVersionRoute(protocol, feedId, packageName, version, fromRecycleBin));
      if ("error" in resolved) return resolved.error;
      return call(`fetching ${packageName} ${version}`, "GET", project, `${resolved.route}?${withVersion()}`, {
        host: "pkgs",
        notFound: `${protocol} package '${packageName}' ${version} not found in feed '${feedId}'${fromRecycleBin ? "'s recycle bin" : ""}`,
      });
    }
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.update_package_version,
    "Change a package version: promote it into a view (e.g. 'Release'), unlist or relist it (NuGet only), or deprecate it with a message (npm only; an empty message undeprecates).",
    {
      ...versionTarget,
      promoteToView: z.string().optional().describe("Add the version to this view, e.g. 'Release' or 'Prerelease'."),
      listed: z.boolean().optional().describe("NuGet only: false hides the version from search and version lists without deleting it."),
      deprecateMessage: z.string().optional().describe("npm only: the deprecation message; an empty string removes the deprecation."),
    },
    async ({ feedId, project, protocol, packageName, version, promoteToView, listed, deprecateMessage }) => {
      if (promoteToView === undefined && listed === undefined && deprecateMessage === undefined) {
        return { content: [{ type: "text", text: "Nothing to change: give promoteToView, listed or deprecateMessage." }], isError: true };
      }
      if (listed !== undefined && protocol !== "nuget") {
        return { content: [{ type: "text", text: "listed applies to NuGet packages only." }], isError: true };
      }
      if (deprecateMessage !== undefined && protocol !== "npm") {
        return { content: [{ type: "text", text: "deprecateMessage applies to npm packages only." }], isError: true };
      }
      const resolved = routeOrError(() => protocolVersionRoute(protocol, feedId, packageName, version));
      if ("error" in resolved) return resolved.error;
      const body: Record<string, unknown> = {};
      if (promoteToView !== undefined) body.views = { op: "add", path: "/views/-", value: promoteToView };
      if (listed !== undefined) body.listed = listed;
      if (deprecateMessage !== undefined) body.deprecateMessage = deprecateMessage;
      return call(`updating ${packageName} ${version}`, "PATCH", project, `${resolved.route}?${withVersion()}`, {
        host: "pkgs",
        body,
        empty: `${packageName} ${version} was updated.`,
      });
    }
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.delete_package_version,
    "Delete a package version (for npm: unpublish). It moves to the feed's recycle bin, from which artifacts_restore_package_version brings it back; clients can no longer install it meanwhile.",
    versionTarget,
    async ({ feedId, project, protocol, packageName, version }) => {
      const resolved = routeOrError(() => protocolVersionRoute(protocol, feedId, packageName, version));
      if ("error" in resolved) return resolved.error;
      return call(`deleting ${packageName} ${version}`, "DELETE", project, `${resolved.route}?${withVersion()}`, {
        host: "pkgs",
        empty: `${packageName} ${version} was moved to the recycle bin.`,
      });
    }
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.restore_package_version,
    "Restore a deleted package version from the feed's recycle bin.",
    versionTarget,
    async ({ feedId, project, protocol, packageName, version }) => {
      const resolved = routeOrError(() => protocolVersionRoute(protocol, feedId, packageName, version, true));
      if ("error" in resolved) return resolved.error;
      return call(`restoring ${packageName} ${version}`, "PATCH", project, `${resolved.route}?${withVersion()}`, {
        host: "pkgs",
        body: { deleted: false },
        empty: `${packageName} ${version} was restored.`,
      });
    }
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.destroy_package_version,
    "Permanently erase a package version that is in the recycle bin. This cannot be undone, and the same version number can never be published to the feed again.",
    versionTarget,
    async ({ feedId, project, protocol, packageName, version }) => {
      const resolved = routeOrError(() => protocolVersionRoute(protocol, feedId, packageName, version, true));
      if ("error" in resolved) return resolved.error;
      return call(`erasing ${packageName} ${version}`, "DELETE", project, `${resolved.route}?${withVersion()}`, {
        host: "pkgs",
        empty: `${packageName} ${version} was permanently deleted.`,
      });
    }
  );

  const upstreamTarget = {
    feedId: feedParam,
    project: projectParam,
    protocol: z.enum(["nuget", "npm", "pypi", "maven", "cargo"]).describe("The package protocol. Universal Packages have no upstreams."),
    packageName: packageNameParam,
  };

  registerTool(
    server,
    ARTIFACTS_TOOLS.get_upstreaming_behavior,
    "Get whether a package may take versions from external upstream sources (e.g. nuget.org, npmjs) once the feed holds a version of its own.",
    upstreamTarget,
    async ({ feedId, project, protocol, packageName }) => {
      const resolved = routeOrError(() => upstreamingRoute(protocol, feedId, packageName));
      if ("error" in resolved) return resolved.error;
      return call(`fetching the upstreaming behavior of '${packageName}'`, "GET", project, `${resolved.route}?${withVersion()}`, { host: "pkgs" });
    }
  );

  registerTool(
    server,
    ARTIFACTS_TOOLS.set_upstreaming_behavior,
    "Set whether a package may take versions from external upstream sources. 'auto' blocks external versions once the feed holds a version of its own, which protects against dependency confusion; 'allowExternalVersions' lifts that block. The package need not be in the feed yet.",
    {
      ...upstreamTarget,
      versionsFromExternalUpstreams: z.enum(["auto", "allowExternalVersions"]).describe("'auto' (the safe default) or 'allowExternalVersions'."),
    },
    async ({ feedId, project, protocol, packageName, versionsFromExternalUpstreams }) => {
      const resolved = routeOrError(() => upstreamingRoute(protocol, feedId, packageName));
      if ("error" in resolved) return resolved.error;
      return call(`setting the upstreaming behavior of '${packageName}'`, "PATCH", project, `${resolved.route}?${withVersion()}`, {
        host: "pkgs",
        body: { versionsFromExternalUpstreams },
        empty: `Upstreaming behavior of '${packageName}' set to '${versionsFromExternalUpstreams}'.`,
      });
    }
  );
}

export { ARTIFACTS_TOOLS, configureArtifactsTools };

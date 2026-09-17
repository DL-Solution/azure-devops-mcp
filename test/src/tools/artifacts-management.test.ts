// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Feed management, package details and per-protocol package version operations.
// The original four feed tools are covered by artifacts.test.ts.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";

import { ARTIFACTS_TOOLS, configureArtifactsTools, protocolVersionRoute, upstreamingRoute } from "../../../src/tools/artifacts";
import { createToolServer } from "../../mocks/tool-server";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const FEEDS = "https://feeds.dev.azure.com/contoso";
const PKGS = "https://pkgs.dev.azure.com/contoso";
const V = "api-version=7.1-preview.1";

describe("protocolVersionRoute", () => {
  it.each([
    ["nuget", "Newtonsoft.Json", false, "nuget/packages/Newtonsoft.Json/versions/1.0.0"],
    ["nuget", "Newtonsoft.Json", true, "nuget/RecycleBin/packages/Newtonsoft.Json/versions/1.0.0"],
    ["pypi", "requests", false, "pypi/packages/requests/versions/1.0.0"],
    ["upack", "tools", true, "upack/RecycleBin/packages/tools/versions/1.0.0"],
    ["cargo", "serde", false, "cargo/packages/serde/versions/1.0.0"],
    ["npm", "left-pad", false, "npm/left-pad/versions/1.0.0"],
    ["npm", "left-pad", true, "npm/RecycleBin/packages/left-pad/versions/1.0.0"],
    ["npm", "@contoso/ui", false, "npm/@contoso/ui/versions/1.0.0"],
    ["npm", "@contoso/ui", true, "npm/RecycleBin/packages/@contoso/ui/versions/1.0.0"],
    ["maven", "com.contoso:core", false, "maven/groups/com.contoso/artifacts/core/versions/1.0.0"],
    ["maven", "com.contoso:core", true, "maven/RecycleBin/groups/com.contoso/artifacts/core/versions/1.0.0"],
  ] as const)("%s %s (recycle bin: %s)", (protocol, name, recycleBin, route) => {
    expect(protocolVersionRoute(protocol, "shared", name, "1.0.0", recycleBin)).toBe(`feeds/shared/${route}`);
  });

  it("encodes names and versions", () => {
    expect(protocolVersionRoute("nuget", "my feed", "a b", "1.0.0+build/1")).toBe("feeds/my%20feed/nuget/packages/a%20b/versions/1.0.0%2Bbuild%2F1");
  });

  it.each(["core", ":core", "com.contoso:"])("rejects the Maven name %j", (name) => {
    expect(() => protocolVersionRoute("maven", "shared", name, "1.0.0")).toThrow(/groupId:artifactId/);
  });
});

describe("upstreamingRoute", () => {
  it.each([
    ["nuget", "Newtonsoft.Json", "nuget/packages/Newtonsoft.Json/upstreaming"],
    ["pypi", "requests", "pypi/packages/requests/upstreaming"],
    ["cargo", "serde", "cargo/packages/serde/upstreaming"],
    ["npm", "left-pad", "npm/packages/left-pad/upstreaming"],
    ["npm", "@contoso/ui", "npm/packages/@contoso/ui/upstreaming"],
    ["maven", "com.contoso:core", "maven/groups/com.contoso/artifacts/core/upstreaming"],
  ] as const)("%s %s", (protocol, name, route) => {
    expect(upstreamingRoute(protocol, "shared", name)).toBe(`feeds/shared/${route}`);
  });
});

describe("artifacts management tools", () => {
  let server: McpServer;
  let mockFetch: jest.Mock;
  let connectionProvider: () => Promise<WebApi>;

  beforeEach(() => {
    server = createToolServer() as unknown as McpServer;
    connectionProvider = jest.fn().mockResolvedValue({ serverUrl: "https://dev.azure.com/contoso" } as unknown as WebApi) as () => Promise<WebApi>;
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  function handlerFor(toolName: string): Handler {
    configureArtifactsTools(server, jest.fn(() => Promise.resolve("token")) as () => Promise<string>, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as Handler;
  }

  const respond = (body: string, status = 200) => mockFetch.mockResolvedValue({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });
  const request = () => {
    const [url, init] = mockFetch.mock.calls[0] as [string, { method: string; body?: string; headers: Record<string, string> }];
    return { url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body), headers: init.headers };
  };

  describe("feeds", () => {
    it("updates only the given feed settings", async () => {
      respond('{"id":"f1"}');

      const result = await handlerFor(ARTIFACTS_TOOLS.update_feed)({ feedId: "shared", project: "Platform", description: "Shared packages", upstreamEnabled: false });

      expect(request()).toMatchObject({ url: `${FEEDS}/Platform/_apis/packaging/feeds/shared?${V}`, method: "PATCH", body: { description: "Shared packages", upstreamEnabled: false } });
      expect(result.content[0].text).toBe('{"id":"f1"}');
    });

    it("reports a missing feed", async () => {
      respond("", 404);

      const result = await handlerFor(ARTIFACTS_TOOLS.update_feed)({ feedId: "ghost", name: "x" });

      expect(result).toEqual({ content: [{ type: "text", text: "Feed 'ghost' not found" }], isError: true });
    });

    it("deletes a feed into the recycle bin", async () => {
      respond("", 204);

      const result = await handlerFor(ARTIFACTS_TOOLS.delete_feed)({ feedId: "shared" });

      expect(request()).toMatchObject({ url: `${FEEDS}/_apis/packaging/feeds/shared?${V}`, method: "DELETE" });
      expect(result.content[0].text).toBe("Feed 'shared' was moved to the recycle bin.");
    });

    it("lists deleted feeds", async () => {
      respond('{"count":1}');

      await handlerFor(ARTIFACTS_TOOLS.list_deleted_feeds)({});

      expect(request()).toMatchObject({ url: `${FEEDS}/_apis/packaging/feedrecyclebin?${V}`, method: "GET" });
    });

    it("restores a feed with a JSON patch that clears isDeleted", async () => {
      respond("", 204);

      const result = await handlerFor(ARTIFACTS_TOOLS.restore_feed)({ feedId: "f1", project: "Hansa" });

      const sent = request();
      expect(sent).toMatchObject({ url: `${FEEDS}/Hansa/_apis/packaging/feedrecyclebin/f1?${V}`, method: "PATCH", body: [{ op: "replace", path: "/isDeleted", value: false }] });
      expect(sent.headers["Content-Type"]).toBe("application/json-patch+json; charset=utf-8");
      expect(result.content[0].text).toBe("Feed 'f1' was restored.");
    });

    it("erases a feed from the recycle bin", async () => {
      respond("", 204);

      await handlerFor(ARTIFACTS_TOOLS.destroy_feed)({ feedId: "f1" });

      expect(request()).toMatchObject({ url: `${FEEDS}/_apis/packaging/feedrecyclebin/f1?${V}`, method: "DELETE" });
    });

    it("reads feed permissions with its filters", async () => {
      respond('{"value":[]}');

      await handlerFor(ARTIFACTS_TOOLS.get_feed_permissions)({ feedId: "shared", excludeInheritedPermissions: true, includeIds: true });

      expect(request().url).toBe(`${FEEDS}/_apis/packaging/feeds/shared/permissions?${V}&excludeInheritedPermissions=true&includeIds=true`);
    });

    it("sets feed roles", async () => {
      respond("[]");
      const permissions = [{ identityDescriptor: "Microsoft.TeamFoundation.Identity;S-1", role: "contributor" }];

      await handlerFor(ARTIFACTS_TOOLS.set_feed_permissions)({ feedId: "shared", permissions });

      expect(request()).toMatchObject({ url: `${FEEDS}/_apis/packaging/feeds/shared/permissions?${V}`, method: "PATCH", body: permissions });
    });

    it("reads and sets organization-wide feed permissions", async () => {
      respond("[]");
      await handlerFor(ARTIFACTS_TOOLS.get_global_permissions)({});
      expect(request()).toMatchObject({ url: `${FEEDS}/_apis/packaging/globalpermissions?${V}`, method: "GET" });

      mockFetch.mockClear();
      const permissions = [{ identityDescriptor: "d", role: "feedCreator" }];
      await handlerFor(ARTIFACTS_TOOLS.set_global_permissions)({ permissions });
      expect(request()).toMatchObject({ method: "PATCH", body: permissions });
    });

    it("manages views", async () => {
      respond("{}");
      await handlerFor(ARTIFACTS_TOOLS.list_feed_views)({ feedId: "shared" });
      expect(request()).toMatchObject({ url: `${FEEDS}/_apis/packaging/feeds/shared/views?${V}`, method: "GET" });

      mockFetch.mockClear();
      await handlerFor(ARTIFACTS_TOOLS.create_feed_view)({ feedId: "shared", name: "Beta", visibility: "organization" });
      expect(request()).toMatchObject({ method: "POST", body: { name: "Beta", type: "release", visibility: "organization" } });

      mockFetch.mockClear();
      await handlerFor(ARTIFACTS_TOOLS.update_feed_view)({ feedId: "shared", viewId: "Beta", name: "Preview" });
      expect(request()).toMatchObject({ url: `${FEEDS}/_apis/packaging/feeds/shared/views/Beta?${V}`, method: "PATCH", body: { name: "Preview" } });

      mockFetch.mockClear();
      respond("", 204);
      const result = await handlerFor(ARTIFACTS_TOOLS.delete_feed_view)({ feedId: "shared", viewId: "Preview" });
      expect(request()).toMatchObject({ method: "DELETE" });
      expect(result.content[0].text).toBe("View 'Preview' was deleted.");
    });

    it("manages the retention policy", async () => {
      respond('{"countLimit":30}');
      await handlerFor(ARTIFACTS_TOOLS.get_retention_policy)({ feedId: "shared" });
      expect(request()).toMatchObject({ url: `${FEEDS}/_apis/packaging/feeds/shared/retentionpolicies?${V}`, method: "GET" });

      mockFetch.mockClear();
      await handlerFor(ARTIFACTS_TOOLS.set_retention_policy)({ feedId: "shared", countLimit: 20, daysToKeepRecentlyDownloadedPackages: 14 });
      expect(request()).toMatchObject({ method: "PUT", body: { countLimit: 20, daysToKeepRecentlyDownloadedPackages: 14 } });

      mockFetch.mockClear();
      respond("", 204);
      const result = await handlerFor(ARTIFACTS_TOOLS.delete_retention_policy)({ feedId: "shared" });
      expect(request()).toMatchObject({ method: "DELETE" });
      expect(result.content[0].text).toBe("The retention policy of feed 'shared' was removed.");
    });

    it("pages through package changes", async () => {
      respond('{"count":0}');

      await handlerFor(ARTIFACTS_TOOLS.list_package_changes)({ feedId: "shared", continuationToken: 120, batchSize: 50 });

      expect(request().url).toBe(`${FEEDS}/_apis/packaging/feeds/shared/packagechanges?${V}&continuationToken=120&batchSize=50`);
    });

    it("surfaces an API error with its status and body", async () => {
      respond('{"message":"VS800075: no permission"}', 403);

      const result = await handlerFor(ARTIFACTS_TOOLS.list_feed_views)({ feedId: "shared" });

      expect(result).toEqual({ content: [{ type: "text", text: 'Error listing views of feed \'shared\': 403: {"message":"VS800075: no permission"}' }], isError: true });
    });

    it("surfaces a network failure", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNRESET"));

      const result = await handlerFor(ARTIFACTS_TOOLS.get_retention_policy)({ feedId: "shared" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ECONNRESET");
    });

    it("falls back to a generic confirmation for an empty success without a message", async () => {
      respond("", 204);

      const result = await handlerFor(ARTIFACTS_TOOLS.set_feed_permissions)({ feedId: "shared", permissions: [{ identityDescriptor: "d", role: "none" }] });

      expect(result.content[0].text).toBe("Done.");
    });
  });

  describe("packages", () => {
    it("gets a package with its options", async () => {
      respond("{}");

      await handlerFor(ARTIFACTS_TOOLS.get_package)({ feedId: "shared", packageId: "p1", includeAllVersions: true });

      expect(request().url).toBe(`${FEEDS}/_apis/packaging/feeds/shared/packages/p1?${V}&includeAllVersions=true`);
    });

    it("reports a missing package", async () => {
      respond("", 404);

      const result = await handlerFor(ARTIFACTS_TOOLS.get_package)({ feedId: "shared", packageId: "p1" });

      expect(result.content[0].text).toBe("Package 'p1' not found in feed 'shared'");
    });

    it("lists versions, gets one and its provenance", async () => {
      respond("{}");
      await handlerFor(ARTIFACTS_TOOLS.list_package_versions)({ feedId: "shared", packageId: "p1", isListed: true });
      expect(request().url).toBe(`${FEEDS}/_apis/packaging/feeds/shared/packages/p1/versions?${V}&isListed=true`);

      mockFetch.mockClear();
      await handlerFor(ARTIFACTS_TOOLS.get_package_version)({ feedId: "shared", packageId: "p1", packageVersionId: "v1" });
      expect(request().url).toBe(`${FEEDS}/_apis/packaging/feeds/shared/packages/p1/versions/v1?${V}`);

      mockFetch.mockClear();
      await handlerFor(ARTIFACTS_TOOLS.get_package_version_provenance)({ feedId: "shared", packageId: "p1", packageVersionId: "v1" });
      expect(request().url).toBe(`${FEEDS}/_apis/packaging/feeds/shared/packages/p1/versions/v1/provenance?${V}`);
    });

    it("reports a missing package version", async () => {
      respond("", 404);

      const result = await handlerFor(ARTIFACTS_TOOLS.get_package_version)({ feedId: "shared", packageId: "p1", packageVersionId: "v9" });

      expect(result.content[0].text).toBe("Package version 'v9' not found");
    });

    it("queries package metrics", async () => {
      respond("[]");

      await handlerFor(ARTIFACTS_TOOLS.get_package_metrics)({ feedId: "shared", packageIds: ["p1", "p2"] });

      expect(request()).toMatchObject({ url: `${FEEDS}/_apis/packaging/feeds/shared/packagemetricsbatch?${V}`, method: "POST", body: { packageIds: ["p1", "p2"] } });
    });

    it("queries version metrics of one package", async () => {
      respond("[]");

      await handlerFor(ARTIFACTS_TOOLS.get_package_metrics)({ feedId: "shared", packageId: "p1", packageVersionIds: ["v1"] });

      expect(request()).toMatchObject({ url: `${FEEDS}/_apis/packaging/feeds/shared/packages/p1/versionmetricsbatch?${V}`, body: { packageVersionIds: ["v1"] } });
    });

    it.each([
      [{ packageId: "p1" }, "packageVersionIds is required with packageId."],
      [{}, "Give packageIds, or packageId with packageVersionIds."],
    ])("refuses incomplete metrics arguments %j", async (args, message) => {
      const result = await handlerFor(ARTIFACTS_TOOLS.get_package_metrics)({ feedId: "shared", ...args });

      expect(result).toEqual({ content: [{ type: "text", text: message }], isError: true });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("lists deleted packages, or the deleted versions of one", async () => {
      respond("{}");
      await handlerFor(ARTIFACTS_TOOLS.list_deleted_packages)({ feedId: "shared", protocolType: "NuGet", top: 5 });
      expect(request().url).toBe(`${FEEDS}/_apis/packaging/feeds/shared/RecycleBin/Packages?${V}&protocolType=NuGet&%24top=5`);

      mockFetch.mockClear();
      await handlerFor(ARTIFACTS_TOOLS.list_deleted_packages)({ feedId: "shared", packageId: "p1" });
      expect(request().url).toBe(`${FEEDS}/_apis/packaging/feeds/shared/RecycleBin/Packages/p1/Versions?${V}`);
    });
  });

  describe("package versions by protocol", () => {
    const target = { feedId: "shared", project: "Platform", protocol: "nuget", packageName: "Contoso.Core", version: "2.1.0" };
    const active = `${PKGS}/Platform/_apis/packaging/feeds/shared/nuget/packages/Contoso.Core/versions/2.1.0?${V}`;
    const binned = `${PKGS}/Platform/_apis/packaging/feeds/shared/nuget/RecycleBin/packages/Contoso.Core/versions/2.1.0?${V}`;

    it("gets a version by name from the pkgs host", async () => {
      respond('{"version":"2.1.0"}');

      await handlerFor(ARTIFACTS_TOOLS.get_package_version_by_name)({ ...target, fromRecycleBin: false });

      expect(request()).toMatchObject({ url: active, method: "GET" });
    });

    it("gets a deleted version from the recycle bin and names what was missing", async () => {
      respond("", 404);

      const result = await handlerFor(ARTIFACTS_TOOLS.get_package_version_by_name)({ ...target, fromRecycleBin: true });

      expect(request().url).toBe(binned);
      expect(result.content[0].text).toBe("nuget package 'Contoso.Core' 2.1.0 not found in feed 'shared''s recycle bin");
    });

    it("promotes a version into a view", async () => {
      respond("", 202);

      const result = await handlerFor(ARTIFACTS_TOOLS.update_package_version)({ ...target, promoteToView: "Release" });

      expect(request()).toMatchObject({ url: active, method: "PATCH", body: { views: { op: "add", path: "/views/-", value: "Release" } } });
      expect(result.content[0].text).toBe("Contoso.Core 2.1.0 was updated.");
    });

    it("unlists a NuGet version", async () => {
      respond("", 202);

      await handlerFor(ARTIFACTS_TOOLS.update_package_version)({ ...target, listed: false });

      expect(request().body).toEqual({ listed: false });
    });

    it("deprecates a scoped npm version", async () => {
      respond("", 202);

      await handlerFor(ARTIFACTS_TOOLS.update_package_version)({ ...target, protocol: "npm", packageName: "@contoso/ui", deprecateMessage: "use 3.x" });

      expect(request()).toMatchObject({ url: `${PKGS}/Platform/_apis/packaging/feeds/shared/npm/@contoso/ui/versions/2.1.0?${V}`, body: { deprecateMessage: "use 3.x" } });
    });

    it.each([
      [{}, "Nothing to change: give promoteToView, listed or deprecateMessage."],
      [{ protocol: "npm", listed: false }, "listed applies to NuGet packages only."],
      [{ deprecateMessage: "old" }, "deprecateMessage applies to npm packages only."],
      [{ protocol: "maven", packageName: "no-colon", promoteToView: "Release" }, "A Maven package is named 'groupId:artifactId', got 'no-colon'."],
    ])("refuses the update %j", async (args, message) => {
      const result = await handlerFor(ARTIFACTS_TOOLS.update_package_version)({ ...target, ...args });

      expect(result).toEqual({ content: [{ type: "text", text: message }], isError: true });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("deletes, restores and erases a version", async () => {
      respond("", 202);
      let result = await handlerFor(ARTIFACTS_TOOLS.delete_package_version)(target);
      expect(request()).toMatchObject({ url: active, method: "DELETE" });
      expect(result.content[0].text).toBe("Contoso.Core 2.1.0 was moved to the recycle bin.");

      mockFetch.mockClear();
      result = await handlerFor(ARTIFACTS_TOOLS.restore_package_version)(target);
      expect(request()).toMatchObject({ url: binned, method: "PATCH", body: { deleted: false } });
      expect(result.content[0].text).toBe("Contoso.Core 2.1.0 was restored.");

      mockFetch.mockClear();
      result = await handlerFor(ARTIFACTS_TOOLS.destroy_package_version)(target);
      expect(request()).toMatchObject({ url: binned, method: "DELETE" });
      expect(result.content[0].text).toBe("Contoso.Core 2.1.0 was permanently deleted.");
    });

    it.each([ARTIFACTS_TOOLS.get_package_version_by_name, ARTIFACTS_TOOLS.delete_package_version, ARTIFACTS_TOOLS.restore_package_version, ARTIFACTS_TOOLS.destroy_package_version])(
      "%s refuses a malformed Maven name",
      async (tool) => {
        const result = await handlerFor(tool)({ ...target, protocol: "maven", packageName: "core", fromRecycleBin: false });

        expect(result.isError).toBe(true);
        expect(mockFetch).not.toHaveBeenCalled();
      }
    );

    it("reads and sets the upstreaming behavior of a Maven package", async () => {
      const route = `${PKGS}/_apis/packaging/feeds/shared/maven/groups/com.contoso/artifacts/core/upstreaming?${V}`;
      respond('{"versionsFromExternalUpstreams":"auto"}');
      await handlerFor(ARTIFACTS_TOOLS.get_upstreaming_behavior)({ feedId: "shared", protocol: "maven", packageName: "com.contoso:core" });
      expect(request()).toMatchObject({ url: route, method: "GET" });

      mockFetch.mockClear();
      respond("", 204);
      const result = await handlerFor(ARTIFACTS_TOOLS.set_upstreaming_behavior)({
        feedId: "shared",
        protocol: "maven",
        packageName: "com.contoso:core",
        versionsFromExternalUpstreams: "allowExternalVersions",
      });
      expect(request()).toMatchObject({ url: route, method: "PATCH", body: { versionsFromExternalUpstreams: "allowExternalVersions" } });
      expect(result.content[0].text).toBe("Upstreaming behavior of 'com.contoso:core' set to 'allowExternalVersions'.");
    });

    it.each([ARTIFACTS_TOOLS.get_upstreaming_behavior, ARTIFACTS_TOOLS.set_upstreaming_behavior])("%s refuses a malformed Maven name", async (tool) => {
      const result = await handlerFor(tool)({ feedId: "shared", protocol: "maven", packageName: "core", versionsFromExternalUpstreams: "auto" });

      expect(result.isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

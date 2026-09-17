// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configureServiceHooksTools, SERVICE_HOOKS_TOOLS } from "../../../src/tools/service-hooks";
import { configureServiceEndpointTools, SERVICE_ENDPOINT_TOOLS } from "../../../src/tools/service-endpoint";
import { configureGraphTools, GRAPH_TOOLS } from "../../../src/tools/graph";
import { createToolServer } from "../../mocks/tool-server";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
type Configure = (server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) => void;

describe("service hooks, service connections and graph administration", () => {
  let server: McpServer;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    server = createToolServer() as unknown as McpServer;
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  function handler(configure: Configure, toolName: string): Handler {
    configure(
      server,
      () => Promise.resolve("fake-token"),
      () => Promise.resolve({ serverUrl: "https://dev.azure.com/contoso" } as unknown as WebApi),
      () => "Jest"
    );
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as Handler;
  }

  const respond = (body: string, status = 200, headers: Record<string, string> = {}) =>
    mockFetch.mockResolvedValue({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body), headers: new Headers(headers) });

  const request = () => {
    const [url, init] = mockFetch.mock.calls[0] as [string, { method: string; body?: string; headers: Record<string, string> }];
    return { url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body), headers: init.headers };
  };

  describe("service hooks", () => {
    const hooks = (name: string) => handler(configureServiceHooksTools, name);

    it("replaces a subscription", async () => {
      respond('{"id":"s1"}');
      const subscription = { publisherId: "tfs", status: "disabledByUser" };

      await hooks(SERVICE_HOOKS_TOOLS.update_subscription)({ subscriptionId: "s1", subscription });

      expect(request()).toMatchObject({ url: "https://dev.azure.com/contoso/_apis/hooks/subscriptions/s1?api-version=7.1", method: "PUT", body: subscription });
    });

    it("lists publishers, event types and consumers", async () => {
      respond('{"value":[]}');

      await hooks(SERVICE_HOOKS_TOOLS.list_publishers)({});
      await hooks(SERVICE_HOOKS_TOOLS.list_event_types)({ publisherId: "tfs" });
      await hooks(SERVICE_HOOKS_TOOLS.list_consumers)({ publisherId: "tfs" });
      await hooks(SERVICE_HOOKS_TOOLS.get_consumer)({ consumerId: "webHooks" });

      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        "https://dev.azure.com/contoso/_apis/hooks/publishers?api-version=7.1",
        "https://dev.azure.com/contoso/_apis/hooks/publishers/tfs/eventtypes?api-version=7.1",
        "https://dev.azure.com/contoso/_apis/hooks/consumers?api-version=7.1&publisherId=tfs",
        "https://dev.azure.com/contoso/_apis/hooks/consumers/webHooks?api-version=7.1",
      ]);
    });

    it("lists and gets notifications of a subscription", async () => {
      respond('{"value":[]}');

      await hooks(SERVICE_HOOKS_TOOLS.list_notifications)({ subscriptionId: "s1", maxResults: 5, result: "failed" });
      await hooks(SERVICE_HOOKS_TOOLS.get_notification)({ subscriptionId: "s1", notificationId: 7 });

      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        "https://dev.azure.com/contoso/_apis/hooks/subscriptions/s1/notifications?api-version=7.1&maxResults=5&result=failed",
        "https://dev.azure.com/contoso/_apis/hooks/subscriptions/s1/notifications/7?api-version=7.1",
      ]);
    });

    it("sends a test notification for an existing subscription", async () => {
      respond('{"id":1}');

      await hooks(SERVICE_HOOKS_TOOLS.send_test_notification)({ subscriptionId: "s1", useRealData: true });

      expect(request()).toMatchObject({ url: "https://dev.azure.com/contoso/_apis/hooks/testnotifications?api-version=7.1&useRealData=true", method: "POST", body: { subscriptionId: "s1" } });
    });

    it("refuses a test notification with nothing to test", async () => {
      const result = await hooks(SERVICE_HOOKS_TOOLS.send_test_notification)({});

      expect(result.isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("reads and updates subscription diagnostics", async () => {
      respond("{}");

      await hooks(SERVICE_HOOKS_TOOLS.get_subscription_diagnostics)({ subscriptionId: "s1" });
      await hooks(SERVICE_HOOKS_TOOLS.update_subscription_diagnostics)({ subscriptionId: "s1", deliveryResults: true, evaluationTracing: false });

      expect(mockFetch.mock.calls[0][0]).toBe("https://dev.azure.com/contoso/_apis/hooks/subscriptions/s1/diagnostics?api-version=7.1");
      const [, init] = mockFetch.mock.calls[1] as [string, { method: string; body: string }];
      expect(init.method).toBe("PUT");
      expect(JSON.parse(init.body)).toEqual({ deliveryResults: { enabled: true }, evaluationTracing: { enabled: false } });
    });

    it("refuses a diagnostics update with nothing to change", async () => {
      const result = await hooks(SERVICE_HOOKS_TOOLS.update_subscription_diagnostics)({ subscriptionId: "s1" });

      expect(result.isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("surfaces API errors", async () => {
      respond("not found", 404);

      const result = await hooks(SERVICE_HOOKS_TOOLS.list_notifications)({ subscriptionId: "missing" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error listing notifications of subscription missing: 404: not found");
    });
  });

  describe("service connections", () => {
    const endpoints = (name: string) => handler(configureServiceEndpointTools, name);

    it("replaces an endpoint, passing a special operation", async () => {
      respond('{"id":"e1"}');
      const endpoint = { id: "e1", name: "renamed" };

      await endpoints(SERVICE_ENDPOINT_TOOLS.update_service_endpoint)({ endpointId: "e1", endpoint, operation: "ConvertAuthenticationScheme" });

      expect(request()).toMatchObject({
        url: "https://dev.azure.com/contoso/_apis/serviceendpoint/endpoints/e1?api-version=7.1&operation=ConvertAuthenticationScheme",
        method: "PUT",
        body: endpoint,
      });
    });

    it("shares an endpoint with other projects", async () => {
      respond("");

      const result = await endpoints(SERVICE_ENDPOINT_TOOLS.share_service_endpoint)({ endpointId: "e1", projects: [{ projectId: "p2", projectName: "Other", name: "shared-conn" }] });

      expect(request()).toMatchObject({
        url: "https://dev.azure.com/contoso/_apis/serviceendpoint/endpoints/e1?api-version=7.1",
        method: "PATCH",
        body: [{ name: "shared-conn", projectReference: { id: "p2", name: "Other" } }],
      });
      expect(result.content[0].text).toBe("Done.");
    });

    it("lists execution history and reports the continuation token", async () => {
      respond('{"count":1,"value":[]}', 200, { "x-ms-continuationtoken": "34" });

      const result = await endpoints(SERVICE_ENDPOINT_TOOLS.list_execution_history)({ project: "My Project", endpointId: "e1", top: 1, continuationToken: 35 });

      expect(request().url).toBe("https://dev.azure.com/contoso/My%20Project/_apis/serviceendpoint/e1/executionhistory?api-version=7.1&top=1&continuationToken=35");
      expect(result.content[0].text).toContain("pass continuationToken 34");
    });

    it("lists endpoint types filtered by type and scheme", async () => {
      respond('{"value":[]}');

      await endpoints(SERVICE_ENDPOINT_TOOLS.list_service_endpoint_types)({ type: "azurerm", scheme: "WorkloadIdentityFederation" });

      expect(request().url).toBe("https://dev.azure.com/contoso/_apis/serviceendpoint/types?api-version=7.1&type=azurerm&scheme=WorkloadIdentityFederation");
    });

    it("surfaces API errors", async () => {
      respond("denied", 403);

      const result = await endpoints(SERVICE_ENDPOINT_TOOLS.list_service_endpoint_types)({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error listing service endpoint types: 403: denied");
    });
  });

  describe("graph", () => {
    const graph = (name: string) => handler(configureGraphTools, name);
    const base = "https://vssps.dev.azure.com/contoso/_apis/graph";

    it("checks a membership and treats 404 as not a member", async () => {
      respond("{}", 404);

      const result = await graph(GRAPH_TOOLS.get_membership)({ subjectDescriptor: "aad.u", containerDescriptor: "vssgp.g" });

      expect(request().url).toBe(`${base}/memberships/aad.u/vssgp.g?api-version=7.1-preview.1`);
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe("'aad.u' is not a member of 'vssgp.g'.");
    });

    it("reads membership state, storage keys and descriptors", async () => {
      respond('{"value":"x"}');

      await graph(GRAPH_TOOLS.get_membership_state)({ subjectDescriptor: "aad.u" });
      await graph(GRAPH_TOOLS.get_storage_key)({ subjectDescriptor: "aad.u" });
      await graph(GRAPH_TOOLS.get_descriptor)({ storageKey: "guid" });
      await graph(GRAPH_TOOLS.get_service_principal)({ servicePrincipalDescriptor: "aadsp.s" });
      await graph(GRAPH_TOOLS.list_service_principals)({ continuationToken: "next" });

      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        `${base}/membershipstates/aad.u?api-version=7.1-preview.1`,
        `${base}/storagekeys/aad.u?api-version=7.1-preview.1`,
        `${base}/descriptors/guid?api-version=7.1-preview.1`,
        `${base}/serviceprincipals/aadsp.s?api-version=7.1-preview.1`,
        `${base}/serviceprincipals?api-version=7.1-preview.1&continuationToken=next`,
      ]);
    });

    it("searches users and groups by default", async () => {
      respond('{"value":[]}');

      await graph(GRAPH_TOOLS.search_subjects)({ query: "Project Coll" });

      expect(request()).toMatchObject({ url: `${base}/subjectquery?api-version=7.1-preview.1`, method: "POST", body: { query: "Project Coll", subjectKind: ["User", "Group"] } });
    });

    it("looks up several descriptors at once", async () => {
      respond('{"value":{}}');

      await graph(GRAPH_TOOLS.lookup_subjects)({ descriptors: ["aad.a", "vssgp.b"] });

      expect(request().body).toEqual({ lookupKeys: [{ descriptor: "aad.a" }, { descriptor: "vssgp.b" }] });
    });

    it("creates a new group in a scope and joins it to parent groups", async () => {
      respond('{"descriptor":"vssgp.new"}');

      await graph(GRAPH_TOOLS.create_group)({ displayName: "Release managers", description: "Approve releases", scopeDescriptor: "scp.p", groupDescriptors: ["vssgp.a", "vssgp.b"] });

      expect(request()).toMatchObject({
        url: `${base}/groups?api-version=7.1-preview.1&scopeDescriptor=scp.p&groupDescriptors=vssgp.a%2Cvssgp.b`,
        method: "POST",
        body: { displayName: "Release managers", description: "Approve releases" },
      });
    });

    it("adds an Entra group by object ID", async () => {
      respond("{}");

      await graph(GRAPH_TOOLS.create_group)({ originId: "oid" });

      expect(request().body).toEqual({ originId: "oid" });
    });

    it("refuses a group with no identity or several", async () => {
      expect((await graph(GRAPH_TOOLS.create_group)({})).isError).toBe(true);
      expect((await graph(GRAPH_TOOLS.create_group)({ displayName: "a", mailAddress: "b@c" })).isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("updates a group with a JSON patch", async () => {
      respond("{}");

      await graph(GRAPH_TOOLS.update_group)({ groupDescriptor: "vssgp.g", description: "new" });

      const sent = request();
      expect(sent).toMatchObject({ url: `${base}/groups/vssgp.g?api-version=7.1-preview.1`, method: "PATCH", body: [{ op: "replace", path: "/description", value: "new" }] });
      expect(sent.headers["Content-Type"]).toContain("application/json-patch+json");
    });

    it("refuses a group update with nothing to change", async () => {
      expect((await graph(GRAPH_TOOLS.update_group)({ groupDescriptor: "vssgp.g" })).isError).toBe(true);
    });

    it("deletes groups and disables users and service principals", async () => {
      respond("");

      await graph(GRAPH_TOOLS.delete_group)({ groupDescriptor: "vssgp.g" });
      await graph(GRAPH_TOOLS.delete_user)({ userDescriptor: "aad.u" });
      const result = await graph(GRAPH_TOOLS.delete_service_principal)({ servicePrincipalDescriptor: "aadsp.s" });

      expect(mockFetch.mock.calls.map(([url, init]) => `${(init as { method: string }).method} ${url}`)).toEqual([
        `DELETE ${base}/groups/vssgp.g?api-version=7.1-preview.1`,
        `DELETE ${base}/users/aad.u?api-version=7.1-preview.1`,
        `DELETE ${base}/serviceprincipals/aadsp.s?api-version=7.1-preview.1`,
      ]);
      expect(result.content[0].text).toBe("Done.");
    });

    it("adds a user by principal name into groups", async () => {
      respond("{}");

      await graph(GRAPH_TOOLS.add_user)({ principalName: "jane@contoso.com", groupDescriptors: ["vssgp.g"] });

      expect(request()).toMatchObject({ url: `${base}/users?api-version=7.1-preview.1&groupDescriptors=vssgp.g`, method: "POST", body: { principalName: "jane@contoso.com" } });
    });

    it("adds users by e-mail or object ID and refuses ambiguous input", async () => {
      respond("{}");

      await graph(GRAPH_TOOLS.add_user)({ mailAddress: "jane@contoso.com" });
      await graph(GRAPH_TOOLS.add_user)({ originId: "oid" });
      const ambiguous = await graph(GRAPH_TOOLS.add_user)({ principalName: "a", originId: "b" });

      expect(mockFetch.mock.calls.map(([, init]) => JSON.parse((init as { body: string }).body))).toEqual([{ mailAddress: "jane@contoso.com" }, { originId: "oid" }]);
      expect(ambiguous.isError).toBe(true);
    });

    it("adds a service principal by object ID", async () => {
      respond("{}");

      await graph(GRAPH_TOOLS.add_service_principal)({ originId: "oid" });

      expect(request()).toMatchObject({ url: `${base}/serviceprincipals?api-version=7.1-preview.1`, method: "POST", body: { originId: "oid" } });
    });

    it("surfaces API errors", async () => {
      mockFetch.mockRejectedValue(new Error("network down"));

      const result = await graph(GRAPH_TOOLS.get_membership_state)({ subjectDescriptor: "aad.u" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error getting membership state of aad.u: network down");
    });
  });
});

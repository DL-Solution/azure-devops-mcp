// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { adoFetch, subdomainBaseUrl } from "../shared/ado-rest.js";

const GRAPH_TOOLS = {
  list_users: "graph_list_users",
  get_user: "graph_get_user",
  list_groups: "graph_list_groups",
  get_group: "graph_get_group",
  list_memberships: "graph_list_memberships",
  add_membership: "graph_add_membership",
  remove_membership: "graph_remove_membership",
  get_membership: "graph_get_membership",
  get_membership_state: "graph_get_membership_state",
  search_subjects: "graph_search_subjects",
  lookup_subjects: "graph_lookup_subjects",
  get_storage_key: "graph_get_storage_key",
  get_descriptor: "graph_get_descriptor",
  create_group: "graph_create_group",
  update_group: "graph_update_group",
  delete_group: "graph_delete_group",
  add_user: "graph_add_user",
  delete_user: "graph_delete_user",
  list_service_principals: "graph_list_service_principals",
  get_service_principal: "graph_get_service_principal",
  add_service_principal: "graph_add_service_principal",
  delete_service_principal: "graph_delete_service_principal",
};

const graphApiVersion = "7.1-preview.1";

function configureGraphTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  async function request(method: string, pathAndQuery: string, body?: unknown): Promise<Response> {
    const connection = await connectionProvider();
    const token = await tokenProvider();
    const baseUrl = subdomainBaseUrl(connection.serverUrl, "vssps");
    return adoFetch({ url: `${baseUrl}/_apis/graph/${pathAndQuery}`, method, token, userAgent: userAgentProvider(), body });
  }

  registerTool(
    server,
    GRAPH_TOOLS.list_users,
    "List users in the organization via the Graph API. Results are paged; pass the continuationToken from a prior response to get the next page.",
    {
      subjectTypes: z.string().optional().describe("Comma-separated subject types to filter by, e.g. 'aad,msa,svc'."),
      continuationToken: z.string().optional().describe("Continuation token from a previous response to fetch the next page."),
    },
    async ({ subjectTypes, continuationToken }) => {
      try {
        const params = new URLSearchParams({ "api-version": graphApiVersion });
        if (subjectTypes) params.append("subjectTypes", subjectTypes);
        if (continuationToken) params.append("continuationToken", continuationToken);

        const response = await request("GET", `users?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list users (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing users: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.get_user,
    "Get a single user by their Graph subject descriptor.",
    {
      userDescriptor: z.string().describe("The Graph subject descriptor of the user (e.g. 'aad.xxxxx')."),
    },
    async ({ userDescriptor }) => {
      try {
        const response = await request("GET", `users/${encodeURIComponent(userDescriptor)}?api-version=${graphApiVersion}`);
        if (response.status === 404) {
          return { content: [{ type: "text", text: `User '${userDescriptor}' not found` }], isError: true };
        }
        if (!response.ok) {
          throw new Error(`Failed to get user (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching user: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.list_groups,
    "List groups in the organization via the Graph API. Results are paged; pass the continuationToken from a prior response to get the next page.",
    {
      scopeDescriptor: z.string().optional().describe("Limit to groups within this scope descriptor (e.g. a project's scope)."),
      continuationToken: z.string().optional().describe("Continuation token from a previous response to fetch the next page."),
    },
    async ({ scopeDescriptor, continuationToken }) => {
      try {
        const params = new URLSearchParams({ "api-version": graphApiVersion });
        if (scopeDescriptor) params.append("scopeDescriptor", scopeDescriptor);
        if (continuationToken) params.append("continuationToken", continuationToken);

        const response = await request("GET", `groups?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list groups (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing groups: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.get_group,
    "Get a single group by its Graph subject descriptor.",
    {
      groupDescriptor: z.string().describe("The Graph subject descriptor of the group (e.g. 'vssgp.xxxxx')."),
    },
    async ({ groupDescriptor }) => {
      try {
        const response = await request("GET", `groups/${encodeURIComponent(groupDescriptor)}?api-version=${graphApiVersion}`);
        if (response.status === 404) {
          return { content: [{ type: "text", text: `Group '${groupDescriptor}' not found` }], isError: true };
        }
        if (!response.ok) {
          throw new Error(`Failed to get group (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error fetching group: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.list_memberships,
    "List the memberships of a subject (user or group). Use direction 'up' to list the groups the subject belongs to, or 'down' to list the members of a group.",
    {
      subjectDescriptor: z.string().describe("The Graph subject descriptor of the user or group."),
      direction: z.enum(["up", "down"]).optional().default("up").describe("'up' = groups this subject belongs to; 'down' = members of this (group) subject. Defaults to 'up'."),
    },
    async ({ subjectDescriptor, direction = "up" }) => {
      try {
        const params = new URLSearchParams({ "api-version": graphApiVersion, direction });
        const response = await request("GET", `memberships/${encodeURIComponent(subjectDescriptor)}?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to list memberships (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error listing memberships: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.add_membership,
    "Add a membership: make the subject (user or group) a member of the container group.",
    {
      subjectDescriptor: z.string().describe("The Graph subject descriptor of the member to add (user or group)."),
      containerDescriptor: z.string().describe("The Graph subject descriptor of the group to add the member to."),
    },
    async ({ subjectDescriptor, containerDescriptor }) => {
      try {
        const response = await request("PUT", `memberships/${encodeURIComponent(subjectDescriptor)}/${encodeURIComponent(containerDescriptor)}?api-version=${graphApiVersion}`);
        if (!response.ok) {
          throw new Error(`Failed to add membership (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: await response.text() }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error adding membership: ${errorMessage}` }], isError: true };
      }
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.remove_membership,
    "Remove a membership: remove the subject (user or group) from the container group. This is a destructive operation.",
    {
      subjectDescriptor: z.string().describe("The Graph subject descriptor of the member to remove (user or group)."),
      containerDescriptor: z.string().describe("The Graph subject descriptor of the group to remove the member from."),
    },
    async ({ subjectDescriptor, containerDescriptor }) => {
      try {
        const response = await request("DELETE", `memberships/${encodeURIComponent(subjectDescriptor)}/${encodeURIComponent(containerDescriptor)}?api-version=${graphApiVersion}`);
        if (!response.ok) {
          throw new Error(`Failed to remove membership (${response.status}): ${await response.text()}`);
        }

        return { content: [{ type: "text", text: `Membership removed: '${subjectDescriptor}' from '${containerDescriptor}'.` }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { content: [{ type: "text", text: `Error removing membership: ${errorMessage}` }], isError: true };
      }
    }
  );

  async function call(action: string, method: string, pathAndQuery: string, body?: unknown, options: { contentType?: string; notFound?: string } = {}) {
    try {
      const connection = await connectionProvider();
      const token = await tokenProvider();
      const baseUrl = subdomainBaseUrl(connection.serverUrl, "vssps");
      const response = await adoFetch({ url: `${baseUrl}/${pathAndQuery}`, method, token, userAgent: userAgentProvider(), body, contentType: options.contentType });
      const text = await response.text();
      if (response.status === 404 && options.notFound) {
        return { content: [{ type: "text" as const, text: options.notFound }] };
      }
      if (!response.ok) {
        throw new Error(`${response.status}: ${text}`);
      }
      return { content: [{ type: "text" as const, text: text || "Done." }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Error ${action}: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }

  function query(path: string, values: Record<string, string | undefined> = {}): string {
    const params = new URLSearchParams({ "api-version": graphApiVersion });
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) params.append(key, value);
    }
    return [path, params.toString()].join("?");
  }

  const subjectDescriptorParam = z.string().describe("The Graph subject descriptor of the user, group or service principal.");
  const groupDescriptorsParam = z.array(z.string()).optional().describe("Descriptors of groups the new subject should join.");
  const joined = (values: string[] | undefined) => (values?.length ? values.join(",") : undefined);

  registerTool(
    server,
    GRAPH_TOOLS.get_membership,
    "Check whether a subject belongs to a group, directly or through a nested group.",
    {
      subjectDescriptor: subjectDescriptorParam,
      containerDescriptor: z.string().describe("The Graph subject descriptor of the group."),
    },
    async ({ subjectDescriptor, containerDescriptor }) =>
      call("getting membership", "GET", query(`_apis/graph/memberships/${encodeURIComponent(subjectDescriptor)}/${encodeURIComponent(containerDescriptor)}`), undefined, {
        notFound: `'${subjectDescriptor}' is not a member of '${containerDescriptor}'.`,
      })
  );

  registerTool(
    server,
    GRAPH_TOOLS.get_membership_state,
    "Check whether a subject is active in the organization. A disabled user or service principal stays visible but is inactive.",
    {
      subjectDescriptor: subjectDescriptorParam,
    },
    async ({ subjectDescriptor }) => call(`getting membership state of ${subjectDescriptor}`, "GET", query(`_apis/graph/membershipstates/${encodeURIComponent(subjectDescriptor)}`))
  );

  registerTool(
    server,
    GRAPH_TOOLS.search_subjects,
    "Find users, groups or service principals whose name starts with the search term (prefix match on display name, e-mail or account name). Returns at most 100 subjects with their descriptors.",
    {
      query: z.string().min(1).describe("The start of the name, e-mail or account name."),
      subjectKinds: z
        .array(z.enum(["User", "Group", "ServicePrincipal"]))
        .optional()
        .describe("Only these kinds of subject. Searches users and groups when omitted."),
      scopeDescriptor: z.string().optional().describe("Search within this scope (e.g. a project's scope descriptor) instead of the organization."),
    },
    async ({ query: term, subjectKinds, scopeDescriptor }) =>
      call("searching subjects", "POST", query("_apis/graph/subjectquery"), { query: term, subjectKind: subjectKinds?.length ? subjectKinds : ["User", "Group"], scopeDescriptor })
  );

  registerTool(
    server,
    GRAPH_TOOLS.lookup_subjects,
    "Resolve several subject descriptors to their users, groups or service principals in one call, e.g. the member descriptors returned by graph_list_memberships.",
    {
      descriptors: z.array(z.string()).min(1).describe("The subject descriptors to resolve."),
    },
    async ({ descriptors }) => call("looking up subjects", "POST", query("_apis/graph/subjectlookup"), { lookupKeys: descriptors.map((descriptor) => ({ descriptor })) })
  );

  registerTool(
    server,
    GRAPH_TOOLS.get_storage_key,
    "Get the storage key of a subject: the GUID other APIs use for the same identity, e.g. the user ID in member entitlements or the identity ID in security ACLs.",
    {
      subjectDescriptor: subjectDescriptorParam,
    },
    async ({ subjectDescriptor }) => call(`getting storage key of ${subjectDescriptor}`, "GET", query(`_apis/graph/storagekeys/${encodeURIComponent(subjectDescriptor)}`))
  );

  registerTool(
    server,
    GRAPH_TOOLS.get_descriptor,
    "Get the Graph subject descriptor for a storage key (identity GUID) — the reverse of graph_get_storage_key.",
    {
      storageKey: z.string().describe("The storage key (GUID) of the identity."),
    },
    async ({ storageKey }) => call(`getting descriptor of ${storageKey}`, "GET", query(`_apis/graph/descriptors/${encodeURIComponent(storageKey)}`))
  );

  registerTool(
    server,
    GRAPH_TOOLS.create_group,
    "Create an Azure DevOps group, or add an existing Entra ID (AAD) group to the organization. Give displayName for a new group, or originId (the Entra object ID) or mailAddress for an Entra group. Without scopeDescriptor a new group is created at organization level.",
    {
      displayName: z.string().optional().describe("The name of a new Azure DevOps group."),
      description: z.string().optional().describe("The description of a new Azure DevOps group."),
      originId: z.string().optional().describe("The object ID of an existing Entra ID group to add."),
      mailAddress: z.string().optional().describe("The e-mail address of an existing Entra ID group to add."),
      scopeDescriptor: z.string().optional().describe("The scope to create the group in, e.g. a project's scope descriptor."),
      groupDescriptors: groupDescriptorsParam,
    },
    async ({ displayName, description, originId, mailAddress, scopeDescriptor, groupDescriptors }) => {
      const given = [displayName, originId, mailAddress].filter((value) => value !== undefined).length;
      if (given !== 1) {
        return { content: [{ type: "text", text: "Give exactly one of displayName, originId or mailAddress." }], isError: true };
      }
      const body = displayName !== undefined ? { displayName, description } : originId !== undefined ? { originId } : { mailAddress };
      return call("creating group", "POST", query("_apis/graph/groups", { scopeDescriptor, groupDescriptors: joined(groupDescriptors) }), body);
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.update_group,
    "Change the name or description of an Azure DevOps group.",
    {
      groupDescriptor: z.string().describe("The Graph subject descriptor of the group."),
      displayName: z.string().optional().describe("The new name."),
      description: z.string().optional().describe("The new description."),
    },
    async ({ groupDescriptor, displayName, description }) => {
      const operations = [
        ...(displayName !== undefined ? [{ op: "replace", path: "/displayName", value: displayName }] : []),
        ...(description !== undefined ? [{ op: "replace", path: "/description", value: description }] : []),
      ];
      if (!operations.length) {
        return { content: [{ type: "text", text: "Nothing to change: give displayName, description or both." }], isError: true };
      }
      return call(`updating group ${groupDescriptor}`, "PATCH", query(`_apis/graph/groups/${encodeURIComponent(groupDescriptor)}`), operations, { contentType: "application/json-patch+json" });
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.delete_group,
    "Delete an Azure DevOps group: it is removed from all of its parent groups, and its members lose the access it granted.",
    {
      groupDescriptor: z.string().describe("The Graph subject descriptor of the group."),
    },
    async ({ groupDescriptor }) => call(`deleting group ${groupDescriptor}`, "DELETE", query(`_apis/graph/groups/${encodeURIComponent(groupDescriptor)}`))
  );

  registerTool(
    server,
    GRAPH_TOOLS.add_user,
    "Add an existing Entra ID (AAD) or Microsoft account user to the organization by principal name, e-mail or Entra object ID. A user previously removed is restored. The user is not active until they join a group (groupDescriptors) or sign in with a license; member entitlement tools add a user with an access level instead.",
    {
      principalName: z.string().optional().describe("The user principal name (UPN), e.g. 'jane@contoso.com'."),
      mailAddress: z.string().optional().describe("The user's e-mail address."),
      originId: z.string().optional().describe("The user's Entra ID object ID."),
      groupDescriptors: groupDescriptorsParam,
    },
    async ({ principalName, mailAddress, originId, groupDescriptors }) => {
      const given = [principalName, mailAddress, originId].filter((value) => value !== undefined).length;
      if (given !== 1) {
        return { content: [{ type: "text", text: "Give exactly one of principalName, mailAddress or originId." }], isError: true };
      }
      const body = principalName !== undefined ? { principalName } : mailAddress !== undefined ? { mailAddress } : { originId };
      return call("adding user", "POST", query("_apis/graph/users", { groupDescriptors: joined(groupDescriptors) }), body);
    }
  );

  registerTool(
    server,
    GRAPH_TOOLS.delete_user,
    "Disable a user in the organization. The user stays visible, but membership checks for them return false, so they lose access.",
    {
      userDescriptor: z.string().describe("The Graph subject descriptor of the user."),
    },
    async ({ userDescriptor }) => call(`disabling user ${userDescriptor}`, "DELETE", query(`_apis/graph/users/${encodeURIComponent(userDescriptor)}`))
  );

  registerTool(
    server,
    GRAPH_TOOLS.list_service_principals,
    "List the service principals and managed identities added to the organization. Results are paged; pass the continuationToken from a prior response to get the next page.",
    {
      scopeDescriptor: z.string().optional().describe("Limit to this scope, e.g. a project's scope descriptor."),
      continuationToken: z.string().optional().describe("Continuation token from a previous response to fetch the next page."),
    },
    async ({ scopeDescriptor, continuationToken }) => call("listing service principals", "GET", query("_apis/graph/serviceprincipals", { scopeDescriptor, continuationToken }))
  );

  registerTool(
    server,
    GRAPH_TOOLS.get_service_principal,
    "Get a service principal or managed identity by its Graph subject descriptor.",
    {
      servicePrincipalDescriptor: z.string().describe("The Graph subject descriptor of the service principal (e.g. 'aadsp.xxxxx')."),
    },
    async ({ servicePrincipalDescriptor }) =>
      call(`getting service principal ${servicePrincipalDescriptor}`, "GET", query(`_apis/graph/serviceprincipals/${encodeURIComponent(servicePrincipalDescriptor)}`))
  );

  registerTool(
    server,
    GRAPH_TOOLS.add_service_principal,
    "Add an existing Entra ID service principal or managed identity to the organization by its object ID, so it can be put in groups and call Azure DevOps. A previously removed one is restored. It is not active until it joins a group.",
    {
      originId: z.string().describe("The object ID of the service principal in Entra ID (not its application ID)."),
      groupDescriptors: groupDescriptorsParam,
    },
    async ({ originId, groupDescriptors }) => call("adding service principal", "POST", query("_apis/graph/serviceprincipals", { groupDescriptors: joined(groupDescriptors) }), { originId })
  );

  registerTool(
    server,
    GRAPH_TOOLS.delete_service_principal,
    "Disable a service principal in the organization. It stays visible, but membership checks for it return false, so it loses access.",
    {
      servicePrincipalDescriptor: z.string().describe("The Graph subject descriptor of the service principal."),
    },
    async ({ servicePrincipalDescriptor }) =>
      call(`disabling service principal ${servicePrincipalDescriptor}`, "DELETE", query(`_apis/graph/serviceprincipals/${encodeURIComponent(servicePrincipalDescriptor)}`))
  );
}

export { GRAPH_TOOLS, configureGraphTools };

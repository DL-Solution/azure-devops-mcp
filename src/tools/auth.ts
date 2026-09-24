// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { WebApi } from "azure-devops-node-api";
import { apiVersion } from "../utils.js";
import { IdentityBase } from "azure-devops-node-api/interfaces/IdentitiesInterfaces.js";

interface IdentitiesResponse {
  value: IdentityBase[];
}

async function getCurrentUserDetails(tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  const connection = await connectionProvider();
  const url = `${connection.serverUrl}/_apis/connectionData`;
  const token = await tokenProvider();
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": userAgentProvider(),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Error fetching user details: ${data.message}`);
  }
  return data;
}

async function fetchVssps<T>(url: string, token: string, userAgent: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": userAgent,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

/**
 * Searches for identities using Azure DevOps Identity API.
 *
 * The identities search matches only a whole sign-in name or email, so a display
 * name found nothing there. When it comes back empty, the graph subject query —
 * which matches the beginning of a display name, alias or email — finds the
 * subjects, and their descriptors are resolved back to identities.
 */
async function searchIdentities(identity: string, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string): Promise<IdentitiesResponse> {
  const token = await tokenProvider();
  const connection = await connectionProvider();
  const orgName = connection.serverUrl.split("/")[3];
  const baseUrl = `https://vssps.dev.azure.com/${orgName}/_apis`;

  const params = new URLSearchParams({
    "api-version": apiVersion,
    "searchFilter": "General",
    "filterValue": identity,
  });
  const found = await fetchVssps<IdentitiesResponse>(`${baseUrl}/identities?${params}`, token, userAgentProvider());
  if (found?.value?.length) {
    return found;
  }

  const subjects = await fetchVssps<{ value: { descriptor?: string }[] | null }>(`${baseUrl}/graph/subjectquery?api-version=7.1-preview.1`, token, userAgentProvider(), {
    query: identity,
    subjectKind: ["User", "Group"],
  });
  const descriptors = (subjects?.value ?? []).map((subject) => subject.descriptor).filter((descriptor): descriptor is string => Boolean(descriptor));
  if (descriptors.length === 0) {
    return { value: [] };
  }

  const byDescriptor = new URLSearchParams({ "api-version": apiVersion, "subjectDescriptors": descriptors.join(",") });
  return fetchVssps<IdentitiesResponse>(`${baseUrl}/identities?${byDescriptor}`, token, userAgentProvider());
}

/**
 * Gets the user ID from email or unique name using Azure DevOps Identity API
 */
async function getUserIdentityFromEmail(
  userEmail: string,
  tokenProvider: () => Promise<string>,
  connectionProvider: () => Promise<WebApi>,
  userAgentProvider: () => string
): Promise<{ id: string; displayName: string }> {
  const identities = await searchIdentities(userEmail, tokenProvider, connectionProvider, userAgentProvider);

  if (!identities || identities.value?.length === 0) {
    throw new Error(`No user found with email/unique name: ${userEmail}`);
  }

  const firstIdentity = identities.value[0];
  if (!firstIdentity.id) {
    throw new Error(`No ID found for user with email/unique name: ${userEmail}`);
  }

  return { id: firstIdentity.id, displayName: firstIdentity.providerDisplayName ?? userEmail };
}

async function getUserIdFromEmail(userEmail: string, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string): Promise<string> {
  const identity = await getUserIdentityFromEmail(userEmail, tokenProvider, connectionProvider, userAgentProvider);
  return identity.id;
}

export { getCurrentUserDetails, getUserIdFromEmail, getUserIdentityFromEmail, searchIdentities };

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// repo_list_pull_requests_by_org lives apart from repositories.test.ts, which is
// already ~9k lines built around a git API mock; this tool calls the collection
// level REST route instead, so it needs a different connection double.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { configureRepoTools, REPO_TOOLS } from "../../../src/tools/repositories";
import { getCurrentUserDetails, getUserIdFromEmail } from "../../../src/tools/auth";
import { createToolServer } from "../../mocks/tool-server";

jest.mock("../../../src/tools/auth", () => ({
  getCurrentUserDetails: jest.fn(),
  getUserIdFromEmail: jest.fn(),
}));

const mockGetCurrentUserDetails = getCurrentUserDetails as jest.MockedFunction<typeof getCurrentUserDetails>;
const mockGetUserIdFromEmail = getUserIdFromEmail as jest.MockedFunction<typeof getUserIdFromEmail>;

type Handler = (params: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

describe("repo_list_pull_requests_by_org", () => {
  let server: McpServer;
  let restGet: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  let handler: Handler;

  const defaults = { top: 100, skip: 0, created_by_me: false, i_am_reviewer: false, status: "Active" };

  /** The query string the tool sent, as a plain object. */
  const sentQuery = () => Object.fromEntries(new URL(restGet.mock.calls[0][0] as string).searchParams);

  beforeEach(() => {
    server = createToolServer();
    restGet = jest.fn().mockResolvedValue({ result: { value: [] } });
    const connectionProvider = jest.fn().mockResolvedValue({
      serverUrl: "https://dev.azure.com/contoso/",
      rest: { get: restGet },
      getGitApi: jest.fn(),
    }) as unknown as jest.MockedFunction<() => Promise<WebApi>>;
    const tokenProvider = jest.fn().mockResolvedValue("token");

    configureRepoTools(server, tokenProvider, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === REPO_TOOLS.list_pull_requests_by_org);
    if (!call) throw new Error("repo_list_pull_requests_by_org tool not registered");
    handler = call[3];

    mockGetCurrentUserDetails.mockResolvedValue({
      authenticatedUser: { id: "user123", uniqueName: "testuser@example.com", displayName: "Test User" },
    } as never);
  });

  it("queries the collection level route with paging and status", async () => {
    await handler({ ...defaults, top: 25, skip: 50, status: "Completed" });

    const url = new URL(restGet.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://dev.azure.com/contoso/_apis/git/pullrequests");
    expect(sentQuery()).toEqual({ "api-version": "7.1", "$top": "25", "$skip": "50", "searchCriteria.status": "3" });
    expect(restGet.mock.calls[0][1]).toEqual({ deserializeDates: true });
  });

  it("filters by the current user as creator and as reviewer", async () => {
    await handler({ ...defaults, created_by_me: true, i_am_reviewer: true });

    expect(sentQuery()).toMatchObject({ "searchCriteria.creatorId": "user123", "searchCriteria.reviewerId": "user123" });
  });

  it("prefers a named user over the 'me' flags and resolves both by email", async () => {
    mockGetUserIdFromEmail.mockResolvedValueOnce("creator-id").mockResolvedValueOnce("reviewer-id");

    await handler({ ...defaults, created_by_me: true, created_by_user: "ann@example.com", i_am_reviewer: true, user_is_reviewer: "bob@example.com" });

    expect(sentQuery()).toMatchObject({ "searchCriteria.creatorId": "creator-id", "searchCriteria.reviewerId": "reviewer-id" });
    expect(mockGetCurrentUserDetails).not.toHaveBeenCalled();
  });

  it("passes branch filters through", async () => {
    await handler({ ...defaults, sourceRefName: "refs/heads/feature", targetRefName: "refs/heads/main" });

    expect(sentQuery()).toMatchObject({ "searchCriteria.sourceRefName": "refs/heads/feature", "searchCriteria.targetRefName": "refs/heads/main" });
  });

  it("returns trimmed pull requests carrying the ids of their repository and project", async () => {
    restGet.mockResolvedValue({
      result: {
        value: [
          {
            pullRequestId: 7,
            status: 1,
            title: "Add a thing",
            createdBy: { displayName: "Test User", uniqueName: "testuser@example.com" },
            repository: { id: "repo-guid", name: "web", project: { id: "project-guid", name: "Contoso" } },
            sourceRefName: "refs/heads/feature",
            targetRefName: "refs/heads/main",
            url: "https://dev.azure.com/contoso/_apis/git/repositories/repo-guid/pullRequests/7",
          },
        ],
      },
    });

    const result = await handler({ ...defaults });

    expect(JSON.parse(result.content[0].text)).toEqual([
      expect.objectContaining({
        pullRequestId: 7,
        statusName: "Active",
        title: "Add a thing",
        repository: "web",
        repositoryId: "repo-guid",
        project: "Contoso",
        projectId: "project-guid",
        url: "https://dev.azure.com/contoso/_apis/git/repositories/repo-guid/pullRequests/7",
      }),
    ]);
  });

  it("returns an empty list when the organization has no matching pull requests", async () => {
    restGet.mockResolvedValue({ result: undefined });

    const result = await handler({ ...defaults });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });

  it("reports an email that does not resolve to a user", async () => {
    mockGetUserIdFromEmail.mockRejectedValue(new Error("User not found"));

    const result = await handler({ ...defaults, created_by_user: "nobody@example.com" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error resolving the user filter: User not found");
    expect(restGet).not.toHaveBeenCalled();
  });

  it("reports a failing request", async () => {
    restGet.mockRejectedValue(new Error("TF401019"));

    const result = await handler({ ...defaults });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error listing organization pull requests: TF401019");
  });
});

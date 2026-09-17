// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Tags, commit statuses, repository lifecycle, pull request labels and statuses,
// cherry-picks, reverts and branch locks.
// These live apart from repositories.test.ts, which is already ~9k lines of
// pull-request cases built around its own mock shape.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { GitAsyncOperationStatus, GitAsyncRefOperationFailureStatus, GitStatusState, GitVersionType } from "azure-devops-node-api/interfaces/GitInterfaces.js";

jest.mock("../../../src/tools/auth", () => ({
  getCurrentUserDetails: jest.fn(),
  getUserIdFromEmail: jest.fn(),
}));

import { configureRepoTools, REPO_TOOLS } from "../../../src/tools/repositories";
import { createToolServer } from "../../mocks/tool-server";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const DELETED = "0".repeat(40);

describe("repo git tools", () => {
  let server: McpServer;
  let gitApi: Record<string, jest.Mock>;
  let coreApi: Record<string, jest.Mock>;
  let connectionProvider: () => Promise<WebApi>;

  beforeEach(() => {
    server = createToolServer() as unknown as McpServer;
    gitApi = {
      getRefs: jest.fn(),
      updateRefs: jest.fn(),
      getAnnotatedTag: jest.fn(),
      createAnnotatedTag: jest.fn(),
      getStatuses: jest.fn(),
      createCommitStatus: jest.fn(),
      createRepository: jest.fn(),
      deleteRepository: jest.fn(),
      getPullRequestLabels: jest.fn(),
      createPullRequestLabel: jest.fn(),
      deletePullRequestLabels: jest.fn(),
      createCherryPick: jest.fn(),
      getCherryPick: jest.fn(),
      createRevert: jest.fn(),
      getRevert: jest.fn(),
      getPullRequestStatuses: jest.fn(),
      getPullRequestIterationStatuses: jest.fn(),
      createPullRequestStatus: jest.fn(),
      deletePullRequestStatus: jest.fn(),
      getRecycleBinRepositories: jest.fn(),
      restoreRepositoryFromRecycleBin: jest.fn(),
      updateRef: jest.fn(),
      getCommit: jest.fn(),
      getChanges: jest.fn(),
      getCommitDiffs: jest.fn(),
      getMergeBases: jest.fn(),
      getPushes: jest.fn(),
      getPush: jest.fn(),
      getBranch: jest.fn(),
      getBranches: jest.fn(),
      getSuggestions: jest.fn(),
      getPullRequestCommits: jest.fn(),
      getPullRequestIterationCommits: jest.fn(),
      getPullRequestWorkItemRefs: jest.fn(),
      deleteComment: jest.fn(),
      getLikes: jest.fn(),
      createLike: jest.fn(),
      deleteLike: jest.fn(),
      updateRepository: jest.fn(),
      deleteRepositoryFromRecycleBin: jest.fn(),
      createImportRequest: jest.fn(),
      queryImportRequests: jest.fn(),
      getImportRequest: jest.fn(),
      updateImportRequest: jest.fn(),
      getForks: jest.fn(),
      createForkSyncRequest: jest.fn(),
      getForkSyncRequests: jest.fn(),
      getForkSyncRequest: jest.fn(),
    };
    coreApi = { getProjectCollections: jest.fn() };
    connectionProvider = jest.fn().mockResolvedValue({
      getGitApi: jest.fn().mockResolvedValue(gitApi),
      getCoreApi: jest.fn().mockResolvedValue(coreApi),
    } as unknown as WebApi) as () => Promise<WebApi>;
  });

  function handlerFor(toolName: string): Handler {
    configureRepoTools(server, jest.fn() as () => Promise<string>, connectionProvider, () => "Jest");
    const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === toolName);
    if (!call) throw new Error(`${toolName} not registered`);
    return call[3] as Handler;
  }

  const parsed = (result: { content: { text: string }[] }) => JSON.parse(result.content[0].text);

  it("registers every git tool", () => {
    configureRepoTools(server, jest.fn() as () => Promise<string>, connectionProvider, () => "Jest");
    const names = (server.tool as jest.Mock).mock.calls.map(([name]) => name);
    expect(names).toEqual(
      expect.arrayContaining([
        REPO_TOOLS.list_tags,
        REPO_TOOLS.get_tag,
        REPO_TOOLS.create_tag,
        REPO_TOOLS.delete_tag,
        REPO_TOOLS.list_commit_statuses,
        REPO_TOOLS.create_commit_status,
        REPO_TOOLS.create_repository,
        REPO_TOOLS.delete_repository,
        REPO_TOOLS.list_pull_request_labels,
        REPO_TOOLS.add_pull_request_label,
        REPO_TOOLS.remove_pull_request_label,
        REPO_TOOLS.cherry_pick,
        REPO_TOOLS.get_cherry_pick,
        REPO_TOOLS.revert,
        REPO_TOOLS.get_revert,
        REPO_TOOLS.list_pull_request_statuses,
        REPO_TOOLS.create_pull_request_status,
        REPO_TOOLS.delete_pull_request_status,
        REPO_TOOLS.list_deleted_repositories,
        REPO_TOOLS.restore_repository,
        REPO_TOOLS.lock_branch,
        REPO_TOOLS.unlock_branch,
      ])
    );
  });

  describe("repo_list_tags", () => {
    it("asks for the tags filter and strips the refs/tags/ prefix", async () => {
      gitApi.getRefs.mockResolvedValue([{ name: "refs/tags/v1.0.0", objectId: "tag-sha", peeledObjectId: "commit-sha" }]);

      const result = await handlerFor(REPO_TOOLS.list_tags)({ repositoryId: "repo", project: "Contoso", peelTags: true });

      expect(gitApi.getRefs).toHaveBeenCalledWith("repo", "Contoso", "tags/", false, false, undefined, false, true, undefined);
      expect(parsed(result)).toEqual([{ name: "v1.0.0", objectId: "tag-sha", peeledObjectId: "commit-sha" }]);
    });

    it("passes a name filter through", async () => {
      gitApi.getRefs.mockResolvedValue([]);

      await handlerFor(REPO_TOOLS.list_tags)({ repositoryId: "repo", project: "Contoso", nameFilter: "v1.", peelTags: false });

      expect(gitApi.getRefs).toHaveBeenCalledWith("repo", "Contoso", "tags/", false, false, undefined, false, false, "v1.");
    });

    it("surfaces an API failure as an error result", async () => {
      gitApi.getRefs.mockRejectedValue(new Error("TF401019"));

      const result = await handlerFor(REPO_TOOLS.list_tags)({ repositoryId: "repo", project: "Contoso", peelTags: false });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("TF401019");
    });
  });

  describe("repo_get_tag", () => {
    it("reports an annotated tag with its message", async () => {
      gitApi.getRefs.mockResolvedValue([{ name: "refs/tags/v2.0.0", objectId: "tag-sha", peeledObjectId: "commit-sha" }]);
      gitApi.getAnnotatedTag.mockResolvedValue({ message: "release", taggedBy: { name: "Ada" } });

      const result = await handlerFor(REPO_TOOLS.get_tag)({ repositoryId: "repo", project: "Contoso", tagName: "v2.0.0" });

      expect(gitApi.getAnnotatedTag).toHaveBeenCalledWith("Contoso", "repo", "tag-sha");
      expect(parsed(result)).toMatchObject({ name: "v2.0.0", commitId: "commit-sha", annotated: true, message: "release" });
    });

    // A lightweight tag points straight at the commit, so there is no tag
    // object and the annotated lookup fails — that is not an error.
    it("reports a lightweight tag as not annotated", async () => {
      gitApi.getRefs.mockResolvedValue([{ name: "refs/tags/nightly", objectId: "commit-sha" }]);
      gitApi.getAnnotatedTag.mockRejectedValue(new Error("not found"));

      const result = await handlerFor(REPO_TOOLS.get_tag)({ repositoryId: "repo", project: "Contoso", tagName: "nightly" });

      expect(result.isError).toBeUndefined();
      expect(parsed(result)).toMatchObject({ name: "nightly", commitId: "commit-sha", annotated: false });
    });

    it("errors when no tag of that exact name exists", async () => {
      gitApi.getRefs.mockResolvedValue([{ name: "refs/tags/v2.0.0-rc1", objectId: "x" }]);

      const result = await handlerFor(REPO_TOOLS.get_tag)({ repositoryId: "repo", project: "Contoso", tagName: "v2.0.0" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("repo_create_tag", () => {
    it("creates the annotated tag on the given commit", async () => {
      gitApi.createAnnotatedTag.mockResolvedValue({ name: "v1.4.0", objectId: "new-tag" });

      const result = await handlerFor(REPO_TOOLS.create_tag)({ repositoryId: "repo", project: "Contoso", tagName: "v1.4.0", commitId: "abc123", message: "ship it" });

      expect(gitApi.createAnnotatedTag).toHaveBeenCalledWith({ name: "v1.4.0", message: "ship it", taggedObject: { objectId: "abc123" } }, "Contoso", "repo");
      expect(parsed(result)).toMatchObject({ name: "v1.4.0" });
    });

    it("surfaces a rejected tag name", async () => {
      gitApi.createAnnotatedTag.mockRejectedValue(new Error("tag already exists"));

      const result = await handlerFor(REPO_TOOLS.create_tag)({ repositoryId: "repo", project: "Contoso", tagName: "v1.4.0", commitId: "abc", message: "m" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("tag already exists");
    });
  });

  describe("repo_delete_tag", () => {
    it("updates the ref to the all-zero object id", async () => {
      gitApi.getRefs.mockResolvedValue([{ name: "refs/tags/old", objectId: "sha-1" }]);
      gitApi.updateRefs.mockResolvedValue([{ success: true }]);

      const result = await handlerFor(REPO_TOOLS.delete_tag)({ repositoryId: "repo", project: "Contoso", tagName: "old" });

      expect(gitApi.updateRefs).toHaveBeenCalledWith([{ name: "refs/tags/old", oldObjectId: "sha-1", newObjectId: DELETED }], "repo", "Contoso");
      expect(parsed(result)).toEqual({ deleted: "old", previousObjectId: "sha-1" });
    });

    // updateRefs reports per-ref failures in its result instead of throwing.
    it("reports a rejected ref update as an error", async () => {
      gitApi.getRefs.mockResolvedValue([{ name: "refs/tags/old", objectId: "sha-1" }]);
      gitApi.updateRefs.mockResolvedValue([{ success: false, updateStatus: 3 }]);

      const result = await handlerFor(REPO_TOOLS.delete_tag)({ repositoryId: "repo", project: "Contoso", tagName: "old" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Failed to delete tag");
    });

    it("errors when the tag does not exist", async () => {
      gitApi.getRefs.mockResolvedValue([]);

      const result = await handlerFor(REPO_TOOLS.delete_tag)({ repositoryId: "repo", project: "Contoso", tagName: "ghost" });

      expect(result.isError).toBe(true);
      expect(gitApi.updateRefs).not.toHaveBeenCalled();
    });
  });

  describe("repo_list_commit_statuses", () => {
    it("passes the paging and latest-only options through", async () => {
      gitApi.getStatuses.mockResolvedValue([{ id: 1, state: GitStatusState.Succeeded }]);

      const result = await handlerFor(REPO_TOOLS.list_commit_statuses)({ repositoryId: "repo", project: "Contoso", commitId: "abc", top: 10, skip: 5, latestOnly: false });

      expect(gitApi.getStatuses).toHaveBeenCalledWith("abc", "repo", "Contoso", 10, 5, false);
      expect(parsed(result)).toHaveLength(1);
    });
  });

  describe("repo_create_commit_status", () => {
    it("converts the state name into the SDK enum and builds the context", async () => {
      gitApi.createCommitStatus.mockResolvedValue({ id: 7 });

      await handlerFor(REPO_TOOLS.create_commit_status)({
        repositoryId: "repo",
        project: "Contoso",
        commitId: "abc",
        state: "Succeeded",
        name: "license-scan",
        genre: "continuous-integration",
        description: "clean",
        targetUrl: "https://ci.example/1",
      });

      expect(gitApi.createCommitStatus).toHaveBeenCalledWith(
        {
          state: GitStatusState.Succeeded,
          description: "clean",
          targetUrl: "https://ci.example/1",
          context: { name: "license-scan", genre: "continuous-integration" },
        },
        "abc",
        "repo",
        "Contoso"
      );
    });

    it("surfaces a rejected status", async () => {
      gitApi.createCommitStatus.mockRejectedValue(new Error("commit not found"));

      const result = await handlerFor(REPO_TOOLS.create_commit_status)({ repositoryId: "repo", project: "Contoso", commitId: "bad", state: "Failed", name: "check" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("commit not found");
    });
  });

  describe("repo_create_repository", () => {
    it("creates a standalone repository", async () => {
      gitApi.createRepository.mockResolvedValue({ id: "r1", name: "new-repo" });

      const result = await handlerFor(REPO_TOOLS.create_repository)({ project: "Contoso", name: "new-repo" });

      expect(gitApi.createRepository).toHaveBeenCalledWith({ name: "new-repo" }, "Contoso", undefined);
      expect(parsed(result)).toMatchObject({ name: "new-repo" });
    });

    it("forks from a parent repository and seed ref when asked", async () => {
      gitApi.createRepository.mockResolvedValue({ id: "r2" });

      await handlerFor(REPO_TOOLS.create_repository)({ project: "Contoso", name: "fork", parentRepositoryId: "parent-id", sourceRef: "refs/heads/main" });

      expect(gitApi.createRepository).toHaveBeenCalledWith({ name: "fork", parentRepository: { id: "parent-id", project: { name: "Contoso" } } }, "Contoso", "refs/heads/main");
    });
  });

  describe("repo_delete_repository", () => {
    it("deletes by id and says where the repository went", async () => {
      gitApi.deleteRepository.mockResolvedValue(undefined);

      const result = await handlerFor(REPO_TOOLS.delete_repository)({ repositoryId: "guid-1", project: "Contoso" });

      expect(gitApi.deleteRepository).toHaveBeenCalledWith("guid-1", "Contoso");
      expect(parsed(result)).toMatchObject({ deleted: "guid-1" });
      expect(result.content[0].text).toContain("recycle bin");
    });

    it("surfaces a refused deletion", async () => {
      gitApi.deleteRepository.mockRejectedValue(new Error("TF401019: insufficient permissions"));

      const result = await handlerFor(REPO_TOOLS.delete_repository)({ repositoryId: "guid-1", project: "Contoso" });

      expect(result.isError).toBe(true);
    });
  });

  describe("pull request labels", () => {
    it("lists the labels of a pull request", async () => {
      gitApi.getPullRequestLabels.mockResolvedValue([{ id: "l1", name: "needs-docs", active: true }]);

      const result = await handlerFor(REPO_TOOLS.list_pull_request_labels)({ repositoryId: "repo", pullRequestId: 42, project: "Contoso" });

      expect(gitApi.getPullRequestLabels).toHaveBeenCalledWith("repo", 42, "Contoso");
      expect(parsed(result)).toEqual([{ id: "l1", name: "needs-docs", active: true }]);
    });

    it("adds one label without touching the others", async () => {
      gitApi.createPullRequestLabel.mockResolvedValue({ id: "l2", name: "hotfix" });

      await handlerFor(REPO_TOOLS.add_pull_request_label)({ repositoryId: "repo", pullRequestId: 42, project: "Contoso", label: "hotfix" });

      expect(gitApi.createPullRequestLabel).toHaveBeenCalledWith({ name: "hotfix" }, "repo", 42, "Contoso");
    });

    it("removes one label by name", async () => {
      gitApi.deletePullRequestLabels.mockResolvedValue(undefined);

      const result = await handlerFor(REPO_TOOLS.remove_pull_request_label)({ repositoryId: "repo", pullRequestId: 42, project: "Contoso", label: "hotfix" });

      expect(gitApi.deletePullRequestLabels).toHaveBeenCalledWith("repo", 42, "hotfix", "Contoso");
      expect(parsed(result)).toEqual({ removed: "hotfix", pullRequestId: 42 });
    });

    it("surfaces a failure when removing a label", async () => {
      gitApi.deletePullRequestLabels.mockRejectedValue(new Error("label not found"));

      const result = await handlerFor(REPO_TOOLS.remove_pull_request_label)({ repositoryId: "repo", pullRequestId: 42, project: "Contoso", label: "ghost" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("label not found");
    });
  });

  describe("repo_cherry_pick", () => {
    it("cherry-picks a pull request onto a branch, normalizing short branch names", async () => {
      gitApi.createCherryPick.mockResolvedValue({
        cherryPickId: 12,
        status: GitAsyncOperationStatus.Queued,
        parameters: { ontoRefName: "refs/heads/release/1.4", generatedRefName: "refs/heads/cp/42", source: { pullRequestId: 42 } },
      });

      const result = await handlerFor(REPO_TOOLS.cherry_pick)({ repositoryId: "repo", project: "Contoso", pullRequestId: 42, ontoBranch: "release/1.4", newBranch: "refs/heads/cp/42" });

      expect(gitApi.createCherryPick).toHaveBeenCalledWith(
        { repository: { id: "repo" }, ontoRefName: "refs/heads/release/1.4", generatedRefName: "refs/heads/cp/42", source: { pullRequestId: 42 } },
        "Contoso",
        "repo"
      );
      expect(parsed(result)).toMatchObject({ id: 12, status: "Queued", generatedRefName: "refs/heads/cp/42" });
    });

    it("takes a commit list in the given order", async () => {
      gitApi.createCherryPick.mockResolvedValue({ cherryPickId: 13 });

      await handlerFor(REPO_TOOLS.cherry_pick)({ repositoryId: "repo", project: "Contoso", commitIds: ["a1", "b2"], ontoBranch: "main", newBranch: "cp/two" });

      expect(gitApi.createCherryPick.mock.calls[0][0]).toMatchObject({ source: { commitList: [{ commitId: "a1" }, { commitId: "b2" }] } });
    });

    it.each([
      ["neither source", {}],
      ["both sources", { pullRequestId: 1, commitIds: ["a1"] }],
      ["an empty commit list", { commitIds: [] }],
    ])("refuses %s without calling the API", async (_label, source) => {
      const result = await handlerFor(REPO_TOOLS.cherry_pick)({ repositoryId: "repo", project: "Contoso", ontoBranch: "main", newBranch: "cp/x", ...source });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("exactly one of pullRequestId or commitIds");
      expect(gitApi.createCherryPick).not.toHaveBeenCalled();
    });

    it("surfaces a rejected cherry-pick", async () => {
      gitApi.createCherryPick.mockRejectedValue(new Error("TF401027: permission"));

      const result = await handlerFor(REPO_TOOLS.cherry_pick)({ repositoryId: "repo", project: "Contoso", pullRequestId: 1, ontoBranch: "main", newBranch: "cp/x" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("TF401027");
    });
  });

  describe("repo_get_cherry_pick", () => {
    it("names the status and the failure reason", async () => {
      gitApi.getCherryPick.mockResolvedValue({
        cherryPickId: 12,
        status: GitAsyncOperationStatus.Failed,
        detailedStatus: { conflict: true, failureMessage: "conflict in a.ts", status: GitAsyncRefOperationFailureStatus.Other },
      });

      const result = await handlerFor(REPO_TOOLS.get_cherry_pick)({ repositoryId: "repo", project: "Contoso", cherryPickId: 12 });

      expect(gitApi.getCherryPick).toHaveBeenCalledWith("Contoso", 12, "repo");
      expect(parsed(result)).toMatchObject({ id: 12, status: "Failed", detail: { conflict: true, failure: "Other", failureMessage: "conflict in a.ts" } });
    });

    it("omits the failure name when the operation did not fail", async () => {
      gitApi.getCherryPick.mockResolvedValue({ status: GitAsyncOperationStatus.Completed, detailedStatus: { status: GitAsyncRefOperationFailureStatus.None, progress: 1 } });

      const result = parsed(await handlerFor(REPO_TOOLS.get_cherry_pick)({ repositoryId: "repo", project: "Contoso", cherryPickId: 12 }));

      expect(result).toMatchObject({ id: 12, status: "Completed", detail: { progress: 1 } });
      expect(result.detail.failure).toBeUndefined();
    });

    it("surfaces an unknown id", async () => {
      gitApi.getCherryPick.mockRejectedValue(new Error("not found"));

      const result = await handlerFor(REPO_TOOLS.get_cherry_pick)({ repositoryId: "repo", project: "Contoso", cherryPickId: 99 });

      expect(result.isError).toBe(true);
    });

    // Checked against dev.azure.com: an unknown id is not a 404 but an empty body.
    it("reports an unknown id that the client returns as null", async () => {
      gitApi.getCherryPick.mockResolvedValue(null);

      const result = await handlerFor(REPO_TOOLS.get_cherry_pick)({ repositoryId: "repo", project: "Contoso", cherryPickId: 99 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Cherry-pick 99 not found in repository repo");
    });
  });

  describe("repo_revert", () => {
    it("reverts a pull request onto a new branch", async () => {
      gitApi.createRevert.mockResolvedValue({ revertId: 5, status: GitAsyncOperationStatus.InProgress });

      const result = await handlerFor(REPO_TOOLS.revert)({ repositoryId: "repo", project: "Contoso", pullRequestId: 42, ontoBranch: "main", newBranch: "revert/42" });

      expect(gitApi.createRevert).toHaveBeenCalledWith(
        { repository: { id: "repo" }, ontoRefName: "refs/heads/main", generatedRefName: "refs/heads/revert/42", source: { pullRequestId: 42 } },
        "Contoso",
        "repo"
      );
      expect(parsed(result)).toMatchObject({ id: 5, status: "InProgress" });
    });

    it("refuses a request without a source", async () => {
      const result = await handlerFor(REPO_TOOLS.revert)({ repositoryId: "repo", project: "Contoso", ontoBranch: "main", newBranch: "revert/x" });

      expect(result.isError).toBe(true);
      expect(gitApi.createRevert).not.toHaveBeenCalled();
    });

    it("surfaces a rejected revert", async () => {
      gitApi.createRevert.mockRejectedValue(new Error("ref exists"));

      const result = await handlerFor(REPO_TOOLS.revert)({ repositoryId: "repo", project: "Contoso", commitIds: ["a1"], ontoBranch: "main", newBranch: "revert/x" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ref exists");
    });
  });

  describe("repo_get_revert", () => {
    it("gets the revert by id", async () => {
      gitApi.getRevert.mockResolvedValue({ revertId: 5, status: GitAsyncOperationStatus.Completed });

      const result = await handlerFor(REPO_TOOLS.get_revert)({ repositoryId: "repo", project: "Contoso", revertId: 5 });

      expect(gitApi.getRevert).toHaveBeenCalledWith("Contoso", 5, "repo");
      expect(parsed(result)).toMatchObject({ id: 5, status: "Completed" });
    });

    it("surfaces a failure", async () => {
      gitApi.getRevert.mockRejectedValue(new Error("gone"));

      const result = await handlerFor(REPO_TOOLS.get_revert)({ repositoryId: "repo", project: "Contoso", revertId: 5 });

      expect(result.isError).toBe(true);
    });

    it("reports an unknown id that the client returns as null", async () => {
      gitApi.getRevert.mockResolvedValue(null);

      const result = await handlerFor(REPO_TOOLS.get_revert)({ repositoryId: "repo", project: "Contoso", revertId: 5 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Revert 5 not found in repository repo");
    });
  });

  describe("pull request statuses", () => {
    it("lists all statuses of a pull request", async () => {
      gitApi.getPullRequestStatuses.mockResolvedValue([{ id: 1 }]);

      const result = await handlerFor(REPO_TOOLS.list_pull_request_statuses)({ repositoryId: "repo", pullRequestId: 42, project: "Contoso" });

      expect(gitApi.getPullRequestStatuses).toHaveBeenCalledWith("repo", 42, "Contoso");
      expect(parsed(result)).toEqual([{ id: 1 }]);
    });

    it("lists the statuses of one iteration", async () => {
      gitApi.getPullRequestIterationStatuses.mockResolvedValue([]);

      await handlerFor(REPO_TOOLS.list_pull_request_statuses)({ repositoryId: "repo", pullRequestId: 42, project: "Contoso", iterationId: 3 });

      expect(gitApi.getPullRequestIterationStatuses).toHaveBeenCalledWith("repo", 42, 3, "Contoso");
      expect(gitApi.getPullRequestStatuses).not.toHaveBeenCalled();
    });

    it("surfaces a failure when listing", async () => {
      gitApi.getPullRequestStatuses.mockRejectedValue(new Error("TF401180"));

      const result = await handlerFor(REPO_TOOLS.list_pull_request_statuses)({ repositoryId: "repo", pullRequestId: 42, project: "Contoso" });

      expect(result.isError).toBe(true);
    });

    it("posts a status with its context and iteration", async () => {
      gitApi.createPullRequestStatus.mockResolvedValue({ id: 8 });

      await handlerFor(REPO_TOOLS.create_pull_request_status)({
        repositoryId: "repo",
        pullRequestId: 42,
        project: "Contoso",
        state: "Pending",
        name: "security-review",
        genre: "compliance",
        description: "waiting",
        targetUrl: "https://ci.example/2",
        iterationId: 3,
      });

      expect(gitApi.createPullRequestStatus).toHaveBeenCalledWith(
        { state: GitStatusState.Pending, description: "waiting", targetUrl: "https://ci.example/2", context: { name: "security-review", genre: "compliance" }, iterationId: 3 },
        "repo",
        42,
        "Contoso"
      );
    });

    it("surfaces a rejected status", async () => {
      gitApi.createPullRequestStatus.mockRejectedValue(new Error("pull request not found"));

      const result = await handlerFor(REPO_TOOLS.create_pull_request_status)({ repositoryId: "repo", pullRequestId: 1, project: "Contoso", state: "Failed", name: "x" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("pull request not found");
    });

    it("deletes one status", async () => {
      gitApi.deletePullRequestStatus.mockResolvedValue(undefined);

      const result = await handlerFor(REPO_TOOLS.delete_pull_request_status)({ repositoryId: "repo", pullRequestId: 42, project: "Contoso", statusId: 8 });

      expect(gitApi.deletePullRequestStatus).toHaveBeenCalledWith("repo", 42, 8, "Contoso");
      expect(parsed(result)).toEqual({ deleted: 8, pullRequestId: 42 });
    });

    it("surfaces a failed deletion", async () => {
      gitApi.deletePullRequestStatus.mockRejectedValue(new Error("status not found"));

      const result = await handlerFor(REPO_TOOLS.delete_pull_request_status)({ repositoryId: "repo", pullRequestId: 42, project: "Contoso", statusId: 9 });

      expect(result.isError).toBe(true);
    });
  });

  describe("repository recycle bin", () => {
    it("lists deleted repositories with who deleted them", async () => {
      gitApi.getRecycleBinRepositories.mockResolvedValue([
        { id: "g1", name: "old", deletedBy: { displayName: "Ada" }, deletedDate: "2026-09-01T00:00:00Z", createdDate: "2025-01-01T00:00:00Z", project: { id: "p" } },
      ]);

      const result = await handlerFor(REPO_TOOLS.list_deleted_repositories)({ project: "Contoso" });

      expect(gitApi.getRecycleBinRepositories).toHaveBeenCalledWith("Contoso");
      expect(parsed(result)).toEqual([{ id: "g1", name: "old", deletedBy: "Ada", deletedDate: "2026-09-01T00:00:00Z", createdDate: "2025-01-01T00:00:00Z" }]);
    });

    it("surfaces a failure when listing", async () => {
      gitApi.getRecycleBinRepositories.mockRejectedValue(new Error("denied"));

      const result = await handlerFor(REPO_TOOLS.list_deleted_repositories)({ project: "Contoso" });

      expect(result.isError).toBe(true);
    });

    it("restores a repository by marking it not deleted", async () => {
      gitApi.restoreRepositoryFromRecycleBin.mockResolvedValue({ id: "g1", name: "old" });

      const result = await handlerFor(REPO_TOOLS.restore_repository)({ repositoryId: "g1", project: "Contoso" });

      expect(gitApi.restoreRepositoryFromRecycleBin).toHaveBeenCalledWith({ deleted: false }, "Contoso", "g1");
      expect(parsed(result)).toMatchObject({ name: "old" });
    });

    it("surfaces a refused restore", async () => {
      gitApi.restoreRepositoryFromRecycleBin.mockRejectedValue(new Error("name already in use"));

      const result = await handlerFor(REPO_TOOLS.restore_repository)({ repositoryId: "g1", project: "Contoso" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("name already in use");
    });
  });

  describe("branch locks", () => {
    it("locks a branch through the ref filter without the refs/ prefix", async () => {
      gitApi.updateRef.mockResolvedValue({ name: "refs/heads/release/1.4", isLocked: true, isLockedBy: { displayName: "Ada" } });

      const result = await handlerFor(REPO_TOOLS.lock_branch)({ repositoryId: "repo", project: "Contoso", branch: "release/1.4" });

      expect(gitApi.updateRef).toHaveBeenCalledWith({ isLocked: true }, "repo", "heads/release/1.4", "Contoso");
      expect(parsed(result)).toEqual({ name: "refs/heads/release/1.4", isLocked: true, isLockedBy: "Ada" });
    });

    it("unlocks a branch given as a full ref", async () => {
      gitApi.updateRef.mockResolvedValue({ name: "refs/heads/main", isLocked: false });

      const result = await handlerFor(REPO_TOOLS.unlock_branch)({ repositoryId: "repo", project: "Contoso", branch: "refs/heads/main" });

      expect(gitApi.updateRef).toHaveBeenCalledWith({ isLocked: false }, "repo", "heads/main", "Contoso");
      expect(parsed(result)).toMatchObject({ isLocked: false });
    });

    it.each([
      [REPO_TOOLS.lock_branch, "locking"],
      [REPO_TOOLS.unlock_branch, "unlocking"],
    ])("%s surfaces a refused update", async (tool, verb) => {
      gitApi.updateRef.mockRejectedValue(new Error("TF401027"));

      const result = await handlerFor(tool)({ repositoryId: "repo", project: "Contoso", branch: "main" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(`Error ${verb} branch 'main'`);
    });
  });

  describe("commits and pushes", () => {
    const R = { repositoryId: "repo", project: "Contoso" };

    it("gets a commit with some of its changes", async () => {
      gitApi.getCommit.mockResolvedValue({ commitId: "abc", comment: "fix" });

      const result = await handlerFor(REPO_TOOLS.get_commit)({ ...R, commitId: "abc", changeCount: 5 });

      expect(gitApi.getCommit).toHaveBeenCalledWith("abc", "repo", "Contoso", 5);
      expect(parsed(result)).toEqual({ commitId: "abc", comment: "fix" });
    });

    it("reports an unknown commit", async () => {
      gitApi.getCommit.mockResolvedValue(null);

      const result = await handlerFor(REPO_TOOLS.get_commit)({ ...R, commitId: "ghost" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Commit ghost not found in repository repo");
    });

    it("lists the changes of a commit", async () => {
      gitApi.getChanges.mockResolvedValue({ changeCounts: { Edit: 1 } });

      await handlerFor(REPO_TOOLS.list_commit_changes)({ ...R, commitId: "abc", top: 10, skip: 20 });

      expect(gitApi.getChanges).toHaveBeenCalledWith("abc", "repo", "Contoso", 10, 20);
    });

    // The client reads version/versionType off the descriptors; baseVersion/targetVersion are silently ignored.
    it("compares two branches through version and versionType, naming the change counts", async () => {
      gitApi.getCommitDiffs.mockResolvedValue({ aheadCount: 2, behindCount: 1, changeCounts: { 1: 3, 2: 4 } });

      const result = await handlerFor(REPO_TOOLS.compare_commits)({
        ...R,
        baseVersion: "main",
        baseVersionType: "branch",
        targetVersion: "abc123",
        targetVersionType: "commit",
        diffCommonCommit: true,
        top: 50,
      });

      expect(gitApi.getCommitDiffs).toHaveBeenCalledWith(
        "repo",
        "Contoso",
        true,
        50,
        undefined,
        { version: "main", versionType: GitVersionType.Branch },
        { version: "abc123", versionType: GitVersionType.Commit }
      );
      expect(parsed(result)).toEqual({ aheadCount: 2, behindCount: 1, changeCounts: { Add: 3, Edit: 4 } });
    });

    it("finds merge bases, optionally across a fork", async () => {
      gitApi.getMergeBases.mockResolvedValue([{ commitId: "base" }]);

      await handlerFor(REPO_TOOLS.get_merge_bases)({ ...R, commitId: "a", otherCommitId: "b", otherRepositoryId: "fork" });

      expect(gitApi.getMergeBases).toHaveBeenCalledWith("repo", "a", "b", "Contoso", undefined, "fork");
    });

    it("lists pushes with its search criteria", async () => {
      gitApi.getPushes.mockResolvedValue([{ pushId: 7 }]);
      const fromDate = new Date("2026-09-01T00:00:00Z");

      await handlerFor(REPO_TOOLS.list_pushes)({ ...R, refName: "refs/heads/main", fromDate, includeRefUpdates: true, top: 5 });

      expect(gitApi.getPushes).toHaveBeenCalledWith("repo", "Contoso", undefined, 5, {
        refName: "refs/heads/main",
        pusherId: undefined,
        fromDate,
        toDate: undefined,
        includeRefUpdates: true,
      });
    });

    it("gets a push with its commits and ref updates, or reports it missing", async () => {
      gitApi.getPush.mockResolvedValue({ pushId: 7 });
      await handlerFor(REPO_TOOLS.get_push)({ ...R, pushId: 7, includeCommits: 10 });
      expect(gitApi.getPush).toHaveBeenCalledWith("repo", 7, "Contoso", 10, true);

      gitApi.getPush.mockResolvedValue(null);
      const result = await handlerFor(REPO_TOOLS.get_push)({ ...R, pushId: 8, includeCommits: 0 });
      expect(result.content[0].text).toBe("Push 8 not found in repository repo");
    });

    it("gets stats of one branch against a chosen base", async () => {
      gitApi.getBranch.mockResolvedValue({ name: "feature", aheadCount: 3 });

      await handlerFor(REPO_TOOLS.get_branch_stats)({ ...R, branch: "feature", baseBranch: "develop" });

      expect(gitApi.getBranch).toHaveBeenCalledWith("repo", "feature", "Contoso", { version: "develop", versionType: GitVersionType.Branch });
    });

    it("gets stats of every branch against the default branch", async () => {
      gitApi.getBranches.mockResolvedValue([]);

      await handlerFor(REPO_TOOLS.get_branch_stats)(R);

      expect(gitApi.getBranches).toHaveBeenCalledWith("repo", "Contoso", undefined);
      expect(gitApi.getBranch).not.toHaveBeenCalled();
    });

    it("gets pull request suggestions", async () => {
      gitApi.getSuggestions.mockResolvedValue([{ type: "HeadRef" }]);

      const result = await handlerFor(REPO_TOOLS.get_pull_request_suggestions)(R);

      expect(gitApi.getSuggestions).toHaveBeenCalledWith("repo", "Contoso");
      expect(parsed(result)).toEqual([{ type: "HeadRef" }]);
    });
  });

  describe("pull request commits, work items, comments and likes", () => {
    const PR = { repositoryId: "repo", pullRequestId: 42, project: "Contoso" };
    const COMMENT = { ...PR, threadId: 3, commentId: 9 };

    it("lists the commits of a whole pull request or of one iteration", async () => {
      gitApi.getPullRequestCommits.mockResolvedValue([{ commitId: "a" }]);
      await handlerFor(REPO_TOOLS.list_pull_request_commits)(PR);
      expect(gitApi.getPullRequestCommits).toHaveBeenCalledWith("repo", 42, "Contoso");

      gitApi.getPullRequestIterationCommits.mockResolvedValue([]);
      await handlerFor(REPO_TOOLS.list_pull_request_commits)({ ...PR, iterationId: 2, top: 5, skip: 1 });
      expect(gitApi.getPullRequestIterationCommits).toHaveBeenCalledWith("repo", 42, 2, "Contoso", 5, 1);
    });

    it("lists linked work items as ids and urls", async () => {
      gitApi.getPullRequestWorkItemRefs.mockResolvedValue([{ id: "116", url: "https://x/116", extra: true }]);

      const result = await handlerFor(REPO_TOOLS.list_pull_request_work_items)(PR);

      expect(parsed(result)).toEqual([{ id: "116", url: "https://x/116" }]);
    });

    it("deletes a comment", async () => {
      gitApi.deleteComment.mockResolvedValue(undefined);

      const result = await handlerFor(REPO_TOOLS.delete_pull_request_comment)(COMMENT);

      expect(gitApi.deleteComment).toHaveBeenCalledWith("repo", 42, 3, 9, "Contoso");
      expect(parsed(result)).toEqual({ deleted: 9, threadId: 3, pullRequestId: 42 });
    });

    it("lists, adds and removes likes", async () => {
      gitApi.getLikes.mockResolvedValue([{ id: "u1", displayName: "Ada", uniqueName: "ada@contoso.com", imageUrl: "x" }]);
      expect(parsed(await handlerFor(REPO_TOOLS.list_pull_request_comment_likes)(COMMENT))).toEqual([{ id: "u1", displayName: "Ada", uniqueName: "ada@contoso.com" }]);

      gitApi.createLike.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(REPO_TOOLS.like_pull_request_comment)(COMMENT))).toEqual({ liked: 9, threadId: 3, pullRequestId: 42 });
      expect(gitApi.createLike).toHaveBeenCalledWith("repo", 42, 3, 9, "Contoso");

      gitApi.deleteLike.mockResolvedValue(undefined);
      expect(parsed(await handlerFor(REPO_TOOLS.unlike_pull_request_comment)(COMMENT))).toEqual({ unliked: 9, threadId: 3, pullRequestId: 42 });
      expect(gitApi.deleteLike).toHaveBeenCalledWith("repo", 42, 3, 9, "Contoso");
    });
  });

  describe("repository settings, recycle bin and imports", () => {
    const R = { repositoryId: "repo", project: "Contoso" };

    it("renames a repository and sets its default branch as a full ref", async () => {
      gitApi.updateRepository.mockResolvedValue({ name: "api" });

      await handlerFor(REPO_TOOLS.update_repository)({ ...R, name: "api", defaultBranch: "develop" });

      expect(gitApi.updateRepository).toHaveBeenCalledWith({ name: "api", defaultBranch: "refs/heads/develop" }, "repo", "Contoso");
    });

    it("refuses an update with nothing to change", async () => {
      const result = await handlerFor(REPO_TOOLS.update_repository)(R);

      expect(result.isError).toBe(true);
      expect(gitApi.updateRepository).not.toHaveBeenCalled();
    });

    it("erases a repository from the recycle bin", async () => {
      gitApi.deleteRepositoryFromRecycleBin.mockResolvedValue(undefined);

      const result = await handlerFor(REPO_TOOLS.destroy_repository)({ repositoryId: "g1", project: "Contoso" });

      expect(gitApi.deleteRepositoryFromRecycleBin).toHaveBeenCalledWith("Contoso", "g1");
      expect(parsed(result)).toEqual({ destroyed: "g1" });
    });

    it("creates an import request from a URL and a service connection, naming its status", async () => {
      gitApi.createImportRequest.mockResolvedValue({ importRequestId: 5, status: GitAsyncOperationStatus.Queued, repository: { id: "repo", name: "app", url: "x" } });

      const result = await handlerFor(REPO_TOOLS.create_import_request)({
        ...R,
        sourceUrl: "https://github.com/contoso/app.git",
        serviceEndpointId: "se1",
        deleteServiceEndpointAfterImportIsDone: true,
      });

      expect(gitApi.createImportRequest).toHaveBeenCalledWith(
        { parameters: { gitSource: { url: "https://github.com/contoso/app.git" }, serviceEndpointId: "se1", deleteServiceEndpointAfterImportIsDone: true } },
        "Contoso",
        "repo"
      );
      expect(parsed(result)).toMatchObject({ importRequestId: 5, status: "Queued", repository: { id: "repo", name: "app" } });
    });

    it("lists and gets import requests", async () => {
      gitApi.queryImportRequests.mockResolvedValue([{ importRequestId: 5, status: GitAsyncOperationStatus.Completed }]);
      expect(parsed(await handlerFor(REPO_TOOLS.list_import_requests)({ ...R, includeAbandoned: true }))).toEqual([expect.objectContaining({ status: "Completed" })]);
      expect(gitApi.queryImportRequests).toHaveBeenCalledWith("Contoso", "repo", true);

      gitApi.getImportRequest.mockResolvedValue({ importRequestId: 5, status: GitAsyncOperationStatus.Failed, detailedStatus: { errorMessage: "auth" } });
      expect(parsed(await handlerFor(REPO_TOOLS.get_import_request)({ ...R, importRequestId: 5 }))).toMatchObject({ status: "Failed", detailedStatus: { errorMessage: "auth" } });

      gitApi.getImportRequest.mockResolvedValue(null);
      expect((await handlerFor(REPO_TOOLS.get_import_request)({ ...R, importRequestId: 6 })).content[0].text).toBe("Import request 6 not found in repository repo");
    });

    it.each([
      ["retry", "queued"],
      ["abandon", "abandoned"],
    ])("sends %s as the documented status name", async (action, status) => {
      gitApi.updateImportRequest.mockResolvedValue({ importRequestId: 5 });

      await handlerFor(REPO_TOOLS.update_import_request)({ ...R, importRequestId: 5, action });

      expect(gitApi.updateImportRequest).toHaveBeenCalledWith({ status }, "Contoso", "repo", 5);
    });
  });

  describe("forks", () => {
    const R = { repositoryId: "repo", project: "Contoso" };

    it("lists forks within the organization's collection", async () => {
      coreApi.getProjectCollections.mockResolvedValue([{ id: "coll-1" }]);
      gitApi.getForks.mockResolvedValue([{ id: "fork" }]);

      const result = await handlerFor(REPO_TOOLS.list_forks)(R);

      expect(coreApi.getProjectCollections).toHaveBeenCalledWith(1);
      expect(gitApi.getForks).toHaveBeenCalledWith("repo", "coll-1", "Contoso");
      expect(parsed(result)).toEqual([{ id: "fork" }]);
    });

    it("reports a missing collection", async () => {
      coreApi.getProjectCollections.mockResolvedValue([]);

      const result = await handlerFor(REPO_TOOLS.list_forks)(R);

      expect(result.isError).toBe(true);
      expect(gitApi.getForks).not.toHaveBeenCalled();
    });

    it("requests a sync from the parent for chosen refs", async () => {
      gitApi.createForkSyncRequest.mockResolvedValue({ operationId: 11 });
      const refs = [{ sourceRef: "refs/heads/main", targetRef: "refs/heads/main" }];

      await handlerFor(REPO_TOOLS.create_fork_sync_request)({ ...R, sourceRepositoryId: "parent", sourceProjectId: "p1", refs });

      expect(gitApi.createForkSyncRequest).toHaveBeenCalledWith({ source: { repositoryId: "parent", projectId: "p1" }, sourceToTargetRefs: refs }, "repo", "Contoso");
    });

    it("lists and gets fork sync operations", async () => {
      gitApi.getForkSyncRequests.mockResolvedValue([]);
      await handlerFor(REPO_TOOLS.list_fork_sync_requests)({ ...R, includeAbandoned: false });
      expect(gitApi.getForkSyncRequests).toHaveBeenCalledWith("repo", "Contoso", false);

      gitApi.getForkSyncRequest.mockResolvedValue({ operationId: 11 });
      await handlerFor(REPO_TOOLS.get_fork_sync_request)({ ...R, forkSyncOperationId: 11 });
      expect(gitApi.getForkSyncRequest).toHaveBeenCalledWith("repo", 11, "Contoso");

      gitApi.getForkSyncRequest.mockResolvedValue(null);
      expect((await handlerFor(REPO_TOOLS.get_fork_sync_request)({ ...R, forkSyncOperationId: 12 })).content[0].text).toBe("Fork sync operation 12 not found");
    });
  });

  it.each([
    [REPO_TOOLS.get_commit, "getCommit", { commitId: "a" }, "getting commit a"],
    [REPO_TOOLS.list_commit_changes, "getChanges", { commitId: "a" }, "listing changes of commit a"],
    [
      REPO_TOOLS.compare_commits,
      "getCommitDiffs",
      { baseVersion: "main", baseVersionType: "branch", targetVersion: "dev", targetVersionType: "branch", diffCommonCommit: true },
      "comparing main with dev",
    ],
    [REPO_TOOLS.get_merge_bases, "getMergeBases", { commitId: "a", otherCommitId: "b" }, "finding the merge base of a and b"],
    [REPO_TOOLS.list_pushes, "getPushes", { includeRefUpdates: true, top: 1 }, "listing pushes"],
    [REPO_TOOLS.get_push, "getPush", { pushId: 1, includeCommits: 0 }, "getting push 1"],
    [REPO_TOOLS.get_branch_stats, "getBranches", {}, "getting branch statistics"],
    [REPO_TOOLS.get_pull_request_suggestions, "getSuggestions", {}, "getting pull request suggestions"],
    [REPO_TOOLS.list_pull_request_commits, "getPullRequestCommits", { pullRequestId: 1 }, "listing commits of pull request 1"],
    [REPO_TOOLS.list_pull_request_work_items, "getPullRequestWorkItemRefs", { pullRequestId: 1 }, "listing work items of pull request 1"],
    [REPO_TOOLS.delete_pull_request_comment, "deleteComment", { pullRequestId: 1, threadId: 2, commentId: 3 }, "deleting comment 3"],
    [REPO_TOOLS.list_pull_request_comment_likes, "getLikes", { pullRequestId: 1, threadId: 2, commentId: 3 }, "listing likes of comment 3"],
    [REPO_TOOLS.like_pull_request_comment, "createLike", { pullRequestId: 1, threadId: 2, commentId: 3 }, "liking comment 3"],
    [REPO_TOOLS.unlike_pull_request_comment, "deleteLike", { pullRequestId: 1, threadId: 2, commentId: 3 }, "unliking comment 3"],
    [REPO_TOOLS.update_repository, "updateRepository", { name: "x" }, "updating repository repo"],
    [REPO_TOOLS.destroy_repository, "deleteRepositoryFromRecycleBin", {}, "erasing repository repo"],
    [REPO_TOOLS.create_import_request, "createImportRequest", { sourceUrl: "u" }, "importing u"],
    [REPO_TOOLS.list_import_requests, "queryImportRequests", {}, "listing import requests"],
    [REPO_TOOLS.get_import_request, "getImportRequest", { importRequestId: 1 }, "getting import request 1"],
    [REPO_TOOLS.update_import_request, "updateImportRequest", { importRequestId: 1, action: "retry" }, "updating import request 1"],
    [REPO_TOOLS.list_forks, "getProjectCollections", {}, "listing forks of repository repo"],
    [REPO_TOOLS.create_fork_sync_request, "createForkSyncRequest", { sourceRepositoryId: "p", sourceProjectId: "q" }, "syncing repository repo"],
    [REPO_TOOLS.list_fork_sync_requests, "getForkSyncRequests", {}, "listing fork sync requests"],
    [REPO_TOOLS.get_fork_sync_request, "getForkSyncRequest", { forkSyncOperationId: 1 }, "getting fork sync operation 1"],
  ])("%s surfaces an API failure", async (tool, method, args, action) => {
    (gitApi[method] ?? coreApi[method]).mockRejectedValue(new Error("TF400898"));

    const result = await handlerFor(tool)({ repositoryId: "repo", project: "Contoso", ...args });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(`Error ${action}: TF400898`);
  });
});

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import {
  GitRef,
  GitForkRef,
  PullRequestStatus,
  GitQueryCommitsCriteria,
  GitVersionType,
  GitVersionDescriptor,
  GitPullRequestQuery,
  GitPullRequestQueryInput,
  GitPullRequestQueryType,
  CommentThreadContext,
  CommentThreadStatus,
  GitPullRequestCompletionOptions,
  GitPullRequestMergeStrategy,
  GitPullRequest,
  GitPullRequestCommentThread,
  Comment,
  VersionControlChangeType,
  VersionControlRecursionType,
  GitPush,
  GitChange,
  ItemContentType,
  GitStatusState,
  GitAsyncOperationStatus,
  GitAsyncRefOperation,
  GitAsyncRefOperationFailureStatus,
  GitAsyncRefOperationParameters,
} from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { z } from "zod";
import { getCurrentUserDetails, getUserIdFromEmail } from "./auth.js";
import { GitRepository } from "azure-devops-node-api/interfaces/TfvcInterfaces.js";
import { WebApiTagDefinition } from "azure-devops-node-api/interfaces/CoreInterfaces.js";
import { extractAdoStreamError, getEnumKeys, safeEnumConvert, streamToString } from "../utils.js";
import { requiredProject } from "../shared/common-params.js";
import { errorMessage, jsonResult, toolError } from "../shared/tool-results.js";

const REPO_TOOLS = {
  list_repos_by_project: "repo_list_repos_by_project",
  list_pull_requests_by_repo_or_project: "repo_list_pull_requests_by_repo_or_project",
  list_pull_requests_by_org: "repo_list_pull_requests_by_org",
  list_branches_by_repo: "repo_list_branches_by_repo",
  list_my_branches_by_repo: "repo_list_my_branches_by_repo",
  list_pull_request_threads: "repo_list_pull_request_threads",
  list_pull_request_thread_comments: "repo_list_pull_request_thread_comments",
  get_repo_by_name_or_id: "repo_get_repo_by_name_or_id",
  get_branch_by_name: "repo_get_branch_by_name",
  get_pull_request_by_id: "repo_get_pull_request_by_id",
  get_pull_request_changes: "repo_get_pull_request_changes",
  create_pull_request: "repo_create_pull_request",
  create_branch: "repo_create_branch",
  update_pull_request: "repo_update_pull_request",
  update_pull_request_reviewers: "repo_update_pull_request_reviewers",
  reply_to_comment: "repo_reply_to_comment",
  create_pull_request_thread: "repo_create_pull_request_thread",
  update_pull_request_thread: "repo_update_pull_request_thread",
  update_pull_request_comment: "repo_update_pull_request_comment",
  search_commits: "repo_search_commits",
  list_pull_requests_by_commits: "repo_list_pull_requests_by_commits",
  vote_pull_request: "repo_vote_pull_request",
  list_directory: "repo_list_directory",
  get_file_content: "repo_get_file_content",
  push_changes: "repo_push_changes",
  list_tags: "repo_list_tags",
  get_tag: "repo_get_tag",
  create_tag: "repo_create_tag",
  delete_tag: "repo_delete_tag",
  list_commit_statuses: "repo_list_commit_statuses",
  create_commit_status: "repo_create_commit_status",
  create_repository: "repo_create_repository",
  delete_repository: "repo_delete_repository",
  list_pull_request_labels: "repo_list_pull_request_labels",
  add_pull_request_label: "repo_add_pull_request_label",
  remove_pull_request_label: "repo_remove_pull_request_label",
  cherry_pick: "repo_cherry_pick",
  get_cherry_pick: "repo_get_cherry_pick",
  revert: "repo_revert",
  get_revert: "repo_get_revert",
  list_pull_request_statuses: "repo_list_pull_request_statuses",
  create_pull_request_status: "repo_create_pull_request_status",
  delete_pull_request_status: "repo_delete_pull_request_status",
  list_deleted_repositories: "repo_list_deleted_repositories",
  restore_repository: "repo_restore_repository",
  lock_branch: "repo_lock_branch",
  unlock_branch: "repo_unlock_branch",
  get_commit: "repo_get_commit",
  list_commit_changes: "repo_list_commit_changes",
  compare_commits: "repo_compare_commits",
  get_merge_bases: "repo_get_merge_bases",
  list_pushes: "repo_list_pushes",
  get_push: "repo_get_push",
  get_branch_stats: "repo_get_branch_stats",
  get_pull_request_suggestions: "repo_get_pull_request_suggestions",
  list_pull_request_commits: "repo_list_pull_request_commits",
  list_pull_request_work_items: "repo_list_pull_request_work_items",
  delete_pull_request_comment: "repo_delete_pull_request_comment",
  list_pull_request_comment_likes: "repo_list_pull_request_comment_likes",
  like_pull_request_comment: "repo_like_pull_request_comment",
  unlike_pull_request_comment: "repo_unlike_pull_request_comment",
  update_repository: "repo_update_repository",
  destroy_repository: "repo_destroy_repository",
  create_import_request: "repo_create_import_request",
  list_import_requests: "repo_list_import_requests",
  get_import_request: "repo_get_import_request",
  update_import_request: "repo_update_import_request",
  list_forks: "repo_list_forks",
  create_fork_sync_request: "repo_create_fork_sync_request",
  list_fork_sync_requests: "repo_list_fork_sync_requests",
  get_fork_sync_request: "repo_get_fork_sync_request",
};

/** A ref update to the all-zero object id deletes the ref. */
const DELETED_OBJECT_ID = "0".repeat(40);

/** Strip the `refs/tags/` prefix that the refs API returns. */
function tagNameFromRef(refName: string | undefined): string | undefined {
  return refName?.replace(/^refs\/tags\//, "");
}

/** Accept a branch as 'main' or 'refs/heads/main'. */
function branchRef(branch: string): string {
  return branch.startsWith("refs/") ? branch : `refs/heads/${branch}`;
}

/** Cherry-picks and reverts run asynchronously; report their state by name rather than enum number. */
function summarizeAsyncRefOperation(id: number | undefined, operation: GitAsyncRefOperation) {
  const detail = operation.detailedStatus;
  return {
    id,
    status: operation.status !== undefined ? GitAsyncOperationStatus[operation.status] : undefined,
    ontoRefName: operation.parameters?.ontoRefName,
    generatedRefName: operation.parameters?.generatedRefName,
    source: operation.parameters?.source,
    detail: detail && {
      conflict: detail.conflict,
      currentCommitId: detail.currentCommitId,
      failureMessage: detail.failureMessage,
      failure: detail.status !== undefined && detail.status !== GitAsyncRefOperationFailureStatus.None ? GitAsyncRefOperationFailureStatus[detail.status] : undefined,
      progress: detail.progress,
      timedout: detail.timedout,
    },
  };
}

function branchesFilterOutIrrelevantProperties(branches: GitRef[], top: number) {
  return branches
    ?.flatMap((branch) => (branch.name ? [branch.name] : []))
    ?.filter((branch) => branch.startsWith("refs/heads/"))
    .map((branch) => branch.replace("refs/heads/", ""))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, top);
}

function trimPullRequestThread(thread: GitPullRequestCommentThread) {
  return {
    id: thread.id,
    publishedDate: thread.publishedDate,
    lastUpdatedDate: thread.lastUpdatedDate,
    status: thread.status,
    comments: trimComments(thread.comments),
    threadContext: thread.threadContext,
    pullRequestThreadContext: thread.pullRequestThreadContext,
  };
}

/**
 * Trims comment data to essential properties, filtering out deleted comments
 * @param comments Array of comments to trim (can be undefined/null)
 * @returns Array of trimmed comment objects with essential properties only
 */
function trimComments(comments: Comment[] | undefined | null) {
  return comments
    ?.filter((comment) => !comment.isDeleted) // Exclude deleted comments
    ?.map((comment) => ({
      id: comment.id,
      author: {
        displayName: comment.author?.displayName,
        uniqueName: comment.author?.uniqueName,
      },
      content: comment.content,
      publishedDate: comment.publishedDate,
      lastUpdatedDate: comment.lastUpdatedDate,
      lastContentUpdatedDate: comment.lastContentUpdatedDate,
    }));
}

function pullRequestStatusStringToInt(status: string): number {
  switch (status) {
    case "Abandoned":
      return PullRequestStatus.Abandoned.valueOf();
    case "Active":
      return PullRequestStatus.Active.valueOf();
    case "All":
      return PullRequestStatus.All.valueOf();
    case "Completed":
      return PullRequestStatus.Completed.valueOf();
    case "NotSet":
      return PullRequestStatus.NotSet.valueOf();
    default:
      throw new Error(`Unknown pull request status: ${status}`);
  }
}

function filterReposByName(repositories: GitRepository[], repoNameFilter: string): GitRepository[] {
  const lowerCaseFilter = repoNameFilter.toLowerCase();
  const filteredByName = repositories?.filter((repo) => repo.name?.toLowerCase().includes(lowerCaseFilter));

  return filteredByName;
}

function trimPullRequest(pr: GitPullRequest | null | undefined, includeDescription = false) {
  if (!pr) {
    return null;
  }

  const statusName = typeof pr.status === "number" ? (PullRequestStatus[pr.status] ?? "Unknown") : "Unknown";

  return {
    pullRequestId: pr.pullRequestId,
    codeReviewId: pr.codeReviewId,
    repository: pr.repository?.name,
    status: pr.status,
    statusName,
    createdBy: {
      displayName: pr.createdBy?.displayName,
      uniqueName: pr.createdBy?.uniqueName,
    },
    creationDate: pr.creationDate,
    closedDate: pr.closedDate,
    title: pr.title,
    ...(includeDescription ? { description: pr.description ?? "" } : {}),
    isDraft: pr.isDraft,
    sourceRefName: pr.sourceRefName,
    targetRefName: pr.targetRefName,
    project: pr.repository?.project?.name,
  };
}

/**
 * Resolve the creator/reviewer filters of the organization-wide pull request
 * listing: an explicit user wins over the "me" flag, as the parameter
 * descriptions say. Throws when an email does not resolve to a user.
 */
async function pullRequestIdentityFilters(
  args: { created_by_me: boolean; created_by_user?: string; i_am_reviewer: boolean; user_is_reviewer?: string },
  tokenProvider: () => Promise<string>,
  connectionProvider: () => Promise<WebApi>,
  userAgentProvider: () => string
): Promise<{ creatorId?: string; reviewerId?: string }> {
  const filters: { creatorId?: string; reviewerId?: string } = {};
  if (args.created_by_user) {
    filters.creatorId = await getUserIdFromEmail(args.created_by_user, tokenProvider, connectionProvider, userAgentProvider);
  } else if (args.created_by_me) {
    filters.creatorId = (await getCurrentUserDetails(tokenProvider, connectionProvider, userAgentProvider)).authenticatedUser.id;
  }
  if (args.user_is_reviewer) {
    filters.reviewerId = await getUserIdFromEmail(args.user_is_reviewer, tokenProvider, connectionProvider, userAgentProvider);
  } else if (args.i_am_reviewer) {
    filters.reviewerId = (await getCurrentUserDetails(tokenProvider, connectionProvider, userAgentProvider)).authenticatedUser.id;
  }
  return filters;
}

// Helper function to build a version descriptor from branch or commit
function buildVersionDescriptor(version?: string, versionType?: string): GitVersionDescriptor | undefined {
  if (!version) {
    return undefined;
  }

  const versionTypeMap: Record<string, GitVersionType> = {
    Branch: GitVersionType.Branch,
    Commit: GitVersionType.Commit,
    Tag: GitVersionType.Tag,
  };

  return {
    version: version,
    versionType: versionTypeMap[versionType || "Branch"] ?? GitVersionType.Branch,
  };
}

function configureRepoTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string) {
  registerTool(
    server,
    REPO_TOOLS.create_pull_request,
    "Create a new pull request.",
    {
      repositoryId: z
        .string()
        .describe("The ID or name of the repository where the pull request will be created. When using a repository name instead of a GUID, the project parameter must also be provided."),
      sourceRefName: z.string().describe("The source branch name for the pull request, e.g., 'refs/heads/feature-branch'."),
      targetRefName: z.string().describe("The target branch name for the pull request, e.g., 'refs/heads/main'."),
      title: z.string().describe("The title of the pull request."),
      description: z.string().max(4000).optional().describe("The description of the pull request. Must not be longer than 4000 characters. Optional."),
      isDraft: z.boolean().optional().default(false).describe("Indicates whether the pull request is a draft. Defaults to false."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
      workItems: z.string().optional().describe("Work item IDs to associate with the pull request, space-separated."),
      forkSourceRepositoryId: z.string().optional().describe("The ID of the fork repository that the pull request originates from. Optional, used when creating a pull request from a fork."),
      labels: z.array(z.string()).optional().describe("Array of label names to add to the pull request after creation."),
    },
    async ({ repositoryId, sourceRefName, targetRefName, title, description, isDraft, project, workItems, forkSourceRepositoryId, labels }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const workItemRefs = workItems ? workItems.split(" ").map((id) => ({ id: id.trim() })) : [];
        const noDataErrorMessage =
          `Pull request creation returned no data and no matching PR was found. This often means repositoryId=\"${repositoryId}\" was not resolvable. ` +
          "Try the repository GUID from repo_list_repos_by_project instead of the Project/RepoName slash format.";

        const forkSource: GitForkRef | undefined = forkSourceRepositoryId
          ? {
              repository: {
                id: forkSourceRepositoryId,
              },
            }
          : undefined;

        const labelDefinitions: WebApiTagDefinition[] | undefined = labels ? labels.map((label) => ({ name: label })) : undefined;

        let pullRequest = await gitApi.createPullRequest(
          {
            sourceRefName,
            targetRefName,
            title,
            description,
            isDraft,
            workItemRefs: workItemRefs,
            forkSource,
            labels: labelDefinitions,
            supportsIterations: true,
          },
          repositoryId,
          project
        );

        if (!pullRequest) {
          const prs = await gitApi.getPullRequests(repositoryId, { sourceRefName, targetRefName, status: PullRequestStatus.Active }, project, undefined, 0, 1);
          if (prs && prs.length > 0) {
            pullRequest = prs[0];
          } else {
            return {
              content: [{ type: "text", text: noDataErrorMessage }],
              isError: true,
            };
          }
        }

        const trimmedPullRequest = trimPullRequest(pullRequest, true);

        if (!trimmedPullRequest) {
          return {
            content: [{ type: "text", text: noDataErrorMessage }],
            isError: true,
          };
        }

        return jsonResult(trimmedPullRequest);
      } catch (error) {
        return toolError("creating pull request", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.create_branch,
    "Create a new branch in the repository.",
    {
      repositoryId: z
        .string()
        .describe("The ID or name of the repository where the branch will be created. When using a repository name instead of a GUID, the project parameter must also be provided."),
      branchName: z.string().describe("The name of the new branch to create, e.g., 'feature-branch'."),
      sourceBranchName: z.string().optional().default("main").describe("The name of the source branch to create the new branch from. Defaults to 'main'."),
      sourceCommitId: z.string().optional().describe("The commit ID to create the branch from. If not provided, uses the latest commit of the source branch."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
    },
    async ({ repositoryId, branchName, sourceBranchName, sourceCommitId, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        let commitId = sourceCommitId;

        // If no commit ID is provided, get the latest commit from the source branch
        if (!commitId) {
          const sourceRefName = `refs/heads/${sourceBranchName}`;
          try {
            const sourceBranch = await gitApi.getRefs(repositoryId, project, "heads/", false, false, undefined, false, undefined, sourceBranchName);
            const branch = sourceBranch.find((b) => b.name === sourceRefName);
            if (!branch || !branch.objectId) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: Source branch '${sourceBranchName}' not found in repository ${repositoryId}`,
                  },
                ],
                isError: true,
              };
            }
            commitId = branch.objectId;
          } catch (error) {
            return toolError(`retrieving source branch '${sourceBranchName}'`, error);
          }
        }

        // Create the new branch using updateRefs
        const newRefName = `refs/heads/${branchName}`;
        const refUpdate = {
          name: newRefName,
          newObjectId: commitId,
          oldObjectId: "0000000000000000000000000000000000000000", // All zeros indicates creating a new ref
        };

        try {
          const result = await gitApi.updateRefs([refUpdate], repositoryId, project);

          // Check if the branch creation was successful
          if (result && result.length > 0 && result[0].success) {
            return {
              content: [
                {
                  type: "text",
                  text: `Branch '${branchName}' created successfully from '${sourceBranchName}' (${commitId})`,
                },
              ],
            };
          } else {
            const errorMessage = result && result.length > 0 && result[0].customMessage ? result[0].customMessage : "Unknown error occurred during branch creation";
            return {
              content: [
                {
                  type: "text",
                  text: `Error creating branch '${branchName}': ${errorMessage}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          return toolError(`creating branch '${branchName}'`, error);
        }
      } catch (error) {
        return toolError("creating branch", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.update_pull_request,
    "Update a Pull Request by ID with specified fields, including setting autocomplete with various completion options.",
    {
      repositoryId: z.string().describe("The ID or name of the repository where the pull request exists. When using a repository name instead of a GUID, the project parameter must also be provided."),
      pullRequestId: z.coerce.number().min(1).describe("The ID of the pull request to update."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
      title: z.string().optional().describe("The new title for the pull request."),
      description: z.string().max(4000).optional().describe("The new description for the pull request. Must not be longer than 4000 characters."),
      isDraft: z.boolean().optional().describe("Whether the pull request should be a draft."),
      targetRefName: z.string().optional().describe("The new target branch name (e.g., 'refs/heads/main')."),
      status: z.enum(["Active", "Abandoned"]).optional().describe("The new status of the pull request. Can be 'Active' or 'Abandoned'."),
      autoComplete: z.boolean().optional().describe("Set the pull request to autocomplete when all requirements are met."),
      mergeStrategy: z
        .enum(getEnumKeys(GitPullRequestMergeStrategy) as [string, ...string[]])
        .optional()
        .describe("The merge strategy to use when the pull request autocompletes. Defaults to 'NoFastForward'."),
      mergeCommitMessage: z.string().optional().describe("Commit message to use when the pull request is completed."),
      deleteSourceBranch: z.boolean().optional().default(false).describe("Whether to delete the source branch when the pull request autocompletes. Defaults to false."),
      transitionWorkItems: z.boolean().optional().default(true).describe("Whether to transition associated work items to the next state when the pull request autocompletes. Defaults to true."),
      bypassPolicy: z.boolean().optional().default(false).describe("Bypass branch policies when the pull request autocompletes. Requires bypassReason."),
      bypassReason: z.string().optional().describe("Why branch policies are bypassed. Only used when bypassPolicy is true."),
      labels: z.array(z.string()).optional().describe("Array of label names to replace existing labels on the pull request. This will remove all current labels and add the specified ones."),
    },
    async ({
      repositoryId,
      pullRequestId,
      project,
      title,
      description,
      isDraft,
      targetRefName,
      status,
      autoComplete,
      mergeStrategy,
      mergeCommitMessage,
      deleteSourceBranch,
      transitionWorkItems,
      bypassPolicy,
      bypassReason,
      labels,
    }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        // Build update object with only provided fields
        const updateRequest: Record<string, unknown> = {};

        if (title !== undefined) updateRequest.title = title;
        if (description !== undefined) updateRequest.description = description;
        if (isDraft !== undefined) updateRequest.isDraft = isDraft;
        if (targetRefName !== undefined) updateRequest.targetRefName = targetRefName;
        if (status !== undefined) {
          updateRequest.status = status === "Active" ? PullRequestStatus.Active.valueOf() : PullRequestStatus.Abandoned.valueOf();
        }

        if (autoComplete !== undefined) {
          if (autoComplete) {
            // Bypassing policies used to be implied by passing a reason, so a
            // model filling in a plausible-looking reason bypassed them by
            // accident. It now takes an explicit flag (upstream #1570).
            if (bypassPolicy && !bypassReason) {
              return { content: [{ type: "text", text: "bypassReason is required when bypassPolicy is true" }], isError: true };
            }

            const data = await getCurrentUserDetails(tokenProvider, connectionProvider, userAgentProvider);
            const autoCompleteUserId = data.authenticatedUser.id;
            updateRequest.autoCompleteSetBy = { id: autoCompleteUserId };

            const completionOptions: GitPullRequestCompletionOptions = {
              deleteSourceBranch: deleteSourceBranch || false,
              transitionWorkItems: transitionWorkItems !== false, // Default to true unless explicitly set to false
              bypassPolicy: bypassPolicy === true,
            };

            if (mergeStrategy) {
              completionOptions.mergeStrategy = GitPullRequestMergeStrategy[mergeStrategy as keyof typeof GitPullRequestMergeStrategy];
            }

            if (mergeCommitMessage) {
              completionOptions.mergeCommitMessage = mergeCommitMessage;
            }

            if (bypassPolicy && bypassReason) {
              completionOptions.bypassReason = bypassReason;
            }

            updateRequest.completionOptions = completionOptions;
          } else {
            updateRequest.autoCompleteSetBy = null;
            updateRequest.completionOptions = null;
          }
        }

        // Validate that at least one field is provided for update
        if (Object.keys(updateRequest).length === 0 && !labels) {
          return {
            content: [{ type: "text", text: "Error: At least one field (title, description, isDraft, targetRefName, status, autoComplete options, or labels) must be provided for update." }],
            isError: true,
          };
        }

        // Update labels if provided
        if (labels) {
          const currentLabels = await gitApi.getPullRequestLabels(repositoryId, pullRequestId, project);
          for (const currentLabel of currentLabels) {
            if (currentLabel.id) {
              await gitApi.deletePullRequestLabels(repositoryId, pullRequestId, currentLabel.id, project);
            }
          }
          for (const label of labels) {
            await gitApi.createPullRequestLabel({ name: label }, repositoryId, pullRequestId, project);
          }
        }

        let updatedPullRequest;
        if (Object.keys(updateRequest).length > 0) {
          updatedPullRequest = await gitApi.updatePullRequest(updateRequest, repositoryId, pullRequestId, project);
        } else {
          // If only labels were updated, get the current pull request
          updatedPullRequest = await gitApi.getPullRequest(repositoryId, pullRequestId, project);
        }

        const trimmedUpdatedPullRequest = trimPullRequest(updatedPullRequest, true);

        if (!trimmedUpdatedPullRequest) {
          return {
            content: [{ type: "text", text: "Pull request updated but API returned no data." }],
          };
        }

        return jsonResult(trimmedUpdatedPullRequest);
      } catch (error) {
        return toolError("updating pull request", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.update_pull_request_reviewers,
    "Add or remove reviewers for an existing pull request.",
    {
      repositoryId: z.string().describe("The ID or name of the repository where the pull request exists. When using a repository name instead of a GUID, the project parameter must also be provided."),
      pullRequestId: z.coerce.number().min(1).describe("The ID of the pull request to update."),
      reviewerIds: z.array(z.string()).describe("List of reviewer ids to add or remove from the pull request."),
      action: z.enum(["add", "remove"]).describe("Action to perform on the reviewers. Can be 'add' or 'remove'."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
    },
    async ({ repositoryId, pullRequestId, reviewerIds, action, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        let updatedPullRequest;
        if (action === "add") {
          updatedPullRequest = await gitApi.createPullRequestReviewers(
            reviewerIds.map((id) => ({ id: id })),
            repositoryId,
            pullRequestId,
            project
          );

          const trimmedResponse = updatedPullRequest.map((item) => ({
            displayName: item.displayName,
            id: item.id,
            uniqueName: item.uniqueName,
            vote: item.vote,
            hasDeclined: item.hasDeclined,
            isFlagged: item.isFlagged,
          }));

          return jsonResult(trimmedResponse);
        } else {
          for (const reviewerId of reviewerIds) {
            await gitApi.deletePullRequestReviewer(repositoryId, pullRequestId, reviewerId, project);
          }

          return {
            content: [{ type: "text", text: `Reviewers with IDs ${reviewerIds.join(", ")} removed from pull request ${pullRequestId}.` }],
          };
        }
      } catch (error) {
        return toolError("updating pull request reviewers", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_repos_by_project,
    "Retrieve a list of repositories for a given project",
    {
      project: requiredProject,
      top: z.coerce.number().default(100).describe("The maximum number of repositories to return."),
      skip: z.coerce.number().default(0).describe("The number of repositories to skip. Defaults to 0."),
      repoNameFilter: z.string().optional().describe("Optional filter to search for repositories by name. If provided, only repositories with names containing this string will be returned."),
    },
    async ({ project, top, skip, repoNameFilter }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const repositories = await gitApi.getRepositories(project, false, false, false);

        const filteredRepositories = repoNameFilter ? filterReposByName(repositories, repoNameFilter) : repositories;

        const paginatedRepositories = filteredRepositories?.sort((a, b) => a.name?.localeCompare(b.name ?? "") ?? 0).slice(skip, skip + top);

        // Filter out the irrelevant properties
        const trimmedRepositories = paginatedRepositories?.map((repo) => ({
          id: repo.id,
          name: repo.name,
          isDisabled: repo.isDisabled,
          isFork: repo.isFork,
          isInMaintenance: repo.isInMaintenance,
          webUrl: repo.webUrl,
          size: repo.size,
        }));

        return jsonResult(trimmedRepositories);
      } catch (error) {
        return toolError("listing repositories", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_pull_requests_by_repo_or_project,
    "Retrieve a list of pull requests for a given repository. Either repositoryId or project must be provided.",
    {
      repositoryId: z
        .string()
        .optional()
        .describe("The ID or name of the repository where the pull requests are located. When using a repository name instead of a GUID, the project parameter must also be provided."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID, or to scope the search to a specific project."),
      top: z.coerce.number().default(100).describe("The maximum number of pull requests to return."),
      skip: z.coerce.number().default(0).describe("The number of pull requests to skip."),
      created_by_me: z.boolean().default(false).describe("Filter pull requests created by the current user."),
      created_by_user: z.string().optional().describe("Filter pull requests created by a specific user (provide email or unique name). Takes precedence over created_by_me if both are provided."),
      i_am_reviewer: z.boolean().default(false).describe("Filter pull requests where the current user is a reviewer."),
      user_is_reviewer: z
        .string()
        .optional()
        .describe("Filter pull requests where a specific user is a reviewer (provide email or unique name). Takes precedence over i_am_reviewer if both are provided."),
      status: z
        .enum(getEnumKeys(PullRequestStatus) as [string, ...string[]])
        .default("Active")
        .describe("Filter pull requests by status. Defaults to 'Active'."),
      sourceRefName: z.string().optional().describe("Filter pull requests from this source branch (e.g., 'refs/heads/feature-branch')."),
      targetRefName: z.string().optional().describe("Filter pull requests into this target branch (e.g., 'refs/heads/main')."),
    },
    async ({ repositoryId, project, top, skip, created_by_me, created_by_user, i_am_reviewer, user_is_reviewer, status, sourceRefName, targetRefName }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        // Build the search criteria
        const searchCriteria: {
          status: number;
          repositoryId?: string;
          creatorId?: string;
          reviewerId?: string;
          sourceRefName?: string;
          targetRefName?: string;
        } = {
          status: pullRequestStatusStringToInt(status),
        };

        if (!repositoryId && !project) {
          return {
            content: [
              {
                type: "text",
                text: "Either repositoryId or project must be provided.",
              },
            ],
            isError: true,
          };
        }

        if (repositoryId) {
          searchCriteria.repositoryId = repositoryId;
        }

        if (sourceRefName) {
          searchCriteria.sourceRefName = sourceRefName;
        }

        if (targetRefName) {
          searchCriteria.targetRefName = targetRefName;
        }

        if (created_by_user) {
          try {
            const userId = await getUserIdFromEmail(created_by_user, tokenProvider, connectionProvider, userAgentProvider);
            searchCriteria.creatorId = userId;
          } catch (error) {
            return toolError(`finding user with email ${created_by_user}`, error);
          }
        } else if (created_by_me) {
          const data = await getCurrentUserDetails(tokenProvider, connectionProvider, userAgentProvider);
          const userId = data.authenticatedUser.id;
          searchCriteria.creatorId = userId;
        }

        if (user_is_reviewer) {
          try {
            const reviewerUserId = await getUserIdFromEmail(user_is_reviewer, tokenProvider, connectionProvider, userAgentProvider);
            searchCriteria.reviewerId = reviewerUserId;
          } catch (error) {
            return toolError(`finding reviewer with email ${user_is_reviewer}`, error);
          }
        } else if (i_am_reviewer) {
          const data = await getCurrentUserDetails(tokenProvider, connectionProvider, userAgentProvider);
          const userId = data.authenticatedUser.id;
          searchCriteria.reviewerId = userId;
        }

        let pullRequests;
        if (repositoryId) {
          pullRequests = await gitApi.getPullRequests(
            repositoryId,
            searchCriteria,
            project, // project
            undefined, // maxCommentLength
            skip,
            top
          );
        } else if (project) {
          // If only project is provided, use getPullRequestsByProject
          pullRequests = await gitApi.getPullRequestsByProject(
            project,
            searchCriteria,
            undefined, // maxCommentLength
            skip,
            top
          );
        } else {
          // This case should not occur due to earlier validation, but added for completeness
          return {
            content: [
              {
                type: "text",
                text: "Either repositoryId or project must be provided.",
              },
            ],
            isError: true,
          };
        }

        const filteredPullRequests = pullRequests?.map((pr) => trimPullRequest(pr));

        return jsonResult(filteredPullRequests);
      } catch (error) {
        return toolError("listing pull requests", error);
      }
    }
  );

  // Organization-wide pull requests. The node API only reaches a repository or
  // a project, so this calls the collection-level route directly (upstream #1600).
  registerTool(
    server,
    REPO_TOOLS.list_pull_requests_by_org,
    "Retrieve pull requests from every project and repository in the organization at once — use it for questions like 'my pull requests' or 'pull requests waiting for my review'. For one repository or project use repo_list_pull_requests_by_repo_or_project.",
    {
      top: z.coerce.number().min(1).max(1000).default(100).describe("The maximum number of pull requests to return."),
      skip: z.coerce.number().min(0).default(0).describe("The number of pull requests to skip."),
      created_by_me: z.boolean().default(false).describe("Filter pull requests created by the current user."),
      created_by_user: z.string().optional().describe("Filter pull requests created by a specific user (provide email or unique name). Takes precedence over created_by_me if both are provided."),
      i_am_reviewer: z.boolean().default(false).describe("Filter pull requests where the current user is a reviewer."),
      user_is_reviewer: z
        .string()
        .optional()
        .describe("Filter pull requests where a specific user is a reviewer (provide email or unique name). Takes precedence over i_am_reviewer if both are provided."),
      status: z
        .enum(getEnumKeys(PullRequestStatus) as [string, ...string[]])
        .default("Active")
        .describe("Filter pull requests by status. Defaults to 'Active'."),
      sourceRefName: z.string().optional().describe("Filter pull requests from this source branch (e.g., 'refs/heads/feature-branch')."),
      targetRefName: z.string().optional().describe("Filter pull requests into this target branch (e.g., 'refs/heads/main')."),
    },
    async ({ top, skip, created_by_me, created_by_user, i_am_reviewer, user_is_reviewer, status, sourceRefName, targetRefName }) => {
      try {
        const connection = await connectionProvider();

        let identity: { creatorId?: string; reviewerId?: string };
        try {
          identity = await pullRequestIdentityFilters({ created_by_me, created_by_user, i_am_reviewer, user_is_reviewer }, tokenProvider, connectionProvider, userAgentProvider);
        } catch (error) {
          return toolError("resolving the user filter", error);
        }

        const url = new URL(`${connection.serverUrl.replace(/\/$/, "")}/_apis/git/pullrequests`);
        url.searchParams.set("api-version", "7.1");
        url.searchParams.set("$top", String(top));
        url.searchParams.set("$skip", String(skip));
        url.searchParams.set("searchCriteria.status", String(pullRequestStatusStringToInt(status)));
        if (identity.creatorId) url.searchParams.set("searchCriteria.creatorId", identity.creatorId);
        if (identity.reviewerId) url.searchParams.set("searchCriteria.reviewerId", identity.reviewerId);
        if (sourceRefName) url.searchParams.set("searchCriteria.sourceRefName", sourceRefName);
        if (targetRefName) url.searchParams.set("searchCriteria.targetRefName", targetRefName);

        const response = await connection.rest.get<{ value?: GitPullRequest[] }>(url.toString(), { deserializeDates: true });
        // Organization-wide results span projects and repositories, so each one
        // carries the ids needed to address it with the per-repository tools.
        const pullRequests = (response.result?.value ?? []).map((pr) => ({
          ...trimPullRequest(pr),
          repositoryId: pr.repository?.id,
          projectId: pr.repository?.project?.id,
          url: pr.url,
        }));

        return jsonResult(pullRequests);
      } catch (error) {
        return toolError("listing organization pull requests", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_pull_request_threads,
    "Retrieve a list of comment threads for a pull request.",
    {
      repositoryId: z
        .string()
        .describe("The ID or name of the repository where the pull request is located. When using a repository name instead of a GUID, the project parameter must also be provided."),
      pullRequestId: z.coerce.number().min(1).describe("The ID of the pull request for which to retrieve threads."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
      iteration: z.coerce.number().min(1).optional().describe("The iteration ID for which to retrieve threads. Optional, defaults to the latest iteration."),
      baseIteration: z.coerce.number().min(1).optional().describe("The base iteration ID for which to retrieve threads. Optional, defaults to the latest base iteration."),
      top: z.coerce.number().default(100).describe("The maximum number of threads to return after filtering."),
      skip: z.coerce.number().default(0).describe("The number of threads to skip after filtering."),
      fullResponse: z.boolean().optional().default(false).describe("Return full thread JSON response instead of trimmed data."),
      status: z
        .enum(getEnumKeys(CommentThreadStatus) as [string, ...string[]])
        .optional()
        .describe("Filter threads by status. If not specified, returns threads of all statuses."),
      authorEmail: z.string().optional().describe("Filter threads by the email of the thread author (first comment author)."),
      authorDisplayName: z.string().optional().describe("Filter threads by the display name of the thread author (first comment author). Case-insensitive partial matching."),
    },
    async ({ repositoryId, pullRequestId, project, iteration, baseIteration, top, skip, fullResponse, status, authorEmail, authorDisplayName }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        const threads = (await gitApi.getThreads(repositoryId, pullRequestId, project, iteration, baseIteration)) ?? [];

        let filteredThreads = threads;

        if (status !== undefined) {
          const statusValue = CommentThreadStatus[status as keyof typeof CommentThreadStatus];
          filteredThreads = filteredThreads.filter((thread) => thread.status === statusValue);
        }

        if (authorEmail !== undefined) {
          filteredThreads = filteredThreads.filter((thread) => {
            const firstComment = thread.comments?.[0];
            return firstComment?.author?.uniqueName?.toLowerCase() === authorEmail.toLowerCase();
          });
        }

        if (authorDisplayName !== undefined) {
          const lowerAuthorName = authorDisplayName.toLowerCase();
          filteredThreads = filteredThreads.filter((thread) => {
            const firstComment = thread.comments?.[0];
            return firstComment?.author?.displayName?.toLowerCase().includes(lowerAuthorName);
          });
        }

        const paginatedThreads = filteredThreads.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)).slice(skip, skip + top);

        if (fullResponse) {
          return jsonResult(paginatedThreads);
        }

        // Return trimmed thread data focusing on essential information
        const trimmedThreads = paginatedThreads.map((thread) => trimPullRequestThread(thread));

        return jsonResult(trimmedThreads);
      } catch (error) {
        return toolError("listing pull request threads", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_pull_request_thread_comments,
    "Retrieve a list of comments in a pull request thread.",
    {
      repositoryId: z
        .string()
        .describe("The ID or name of the repository where the pull request is located. When using a repository name instead of a GUID, the project parameter must also be provided."),
      pullRequestId: z.coerce.number().min(1).describe("The ID of the pull request for which to retrieve thread comments."),
      threadId: z.coerce.number().min(1).describe("The ID of the thread for which to retrieve comments."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
      top: z.coerce.number().default(100).describe("The maximum number of comments to return."),
      skip: z.coerce.number().default(0).describe("The number of comments to skip."),
      fullResponse: z.boolean().optional().default(false).describe("Return full comment JSON response instead of trimmed data."),
    },
    async ({ repositoryId, pullRequestId, threadId, project, top, skip, fullResponse }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        // Get thread comments - GitApi uses getComments for retrieving comments from a specific thread
        const comments = await gitApi.getComments(repositoryId, pullRequestId, threadId, project);

        const paginatedComments = comments?.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)).slice(skip, skip + top);

        if (fullResponse) {
          return jsonResult(paginatedComments);
        }

        // Return trimmed comment data focusing on essential information
        const trimmedComments = trimComments(paginatedComments);

        return jsonResult(trimmedComments);
      } catch (error) {
        return toolError("listing pull request thread comments", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_branches_by_repo,
    "Retrieve a list of branch names for a given repository. Returns an array of branch name strings, not full branch objects. Use repo_get_branch_by_name to get full details for a specific branch.",
    {
      repositoryId: z
        .string()
        .describe("The ID or name of the repository where the branches are located. When using a repository name instead of a GUID, the project parameter must also be provided."),
      top: z.coerce.number().default(100).describe("The maximum number of branches to return. Defaults to 100."),
      filterContains: z.string().optional().describe("Filter to find branches that contain this string in their name."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
    },
    async ({ repositoryId, top, filterContains, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const branches = await gitApi.getRefs(repositoryId, project, "heads/", undefined, undefined, undefined, undefined, undefined, filterContains);

        const filteredBranches = branchesFilterOutIrrelevantProperties(branches, top);

        return jsonResult(filteredBranches);
      } catch (error) {
        return toolError("listing branches", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_my_branches_by_repo,
    "Retrieve a list of my branch names for a given repository Id. Returns an array of branch name strings, not full branch objects. Use repo_get_branch_by_name to get full details for a specific branch.",
    {
      repositoryId: z
        .string()
        .describe("The ID or name of the repository where the branches are located. When using a repository name instead of a GUID, the project parameter must also be provided."),
      top: z.coerce.number().default(100).describe("The maximum number of branches to return."),
      filterContains: z.string().optional().describe("Filter to find branches that contain this string in their name."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
    },
    async ({ repositoryId, top, filterContains, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const branches = await gitApi.getRefs(repositoryId, project, "heads/", undefined, undefined, true, undefined, undefined, filterContains);

        const filteredBranches = branchesFilterOutIrrelevantProperties(branches, top);

        return jsonResult(filteredBranches);
      } catch (error) {
        return toolError("listing my branches", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.get_repo_by_name_or_id,
    "Get the repository by project and repository name or ID.",
    {
      project: z.string().describe("Project name or ID where the repository is located."),
      repositoryNameOrId: z.string().describe("Repository name or ID."),
    },
    async ({ project, repositoryNameOrId }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const repositories = await gitApi.getRepositories(project);

        const repository = repositories?.find((repo) => repo.name === repositoryNameOrId || repo.id === repositoryNameOrId);

        if (!repository) {
          return {
            content: [{ type: "text", text: `Repository ${repositoryNameOrId} not found in project ${project}` }],
            isError: true,
          };
        }

        return jsonResult(repository);
      } catch (error) {
        return toolError("getting repository", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.get_branch_by_name,
    "Get a branch by its name. Returns isError: true if the branch is not found.",
    {
      repositoryId: z.string().describe("The ID or name of the repository where the branch is located. When using a repository name instead of a GUID, the project parameter must also be provided."),
      branchName: z.string().describe("The name of the branch to retrieve, e.g., 'main' or 'feature-branch'."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
    },
    async ({ repositoryId, branchName, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const branches = await gitApi.getRefs(repositoryId, project, "heads/", false, false, undefined, false, undefined, branchName);
        const branch = branches.find((branch) => branch.name === `refs/heads/${branchName}` || branch.name === branchName);
        if (!branch) {
          return {
            content: [
              {
                type: "text",
                text: `Branch ${branchName} not found in repository ${repositoryId}`,
              },
            ],
            isError: true,
          };
        }
        return jsonResult(branch);
      } catch (error) {
        return toolError("getting branch", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.get_pull_request_by_id,
    "Get a pull request by its ID.",
    {
      repositoryId: z
        .string()
        .describe("The ID or name of the repository where the pull request is located. When using a repository name instead of a GUID, the project parameter must also be provided."),
      pullRequestId: z.coerce.number().min(1).describe("The ID of the pull request to retrieve."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
      includeWorkItemRefs: z.boolean().optional().default(false).describe("Whether to reference work items associated with the pull request."),
      includeLabels: z.boolean().optional().default(false).describe("Whether to include a summary of labels in the response."),
      includeChangedFiles: z.boolean().optional().default(false).describe("Whether to include the list of files changed in the pull request."),
    },
    async ({ repositoryId, pullRequestId, project, includeWorkItemRefs, includeLabels, includeChangedFiles }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const pullRequest = await gitApi.getPullRequest(repositoryId, pullRequestId, project, undefined, undefined, undefined, undefined, includeWorkItemRefs);

        let enhancedResponse: Record<string, unknown> = { ...pullRequest };

        if (includeLabels) {
          try {
            const projectId = pullRequest.repository?.project?.id;
            const projectName = pullRequest.repository?.project?.name;
            const labels = await gitApi.getPullRequestLabels(repositoryId, pullRequestId, projectName, projectId);

            const labelNames = labels.map((label) => label.name).filter((name) => name !== undefined);

            enhancedResponse = {
              ...enhancedResponse,
              labelSummary: {
                labels: labelNames,
                labelCount: labelNames.length,
              },
            };
          } catch (error) {
            console.warn(`Error fetching PR labels: ${errorMessage(error)}`);
            enhancedResponse = {
              ...enhancedResponse,
              labelSummary: {},
            };
          }
        }

        if (includeChangedFiles) {
          try {
            const iterations = await gitApi.getPullRequestIterations(repositoryId, pullRequestId, project);

            if (iterations?.length) {
              const latestIteration = iterations[iterations.length - 1];

              if (latestIteration.id != null) {
                const changes = await gitApi.getPullRequestIterationChanges(repositoryId, pullRequestId, latestIteration.id, project);

                enhancedResponse = {
                  ...enhancedResponse,
                  changedFilesSummary: {
                    changeEntries: changes?.changeEntries ?? [],
                    fileCount: changes?.changeEntries?.length ?? 0,
                    // What repo_create_pull_request_thread needs to anchor a comment to this diff.
                    firstComparingIteration: Math.max(0, latestIteration.id - 1),
                    secondComparingIteration: latestIteration.id,
                    nextSkip: changes?.nextSkip,
                    nextTop: changes?.nextTop,
                  },
                };
              } else {
                enhancedResponse = {
                  ...enhancedResponse,
                  changedFilesSummary: { changeEntries: [], fileCount: 0 },
                };
              }
            } else {
              enhancedResponse = {
                ...enhancedResponse,
                changedFilesSummary: { changeEntries: [], fileCount: 0 },
              };
            }
          } catch (error) {
            console.warn(`Error fetching PR changed files: ${errorMessage(error)}`);
            enhancedResponse = {
              ...enhancedResponse,
              changedFilesSummary: {},
            };
          }
        }

        return jsonResult(enhancedResponse);
      } catch (error) {
        return toolError("getting pull request", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.get_pull_request_changes,
    "Get the file changes (diff) for a pull request iteration with actual code diff content. Returns the code changes including line-by-line diffs made in the pull request.",
    {
      repositoryId: z.string().describe("The ID of the repository where the pull request is located."),
      pullRequestId: z.number().describe("The ID of the pull request to retrieve changes for."),
      iterationId: z.number().optional().describe("The iteration ID to get changes for. If not specified, gets changes for the latest iteration."),
      project: z.string().optional().describe("Project ID or project name (optional)"),
      top: z.number().optional().describe("Maximum number of files to include diffs for. Default is 100."),
      skip: z.number().optional().describe("Number of changes to skip for pagination."),
      compareTo: z.number().optional().describe("Iteration ID to compare against. If specified, returns changes between two iterations."),
      includeDiffs: z.boolean().optional().describe("Whether to include actual line-by-line diff content. Default is true. Set to false to get only file metadata."),
      includeLineContent: z
        .boolean()
        .optional()
        .describe(
          "Whether to include the actual line content from the changed files. Default is true. When true, fetches file content and includes the actual code lines that were added/removed/modified."
        ),
    },
    async ({ repositoryId, pullRequestId, iterationId, project, top, skip, compareTo, includeDiffs = true, includeLineContent = true }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        // If repositoryId is a name (not a GUID), we need a project to resolve it.
        // GUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(repositoryId);
        if (!isGuid && !project) {
          return {
            content: [
              {
                type: "text",
                text: "Error: When using a repository name instead of a GUID for repositoryId, the 'project' parameter is required. Please either provide the project name/ID, or use repo_get_repo_by_name_or_id to resolve the repository GUID first.",
              },
            ],
            isError: true,
          };
        }

        // If no iteration ID provided, get the latest iteration
        let targetIterationId = iterationId;
        let targetIteration;
        if (targetIterationId == null) {
          const iterations = await gitApi.getPullRequestIterations(repositoryId, pullRequestId, project);
          if (!iterations || iterations.length === 0) {
            return {
              content: [{ type: "text", text: "No iterations found for this pull request." }],
              isError: true,
            };
          }
          // Get the latest iteration
          targetIteration = iterations[iterations.length - 1];
          targetIterationId = targetIteration.id;
        } else {
          // Get the specific iteration
          targetIteration = await gitApi.getPullRequestIteration(repositoryId, pullRequestId, targetIterationId, project);
        }

        // Get the file change metadata
        const changes = await gitApi.getPullRequestIterationChanges(repositoryId, pullRequestId, targetIterationId ?? 1, project, top, skip, compareTo);

        // If includeDiffs is false, just return the metadata
        if (!includeDiffs) {
          return jsonResult(changes);
        }

        // Get actual diff content using getFileDiffs
        if (changes.changeEntries && changes.changeEntries.length > 0 && targetIteration) {
          // Determine base and target commits
          const baseCommitId = compareTo
            ? (await gitApi.getPullRequestIteration(repositoryId, pullRequestId, compareTo, project)).sourceRefCommit?.commitId
            : targetIteration.commonRefCommit?.commitId;
          const targetCommitId = targetIteration.sourceRefCommit?.commitId;

          if (baseCommitId && targetCommitId) {
            // Build FileDiffsCriteria with paths from changeEntries
            // Exclude added and deleted files as they don't have both versions to diff
            // changeType is a flags enum so use bitwise AND to check
            const fileDiffParams = changes.changeEntries
              .filter((entry) => {
                const ct = entry.changeType ?? 0;
                return entry.item?.path && !(ct & VersionControlChangeType.Add) && !(ct & VersionControlChangeType.Delete);
              })
              .map((entry) => {
                // Remove leading slash if present - Azure DevOps API expects relative paths
                const itemPath = entry.item?.path ?? "";
                const path = itemPath.startsWith("/") ? itemPath.substring(1) : itemPath;
                // For renamed/moved files, use the original path from the change entry
                const origPath = entry.originalPath ? (entry.originalPath.startsWith("/") ? entry.originalPath.substring(1) : entry.originalPath) : path;
                return {
                  path: path,
                  originalPath: origPath,
                };
              });

            try {
              // Fetch diffs for modified files. Add/Delete files are excluded from getFileDiffs
              // because they don't have two versions to compare; their content is fetched
              // separately below via getItemText when includeLineContent is true.
              let fileDiffs: any[] = [];
              if (fileDiffParams.length > 0) {
                // Azure DevOps getFileDiffs API accepts max 10 files per request
                const FILE_DIFF_BATCH_SIZE = 10;
                for (let i = 0; i < fileDiffParams.length; i += FILE_DIFF_BATCH_SIZE) {
                  const batch = fileDiffParams.slice(i, i + FILE_DIFF_BATCH_SIZE);
                  const batchDiffs = await gitApi.getFileDiffs(
                    {
                      baseVersionCommit: baseCommitId,
                      targetVersionCommit: targetCommitId,
                      fileDiffParams: batch,
                    },
                    project || "",
                    repositoryId
                  );
                  fileDiffs = fileDiffs.concat(batchDiffs);
                }
              }

              // Merge diff content with change metadata.
              // Added/deleted entries get diff: null here and are enriched below.
              const enrichedChanges = {
                ...changes,
                changeEntries: changes.changeEntries.map((entry) => {
                  // Normalize path for comparison (remove leading slash)
                  const entryPath = entry.item?.path?.startsWith("/") ? entry.item.path.substring(1) : entry.item?.path;
                  const matchingDiff = fileDiffs.find((diff) => diff.path === entryPath);
                  return {
                    ...entry,
                    diff: matchingDiff || null,
                  };
                }),
              };

              // If includeLineContent is true, fetch actual file content with concurrency limit
              if (includeLineContent && enrichedChanges.changeEntries) {
                const CONCURRENCY_LIMIT = 10;
                const entriesWithContent = [...enrichedChanges.changeEntries];
                for (let i = 0; i < entriesWithContent.length; i += CONCURRENCY_LIMIT) {
                  const batch = entriesWithContent.slice(i, i + CONCURRENCY_LIMIT);
                  const batchResults = await Promise.all(
                    batch.map(async (entry) => {
                      const ct = entry.changeType ?? 0;
                      const isAdd = !!(ct & VersionControlChangeType.Add);
                      const isDelete = !!(ct & VersionControlChangeType.Delete);

                      const entryPath = entry.item?.path ? (entry.item.path.startsWith("/") ? entry.item.path.substring(1) : entry.item.path) : undefined;
                      // For deleted files ADO sets item.path to null and puts the path in originalPath only.
                      // Normalise originalPath once and use it as the fallback throughout.
                      const normalizedOriginalPath = entry.originalPath ? (entry.originalPath.startsWith("/") ? entry.originalPath.substring(1) : entry.originalPath) : undefined;
                      // effectivePath is what we use as the "current" path for API calls / early-exit guard.
                      // For additions/modifications it's item.path; for deletions it's originalPath.
                      const effectivePath = entryPath ?? normalizedOriginalPath;

                      if (!effectivePath) {
                        return entry;
                      }

                      // Handle added files: fetch full content at target commit and create synthetic diff
                      if (isAdd && !entry.diff) {
                        try {
                          const targetStream = await gitApi
                            .getItemText(repositoryId, effectivePath, project, undefined, undefined, undefined, undefined, undefined, { version: targetCommitId, versionType: GitVersionType.Commit })
                            .catch(() => null);
                          if (targetStream) {
                            const targetText = await streamToString(targetStream);
                            const targetLines = targetText.split(/\r?\n/);
                            return {
                              ...entry,
                              diff: {
                                path: effectivePath,
                                originalPath: null,
                                lineDiffBlocks: [
                                  {
                                    changeType: 1, // Add
                                    originalLineNumberStart: 0,
                                    originalLinesCount: 0,
                                    modifiedLineNumberStart: 1,
                                    modifiedLinesCount: targetLines.length,
                                    modifiedLines: targetLines,
                                  },
                                ],
                              },
                            };
                          }
                        } catch (addError) {
                          return {
                            ...entry,
                            _contentFetchError: `Failed to fetch added file content: ${errorMessage(addError)}`,
                          };
                        }
                        return entry;
                      }

                      // Handle deleted files: fetch full content at base commit and create synthetic diff.
                      // basePath prefers originalPath (the pre-deletion path); falls back to effectivePath.
                      if (isDelete && !entry.diff) {
                        try {
                          const basePath = normalizedOriginalPath ?? effectivePath;
                          const baseStream = await gitApi
                            .getItemText(repositoryId, basePath, project, undefined, undefined, undefined, undefined, undefined, { version: baseCommitId, versionType: GitVersionType.Commit })
                            .catch(() => null);
                          if (baseStream) {
                            const baseText = await streamToString(baseStream);
                            const baseLines = baseText.split(/\r?\n/);
                            return {
                              ...entry,
                              diff: {
                                path: null,
                                originalPath: basePath,
                                lineDiffBlocks: [
                                  {
                                    changeType: 2, // Delete
                                    originalLineNumberStart: 1,
                                    originalLinesCount: baseLines.length,
                                    modifiedLineNumberStart: 0,
                                    modifiedLinesCount: 0,
                                    originalLines: baseLines,
                                  },
                                ],
                              },
                            };
                          }
                        } catch (delError) {
                          return {
                            ...entry,
                            _contentFetchError: `Failed to fetch deleted file content: ${errorMessage(delError)}`,
                          };
                        }
                        return entry;
                      }

                      // For modified/renamed files, skip if no diff blocks
                      if (!entry.diff?.lineDiffBlocks || entry.diff.lineDiffBlocks.length === 0) {
                        return entry;
                      }

                      // For renamed/moved files, the base version is at the original path
                      const basePath = normalizedOriginalPath ?? effectivePath;

                      try {
                        // Fetch file content at both commits
                        const [baseContent, targetContent] = await Promise.all([
                          // Base version (original) - use basePath for renamed files
                          gitApi
                            .getItemText(repositoryId, basePath, project, undefined, undefined, undefined, undefined, undefined, { version: baseCommitId, versionType: GitVersionType.Commit })
                            .catch(() => null),
                          // Target version (modified)
                          gitApi
                            .getItemText(repositoryId, effectivePath, project, undefined, undefined, undefined, undefined, undefined, { version: targetCommitId, versionType: GitVersionType.Commit })
                            .catch(() => null),
                        ]);

                        // Convert streams to text
                        const baseText = baseContent ? await streamToString(baseContent) : "";
                        const targetText = targetContent ? await streamToString(targetContent) : "";

                        // Check if response is an Azure DevOps error (returned as JSON in the stream)
                        const checkForApiError = (text: string, label: string) => {
                          if (text.startsWith("{")) {
                            try {
                              const parsed = JSON.parse(text);
                              if (parsed.$id && parsed.innerException !== undefined) {
                                throw new Error(`Failed to fetch ${label} file content: ${parsed.message || text}`);
                              }
                            } catch (e) {
                              if (e instanceof Error && e.message.startsWith("Failed to fetch")) throw e;
                              // Not valid JSON or not an error response — treat as legitimate content
                            }
                          }
                        };
                        checkForApiError(baseText, "base");
                        checkForApiError(targetText, "target");

                        // Split into lines
                        const baseLines = baseText.split(/\r?\n/);
                        const targetLines = targetText.split(/\r?\n/);

                        // Enrich each lineDiffBlock with actual line content
                        const enrichedDiff = {
                          ...entry.diff,
                          lineDiffBlocks: entry.diff.lineDiffBlocks?.map((block: any) => {
                            const enrichedBlock: any = { ...block };

                            // Add original (base) lines if they exist
                            if (block.originalLineNumberStart && block.originalLinesCount) {
                              const startIdx = block.originalLineNumberStart - 1;
                              const endIdx = startIdx + block.originalLinesCount;
                              enrichedBlock.originalLines = baseLines.slice(startIdx, endIdx);
                            }

                            // Add modified (target) lines if they exist
                            if (block.modifiedLineNumberStart && block.modifiedLinesCount) {
                              const startIdx = block.modifiedLineNumberStart - 1;
                              const endIdx = startIdx + block.modifiedLinesCount;
                              enrichedBlock.modifiedLines = targetLines.slice(startIdx, endIdx);
                            }

                            return enrichedBlock;
                          }),
                        };

                        return {
                          ...entry,
                          diff: enrichedDiff,
                        };
                      } catch (contentError) {
                        // If content fetch fails, return entry with error
                        return {
                          ...entry,
                          _contentFetchError: `Failed to fetch line content: ${errorMessage(contentError)}`,
                        };
                      }
                    })
                  );
                  // Write batch results back into the array
                  for (let j = 0; j < batchResults.length; j++) {
                    entriesWithContent[i + j] = batchResults[j];
                  }
                }

                enrichedChanges.changeEntries = entriesWithContent;
              }

              return jsonResult(enrichedChanges);
            } catch (diffError) {
              // If diff fetching fails, return metadata with error info
              return jsonResult({
                ...changes,
                _diffError: `Failed to fetch diff content: ${errorMessage(diffError)}`,
                _note: "Returned metadata only",
              });
            }
          }
        }

        // Fallback: return metadata if we couldn't get diffs
        return jsonResult(changes);
      } catch (error) {
        return toolError("getting pull request changes", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.reply_to_comment,
    "Replies to a specific comment on a pull request.",
    {
      repositoryId: z
        .string()
        .describe("The ID or name of the repository where the pull request is located. When using a repository name instead of a GUID, the project parameter must also be provided."),
      pullRequestId: z.coerce.number().min(1).describe("The ID of the pull request where the comment thread exists."),
      threadId: z.coerce.number().min(1).describe("The ID of the thread to which the comment will be added."),
      content: z.string().describe("The content of the comment to be added."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
      fullResponse: z.boolean().optional().default(false).describe("Return full comment JSON response instead of a simple confirmation message."),
    },
    async ({ repositoryId, pullRequestId, threadId, content, project, fullResponse }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const comment = await gitApi.createComment({ content, commentType: 1 }, repositoryId, pullRequestId, threadId, project);

        // Check if the comment was successfully created
        if (!comment) {
          return {
            content: [{ type: "text", text: `Error: Failed to add comment to thread ${threadId}. The comment was not created successfully.` }],
            isError: true,
          };
        }

        if (fullResponse) {
          return jsonResult(comment);
        }

        return {
          content: [{ type: "text", text: `Comment successfully added to thread ${threadId}.` }],
        };
      } catch (error) {
        return toolError("replying to comment", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.create_pull_request_thread,
    "Creates a new comment thread on a pull request.",
    {
      repositoryId: z
        .string()
        .describe("The ID or name of the repository where the pull request is located. When using a repository name instead of a GUID, the project parameter must also be provided."),
      pullRequestId: z.coerce.number().min(1).describe("The ID of the pull request where the comment thread exists."),
      content: z.string().describe("The content of the comment to be added."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
      filePath: z.string().optional().describe("The path of the file where the comment thread will be created. (optional)"),
      status: z
        .enum(getEnumKeys(CommentThreadStatus) as [string, ...string[]])
        .optional()
        .default(CommentThreadStatus[CommentThreadStatus.Active])
        .describe("The status of the comment thread. Defaults to 'Active'."),
      rightFileStartLine: z.coerce
        .number()
        .min(1)
        .optional()
        .describe("Position of first character of the thread's span in right file. The line number of a thread's position. Starts at 1. (optional)"),
      rightFileStartOffset: z
        .number()
        .optional()
        .describe(
          "Start character offset of the thread's span within the line in the right file. The character offset of a thread's position inside of a line. Starts at 1. Must be set if rightFileStartLine is also specified. (optional)"
        ),
      rightFileEndLine: z
        .number()
        .optional()
        .describe(
          "Position of last character of the thread's span in right file. The line number of a thread's position. Starts at 1. Must be set if rightFileStartLine is also specified. (optional)"
        ),
      rightFileEndOffset: z
        .number()
        .optional()
        .describe(
          "Exclusive end character offset of the thread's span within the line in the right file. This value is exclusive: to cover the entire line, set it to (length of the original line text) + 1. When posting a suggestion, always calculate this from the existing file content being replaced, not from the suggestion or replacement text. Must be set if rightFileEndLine is also specified. (optional)"
        ),
      changeTrackingId: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe("The file's changeTrackingId from the pull request's iteration changes. Anchors the comment to that file in a specific diff; pass together with both comparing iterations."),
      firstComparingIteration: z.coerce.number().int().min(0).optional().describe("The iteration on the left side of the diff."),
      secondComparingIteration: z.coerce.number().int().min(1).optional().describe("The iteration on the right side of the diff."),
    },
    async ({
      repositoryId,
      pullRequestId,
      content,
      project,
      filePath,
      status,
      rightFileStartLine,
      rightFileStartOffset,
      rightFileEndLine,
      rightFileEndOffset,
      changeTrackingId,
      firstComparingIteration,
      secondComparingIteration,
    }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        const normalizedFilePath = filePath && !filePath.startsWith("/") ? `/${filePath}` : filePath;
        const threadContext: CommentThreadContext = { filePath: normalizedFilePath };

        if (rightFileStartLine !== undefined) {
          if (rightFileStartLine < 1) {
            return {
              content: [{ type: "text", text: "rightFileStartLine must be greater than or equal to 1." }],
              isError: true,
            };
          }

          threadContext.rightFileStart = { line: rightFileStartLine };

          if (rightFileStartOffset !== undefined) {
            if (rightFileStartOffset < 1) {
              return {
                content: [{ type: "text", text: "rightFileStartOffset must be greater than or equal to 1." }],
                isError: true,
              };
            }

            threadContext.rightFileStart.offset = rightFileStartOffset;
          }
        }

        if (rightFileEndLine !== undefined) {
          if (rightFileStartLine === undefined) {
            return {
              content: [{ type: "text", text: "rightFileEndLine must only be specified if rightFileStartLine is also specified." }],
              isError: true,
            };
          }

          if (rightFileEndLine < 1) {
            return {
              content: [{ type: "text", text: "rightFileEndLine must be greater than or equal to 1." }],
              isError: true,
            };
          }

          if (rightFileEndOffset === undefined) {
            return {
              content: [{ type: "text", text: "rightFileEndOffset must be specified if rightFileEndLine is specified." }],
              isError: true,
            };
          }

          threadContext.rightFileEnd = { line: rightFileEndLine };

          if (rightFileEndOffset !== undefined) {
            if (rightFileEndOffset < 1) {
              return {
                content: [{ type: "text", text: "rightFileEndOffset must be greater than or equal to 1." }],
                isError: true,
              };
            }

            threadContext.rightFileEnd.offset = rightFileEndOffset;
          }
        }

        if (rightFileEndOffset !== undefined && rightFileEndLine === undefined) {
          return {
            content: [{ type: "text", text: "rightFileEndLine must be specified if rightFileEndOffset is specified." }],
            isError: true,
          };
        }

        if (rightFileStartLine !== undefined && rightFileStartOffset !== undefined) {
          if (rightFileEndLine === undefined || rightFileEndOffset === undefined) {
            return {
              content: [{ type: "text", text: "rightFileEndLine and rightFileEndOffset must both be specified when rightFileStartLine and rightFileStartOffset are both specified." }],
              isError: true,
            };
          }
        }

        if (rightFileStartLine !== undefined && rightFileEndLine !== undefined && rightFileStartLine === rightFileEndLine) {
          if (rightFileEndOffset !== undefined && rightFileStartOffset !== undefined && rightFileEndOffset < rightFileStartOffset) {
            return {
              content: [{ type: "text", text: "rightFileEndOffset must be greater than or equal to rightFileStartOffset when both are on the same line." }],
              isError: true,
            };
          }
        }

        // Without an iteration context the comment attaches to the file as it is
        // now, and drifts off its line once another push changes it (upstream #1513).
        const iterationContextValues = [changeTrackingId, firstComparingIteration, secondComparingIteration];
        if (iterationContextValues.some((value) => value !== undefined) && iterationContextValues.some((value) => value === undefined)) {
          return {
            content: [{ type: "text", text: "changeTrackingId, firstComparingIteration, and secondComparingIteration must all be specified together." }],
            isError: true,
          };
        }
        const pullRequestThreadContext =
          changeTrackingId !== undefined && firstComparingIteration !== undefined && secondComparingIteration !== undefined
            ? { changeTrackingId, iterationContext: { firstComparingIteration, secondComparingIteration } }
            : undefined;

        const thread = await gitApi.createThread(
          { comments: [{ content: content, commentType: 1 }], threadContext: threadContext, pullRequestThreadContext, status: CommentThreadStatus[status as keyof typeof CommentThreadStatus] },
          repositoryId,
          pullRequestId,
          project
        );

        const trimmedThread = trimPullRequestThread(thread);

        return jsonResult(trimmedThread);
      } catch (error) {
        return toolError("creating pull request thread", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.update_pull_request_comment,
    "Edit the text of an existing comment in a pull request thread. Use repo_update_pull_request_thread to change the thread's status instead.",
    {
      repositoryId: z.string().describe("The ID or name of the repository. When using a name instead of a GUID, pass 'project' too."),
      pullRequestId: z.number().describe("The ID of the pull request."),
      threadId: z.number().describe("The ID of the thread that holds the comment."),
      commentId: z.number().describe("The ID of the comment to edit."),
      content: z.string().min(1).describe("The new comment text."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
      fullResponse: z.boolean().optional().default(false).describe("Return the full updated comment instead of a confirmation."),
    },
    async ({ repositoryId, pullRequestId, threadId, commentId, content, project, fullResponse }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        // Ported from upstream microsoft/azure-devops-mcp#1568.
        const comment = await gitApi.updateComment({ content }, repositoryId, pullRequestId, threadId, commentId, project);
        if (!comment) {
          return { content: [{ type: "text", text: `Error: Failed to update comment ${commentId} in thread ${threadId}. The comment was not updated.` }], isError: true };
        }
        if (fullResponse) {
          return jsonResult(comment);
        }
        return { content: [{ type: "text", text: `Comment ${commentId} updated in thread ${threadId}.` }] };
      } catch (error) {
        return toolError("updating pull request comment", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.update_pull_request_thread,
    "Updates an existing comment thread on a pull request.",
    {
      repositoryId: z
        .string()
        .describe("The ID or name of the repository where the pull request is located. When using a repository name instead of a GUID, the project parameter must also be provided."),
      pullRequestId: z.coerce.number().min(1).describe("The ID of the pull request where the comment thread exists."),
      threadId: z.coerce.number().min(1).describe("The ID of the thread to update."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
      status: z
        .enum(getEnumKeys(CommentThreadStatus) as [string, ...string[]])
        .optional()
        .describe("The new status for the comment thread."),
    },
    async ({ repositoryId, pullRequestId, threadId, project, status }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const updateRequest: Record<string, unknown> = {};

        if (status !== undefined) {
          updateRequest.status = CommentThreadStatus[status as keyof typeof CommentThreadStatus];
        }

        if (Object.keys(updateRequest).length === 0) {
          return {
            content: [{ type: "text", text: "Error: At least one field (status) must be provided for update." }],
            isError: true,
          };
        }

        const thread = await gitApi.updateThread(updateRequest, repositoryId, pullRequestId, threadId, project);

        if (!thread) {
          return {
            content: [{ type: "text", text: `Error: Failed to update thread ${threadId}. The thread was not updated successfully.` }],
            isError: true,
          };
        }

        const trimmedThread = trimPullRequestThread(thread);

        return jsonResult(trimmedThread);
      } catch (error) {
        return toolError("updating pull request thread", error);
      }
    }
  );

  const gitVersionTypeStrings = Object.values(GitVersionType).filter((value): value is string => typeof value === "string");

  registerTool(
    server,
    REPO_TOOLS.search_commits,
    "Search for commits in a repository with comprehensive filtering capabilities. Supports searching by description/comment text, time range, author, committer, specific commit IDs, and more. This is the unified tool for all commit search operations.",
    {
      project: z.string().describe("Project name or ID"),
      repository: z.string().describe("Repository name or ID"),
      // Existing parameters
      fromCommit: z.string().optional().describe("Starting commit ID"),
      toCommit: z.string().optional().describe("Ending commit ID"),
      version: z.string().optional().describe("The name of the branch, tag or commit to filter commits by"),
      versionType: z
        .enum(gitVersionTypeStrings as [string, ...string[]])
        .optional()
        .default(GitVersionType[GitVersionType.Branch])
        .describe("The meaning of the version parameter, e.g., branch, tag or commit"),
      skip: z.coerce.number().optional().default(0).describe("Number of commits to skip"),
      top: z.coerce.number().optional().default(10).describe("Maximum number of commits to return"),
      includeLinks: z.boolean().optional().default(false).describe("Include commit links"),
      includeWorkItems: z.boolean().optional().default(false).describe("Include associated work items"),
      // Enhanced search parameters
      searchText: z.string().optional().describe("Search text to filter commits by description/comment. Supports partial matching."),
      author: z.string().optional().describe("Filter commits by author email or display name"),
      authorEmail: z.string().optional().describe("Filter commits by exact author email address"),
      committer: z.string().optional().describe("Filter commits by committer email or display name"),
      committerEmail: z.string().optional().describe("Filter commits by exact committer email address"),
      fromDate: z.string().optional().describe("Filter commits from this date (ISO 8601 format, e.g., '2024-01-01T00:00:00Z')"),
      toDate: z.string().optional().describe("Filter commits to this date (ISO 8601 format, e.g., '2024-12-31T23:59:59Z')"),
      commitIds: z.array(z.string()).optional().describe("Array of specific commit IDs to retrieve. When provided, other filters are ignored except top/skip."),
      historySimplificationMode: z.enum(["FirstParent", "SimplifyMerges", "FullHistory", "FullHistorySimplifyMerges"]).optional().describe("How to simplify the commit history"),
    },
    async ({
      project,
      repository,
      fromCommit,
      toCommit,
      version,
      versionType,
      skip,
      top,
      includeLinks,
      includeWorkItems,
      searchText,
      author,
      authorEmail,
      committer,
      committerEmail,
      fromDate,
      toDate,
      commitIds,
      historySimplificationMode,
    }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        // If specific commit IDs are provided, use getCommits with commit ID filtering
        if (commitIds && commitIds.length > 0) {
          const commits = [];
          const batchSize = Math.min(top || 10, commitIds.length);
          const startIndex = skip || 0;
          const endIndex = Math.min(startIndex + batchSize, commitIds.length);

          // Process commits in the requested range
          const requestedCommitIds = commitIds.slice(startIndex, endIndex);

          // Use getCommits for each commit ID to maintain consistency
          for (const commitId of requestedCommitIds) {
            try {
              const searchCriteria: GitQueryCommitsCriteria = {
                includeLinks: includeLinks,
                includeWorkItems: includeWorkItems,
                fromCommitId: commitId,
                toCommitId: commitId,
              };

              const commitResults = await gitApi.getCommits(repository, searchCriteria, project, 0, 1);

              if (commitResults && commitResults.length > 0) {
                commits.push(commitResults[0]);
              }
            } catch (error) {
              // Log error but continue with other commits
              console.warn(`Failed to retrieve commit ${commitId}: ${errorMessage(error)}`);
              // Add error information to result instead of failing completely
              commits.push({
                commitId: commitId,
                error: `Failed to retrieve: ${errorMessage(error)}`,
              });
            }
          }

          return jsonResult(commits);
        }

        const searchCriteria: GitQueryCommitsCriteria = {
          fromCommitId: fromCommit,
          toCommitId: toCommit,
          includeLinks: includeLinks,
          includeWorkItems: includeWorkItems,
        };

        // Add author filter
        if (author) {
          searchCriteria.author = author;
        }

        // Add date range filters (ADO API expects ISO string format)
        if (fromDate) {
          searchCriteria.fromDate = fromDate;
        }
        if (toDate) {
          searchCriteria.toDate = toDate;
        }

        // Add history simplification if specified
        if (historySimplificationMode) {
          // Note: This parameter might not be directly supported by all ADO API versions
          // but we'll include it in the criteria for forward compatibility
          const extendedCriteria = searchCriteria as GitQueryCommitsCriteria & { historySimplificationMode?: string };
          extendedCriteria.historySimplificationMode = historySimplificationMode;
        }

        if (version) {
          const itemVersion: GitVersionDescriptor = {
            version: version,
            versionType: GitVersionType[versionType as keyof typeof GitVersionType],
          };
          searchCriteria.itemVersion = itemVersion;
        }

        const commits = await gitApi.getCommits(repository, searchCriteria, project, skip, top);

        // Additional client-side filtering for enhanced search capabilities
        let filteredCommits = commits;

        // Filter by search text in commit message if not handled by API
        if (searchText && filteredCommits) {
          filteredCommits = filteredCommits.filter((commit) => commit.comment?.toLowerCase().includes(searchText.toLowerCase()));
        }

        // Filter by author email if specified
        if (authorEmail && filteredCommits) {
          filteredCommits = filteredCommits.filter((commit) => commit.author?.email?.toLowerCase() === authorEmail.toLowerCase());
        }

        // Filter by committer if specified
        if (committer && filteredCommits) {
          filteredCommits = filteredCommits.filter(
            (commit) => commit.committer?.name?.toLowerCase().includes(committer.toLowerCase()) || commit.committer?.email?.toLowerCase().includes(committer.toLowerCase())
          );
        }

        // Filter by committer email if specified
        if (committerEmail && filteredCommits) {
          filteredCommits = filteredCommits.filter((commit) => commit.committer?.email?.toLowerCase() === committerEmail.toLowerCase());
        }

        return jsonResult(filteredCommits);
      } catch (error) {
        return toolError("searching commits", error);
      }
    }
  );

  const pullRequestQueryTypesStrings = Object.values(GitPullRequestQueryType).filter((value): value is string => typeof value === "string");

  registerTool(
    server,
    REPO_TOOLS.list_pull_requests_by_commits,
    "Lists pull requests by commit IDs to find which pull requests contain specific commits",
    {
      project: z.string().describe("Project name or ID"),
      repository: z.string().describe("Repository name or ID"),
      commits: z.array(z.string()).describe("Array of commit IDs to query for"),
      queryType: z
        .enum(pullRequestQueryTypesStrings as [string, ...string[]])
        .optional()
        .default(GitPullRequestQueryType[GitPullRequestQueryType.LastMergeCommit])
        .describe("Type of query to perform"),
    },
    async ({ project, repository, commits, queryType }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        const query: GitPullRequestQuery = {
          queries: [
            {
              items: commits,
              type: GitPullRequestQueryType[queryType as keyof typeof GitPullRequestQueryType],
            } as GitPullRequestQueryInput,
          ],
        };

        const queryResult = await gitApi.getPullRequestQuery(query, repository, project);

        return jsonResult(queryResult);
      } catch (error) {
        return toolError("querying pull requests by commits", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.vote_pull_request,
    "Cast a vote on a pull request. Automatically adds the current user as a reviewer if they are not already one.",
    {
      repositoryId: z.string().describe("The ID or name of the repository. When using a repository name instead of a GUID, the project parameter must also be provided."),
      pullRequestId: z.coerce.number().min(1).describe("The ID of the pull request."),
      vote: z.enum(["Approved", "ApprovedWithSuggestions", "NoVote", "WaitingForAuthor", "Rejected"]).describe("The vote to cast: Approved(10), Suggestions(5), None(0), Waiting(-5), Rejected(-10)."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
    },
    async ({ repositoryId, pullRequestId, vote, project }) => {
      const connection = await connectionProvider();
      const gitApi = await connection.getGitApi();

      const userDetails = await getCurrentUserDetails(tokenProvider, connectionProvider, userAgentProvider);
      const userId = userDetails.authenticatedUser.id;

      if (!userId) {
        throw new Error("Could not determine authenticated user ID.");
      }

      const voteMap: Record<string, number> = {
        Approved: 10,
        ApprovedWithSuggestions: 5,
        NoVote: 0,
        WaitingForAuthor: -5,
        Rejected: -10,
      };

      const existingReviewer = await gitApi.getPullRequestReviewer(repositoryId, pullRequestId, userId, project).catch((error) => {
        if (!(error instanceof Error) || !/not found|reviewer does not exist/i.test(error.message)) {
          throw error;
        }

        return undefined;
      });

      const reviewerPayload = {
        vote: voteMap[vote],
        id: userId,
        ...(existingReviewer?.isRequired !== undefined ? { isRequired: existingReviewer.isRequired } : {}),
      };

      await gitApi.createPullRequestReviewer(reviewerPayload as any, repositoryId, pullRequestId, userId, project);

      return {
        content: [
          {
            type: "text",
            text: `Successfully cast vote '${vote}' on PR #${pullRequestId}.`,
          },
        ],
      };
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_directory,
    "List files and folders in a directory within a repository. Useful for exploring the structure of a codebase or finding related files. Returns isError: true if the path is not found.",
    {
      repositoryId: z.string().describe("The ID or name of the repository."),
      path: z.string().optional().default("/").describe("The directory path to list (e.g., '/src' or '/src/components'). Defaults to repository root."),
      project: z.string().optional().describe("Project ID or name. Required if repositoryId is a name rather than a GUID."),
      version: z.string().optional().describe("The version identifier - branch name (e.g., 'main'), tag name, or commit SHA. Defaults to the repository's default branch."),
      versionType: z.enum(["Branch", "Commit", "Tag"]).optional().default("Branch").describe("The type of version identifier: 'Branch', 'Commit', or 'Tag'. Defaults to 'Branch'."),
      recursive: z.boolean().optional().default(false).describe("Whether to list items recursively. Defaults to false."),
      recursionDepth: z.coerce.number().min(1).optional().default(1).describe("Maximum depth for recursive listing (1-10). Only applies when recursive is true. Defaults to 1."),
    },
    async ({ repositoryId, path, project, version, versionType, recursive, recursionDepth }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        const versionDescriptor = buildVersionDescriptor(version, versionType);
        const clampedDepth = Math.min(Math.max(recursionDepth || 1, 1), 10);

        let recursionType = VersionControlRecursionType.OneLevel;

        if (recursive) {
          recursionType = VersionControlRecursionType.Full;
        }

        const items = await gitApi.getItems(repositoryId, project, path, recursionType, true, false, false, false, versionDescriptor);

        if (!items || items.length === 0) {
          return {
            content: [{ type: "text", text: `No items found at path: ${path}. The path may not exist in the repository.` }],
            isError: true,
          };
        }

        let filteredItems = items;

        if (recursive && clampedDepth < 10) {
          const basePath = path === "/" ? "" : path;
          const baseDepth = basePath.split("/").filter((p) => p).length;

          filteredItems = items.filter((item) => {
            if (!item.path) return false;
            const itemDepth = item.path.split("/").filter((p) => p).length;
            return itemDepth <= baseDepth + clampedDepth;
          });
        }

        const formattedItems = filteredItems.map((item) => ({
          path: item.path,
          isFolder: item.isFolder,
          gitObjectType: item.gitObjectType,
          commitId: item.commitId,
          contentMetadata: item.contentMetadata
            ? {
                contentType: item.contentMetadata.contentType,
                fileName: item.contentMetadata.fileName,
              }
            : undefined,
        }));

        const response = {
          count: formattedItems.length,
          path: path,
          recursive: recursive,
          recursionDepth: recursive ? clampedDepth : undefined,
          items: formattedItems,
        };

        return jsonResult(response);
      } catch (error) {
        return toolError("listing directory", error);
      }
    }
  );

  // ── Get file content at a specific version (branch, tag, or commit) ──
  const fileVersionTypeStrings = getEnumKeys(GitVersionType);

  registerTool(
    server,
    REPO_TOOLS.get_file_content,
    "Get the content of a file from a Git repository at a specific version (branch, tag, or commit SHA). " +
      "Useful for reading source files from PR branches, specific commits, or tags without having them checked out locally. " +
      "Returns isError: true if the file is not found.",
    {
      repositoryId: z.string().describe("The ID (GUID) or name of the repository."),
      path: z.string().describe("The full path to the file in the repository, e.g., '/src/main.ts' or 'src/main.ts'."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a name."),
      version: z
        .string()
        .optional()
        .describe("Version string: branch name (e.g. 'main'), tag name, or commit SHA. " + "Defaults to the repository's default branch if not specified."),
      versionType: z
        .enum(fileVersionTypeStrings as [string, ...string[]])
        .optional()
        .default("Commit")
        .describe("How to interpret the 'version' parameter. Defaults to 'Commit'."),
    },
    async ({ repositoryId, path, project, version, versionType }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        // Build the version descriptor if a version was specified
        const versionDescriptor: GitVersionDescriptor | undefined = version
          ? {
              version: version,
              versionType: GitVersionType[versionType as keyof typeof GitVersionType],
            }
          : undefined;

        // getItemText returns a ReadableStream of the file content as text
        const stream = await gitApi.getItemText(
          repositoryId,
          path,
          project,
          undefined, // scopePath
          undefined, // recursionLevel
          undefined, // includeContentMetadata
          undefined, // latestProcessedChange
          false, // download
          versionDescriptor,
          true // includeContent
        );

        const content = await streamToString(stream);

        const streamError = extractAdoStreamError(content);
        if (streamError) {
          return {
            content: [{ type: "text", text: `Error getting file content for '${path}': ${streamError}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: content }],
        };
      } catch (error) {
        return toolError(`getting file content for '${path}'`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.push_changes,
    "Commit and push one or more file changes (add/edit/delete) to a branch in a single commit. Can initialize an empty repository by pushing the first commit to its default branch (e.g. 'main'). For a name (not GUID) repositoryId, the project parameter is required.",
    {
      repositoryId: z.string().describe("The ID or name of the repository. When using a repository name instead of a GUID, the project parameter must also be provided."),
      branch: z
        .string()
        .default("main")
        .describe("The branch to commit to (without the 'refs/heads/' prefix), e.g. 'main'. Created if it does not yet exist (e.g. the first commit in an empty repository)."),
      commitMessage: z.string().describe("The commit message."),
      changes: z
        .array(
          z.object({
            changeType: z.enum(["add", "edit", "delete"]).describe("The type of change: 'add' a new file, 'edit' an existing file, or 'delete' a file."),
            path: z.string().describe("The path of the file in the repository, e.g. '/README.md' or 'src/index.ts'."),
            content: z.string().optional().describe("The file content. Required for 'add' and 'edit'; ignored for 'delete'."),
            contentType: z.enum(["text", "base64"]).optional().default("text").describe("How 'content' is encoded: 'text' (raw UTF-8) or 'base64' (for binary files). Defaults to 'text'."),
          })
        )
        .min(1)
        .describe("The list of file changes to include in the commit."),
      project: z.string().optional().describe("Project ID or project name. Required when repositoryId is a repository name instead of a GUID."),
    },
    async ({ repositoryId, branch, commitMessage, changes, project }) => {
      try {
        for (const change of changes) {
          if (change.changeType !== "delete" && change.content === undefined) {
            return {
              content: [{ type: "text", text: `Error: change for '${change.path}' has changeType '${change.changeType}' but no content. Content is required for 'add' and 'edit'.` }],
              isError: true,
            };
          }
        }

        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();

        // Resolve the branch's current tip so the push is a fast-forward. When the
        // branch does not exist (e.g. an empty repository), an all-zero oldObjectId
        // tells the server to create it.
        const refName = `refs/heads/${branch}`;
        const refs = await gitApi.getRefs(repositoryId, project, "heads/", false, false, undefined, false, undefined, branch);
        const existingRef = refs?.find((r) => r.name === refName);
        const oldObjectId = existingRef?.objectId ?? "0000000000000000000000000000000000000000";

        const changeTypeMap = { add: VersionControlChangeType.Add, edit: VersionControlChangeType.Edit, delete: VersionControlChangeType.Delete } as const;

        const gitChanges: GitChange[] = changes.map((change) => {
          const gitChange: GitChange = {
            changeType: changeTypeMap[change.changeType],
            item: { path: change.path },
          };
          if (change.changeType !== "delete") {
            gitChange.newContent = {
              content: change.content,
              contentType: change.contentType === "base64" ? ItemContentType.Base64Encoded : ItemContentType.RawText,
            };
          }
          return gitChange;
        });

        const push: GitPush = {
          refUpdates: [{ name: refName, oldObjectId }],
          commits: [{ comment: commitMessage, changes: gitChanges }],
        };

        const result = await gitApi.createPush(push, repositoryId, project);

        if (!result) {
          return { content: [{ type: "text", text: "Push did not return a result" }], isError: true };
        }

        return jsonResult(result);
      } catch (error) {
        return toolError("pushing changes", error);
      }
    }
  );

  const repositoryIdParam = z.string().describe("The ID or name of the repository. When using a name instead of a GUID, pass 'project' too.");

  registerTool(
    server,
    REPO_TOOLS.list_tags,
    "List the tags of a repository.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      nameFilter: z.string().optional().describe("Return only tags whose name contains this text."),
      peelTags: z.boolean().default(false).describe("For annotated tags, also resolve the commit each one points at (peeledObjectId)."),
    },
    async ({ repositoryId, project, nameFilter, peelTags }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const refs = await gitApi.getRefs(repositoryId, project, "tags/", false, false, undefined, false, peelTags, nameFilter);
        return jsonResult(refs.map((ref) => ({ name: tagNameFromRef(ref.name), objectId: ref.objectId, peeledObjectId: ref.peeledObjectId })));
      } catch (error) {
        return toolError("listing tags", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.get_tag,
    "Get one tag of a repository. Annotated tags also report their message and who created them; lightweight tags are just a ref and report only the commit they point at.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      tagName: z.string().describe("The tag name, without the 'refs/tags/' prefix."),
    },
    async ({ repositoryId, project, tagName }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const refs = await gitApi.getRefs(repositoryId, project, "tags/", false, false, undefined, false, true, tagName);
        const ref = refs.find((candidate) => tagNameFromRef(candidate.name) === tagName);
        if (!ref?.objectId) {
          return { content: [{ type: "text", text: `Tag '${tagName}' not found in repository ${repositoryId}` }], isError: true };
        }

        // A lightweight tag's objectId is the commit itself, so there is no tag
        // object to read — the annotated lookup fails and the ref is the answer.
        let annotation;
        try {
          annotation = await gitApi.getAnnotatedTag(project, repositoryId, ref.objectId);
        } catch {
          annotation = undefined;
        }

        return jsonResult({
          name: tagName,
          objectId: ref.objectId,
          commitId: ref.peeledObjectId ?? ref.objectId,
          annotated: Boolean(annotation),
          message: annotation?.message,
          taggedBy: annotation?.taggedBy,
        });
      } catch (error) {
        return toolError(`getting tag '${tagName}'`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.create_tag,
    "Create an annotated tag on a commit. Creates both the tag object and the 'refs/tags/<name>' ref.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      tagName: z.string().describe("The tag name, without the 'refs/tags/' prefix, e.g. 'v1.4.0'."),
      commitId: z.string().describe("The full SHA of the commit to tag."),
      message: z.string().describe("The tag message."),
    },
    async ({ repositoryId, project, tagName, commitId, message }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const tag = await gitApi.createAnnotatedTag({ name: tagName, message, taggedObject: { objectId: commitId } }, project, repositoryId);
        return jsonResult(tag);
      } catch (error) {
        return toolError(`creating tag '${tagName}'`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.delete_tag,
    "Delete a tag from a repository. The tag object itself is left behind unreferenced; only the ref is removed.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      tagName: z.string().describe("The tag name, without the 'refs/tags/' prefix."),
    },
    async ({ repositoryId, project, tagName }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const refs = await gitApi.getRefs(repositoryId, project, "tags/", false, false, undefined, false, false, tagName);
        const ref = refs.find((candidate) => tagNameFromRef(candidate.name) === tagName);
        if (!ref?.objectId) {
          return { content: [{ type: "text", text: `Tag '${tagName}' not found in repository ${repositoryId}` }], isError: true };
        }

        const [result] = await gitApi.updateRefs([{ name: `refs/tags/${tagName}`, oldObjectId: ref.objectId, newObjectId: DELETED_OBJECT_ID }], repositoryId, project);
        // updateRefs reports per-ref failures in the result rather than throwing.
        if (!result?.success) {
          return { content: [{ type: "text", text: `Failed to delete tag '${tagName}': ${JSON.stringify(result)}` }], isError: true };
        }
        return jsonResult({ deleted: tagName, previousObjectId: ref.objectId });
      } catch (error) {
        return toolError(`deleting tag '${tagName}'`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_commit_statuses,
    "List the statuses posted against a commit — the build, scan and external check results that branch policies evaluate.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      commitId: z.string().describe("The full SHA of the commit."),
      top: z.number().optional().describe("Maximum number of statuses to return."),
      skip: z.number().optional().describe("Number of statuses to skip."),
      latestOnly: z.boolean().default(true).describe("Return only the most recent status per context, rather than the full history."),
    },
    async ({ repositoryId, project, commitId, top, skip, latestOnly }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const statuses = await gitApi.getStatuses(commitId, repositoryId, project, top, skip, latestOnly);
        return jsonResult(statuses);
      } catch (error) {
        return toolError(`listing statuses for commit ${commitId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.create_commit_status,
    "Post a status against a commit, e.g. to report an external check to a branch policy.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      commitId: z.string().describe("The full SHA of the commit to post against."),
      state: z.enum(getEnumKeys(GitStatusState) as [string, ...string[]]).describe("The outcome being reported."),
      name: z.string().describe("Name identifying this check, e.g. 'license-scan'. Together with genre it is the status context that a policy matches on."),
      genre: z.string().optional().describe("Namespace for the check, e.g. 'continuous-integration'. Omit for the default genre."),
      description: z.string().optional().describe("Human-readable summary of the outcome."),
      targetUrl: z.string().optional().describe("URL with the details behind the status."),
    },
    async ({ repositoryId, project, commitId, state, name, genre, description, targetUrl }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const status = await gitApi.createCommitStatus(
          {
            state: safeEnumConvert(GitStatusState, state),
            description,
            targetUrl,
            context: { name, genre },
          },
          commitId,
          repositoryId,
          project
        );
        return jsonResult(status);
      } catch (error) {
        return toolError(`creating a status on commit ${commitId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.create_repository,
    "Create an empty Git repository in a project.",
    {
      project: requiredProject,
      name: z.string().describe("Name for the new repository."),
      sourceRef: z.string().optional().describe("Ref to seed the repository from when forking, e.g. 'refs/heads/main'. Omit for an empty repository."),
      parentRepositoryId: z.string().optional().describe("ID of the repository to fork. Omit for a standalone repository."),
    },
    async ({ project, name, sourceRef, parentRepositoryId }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const repository = await gitApi.createRepository(
          {
            name,
            ...(parentRepositoryId ? { parentRepository: { id: parentRepositoryId, project: { name: project } } } : {}),
          },
          project,
          sourceRef
        );
        return jsonResult(repository);
      } catch (error) {
        return toolError(`creating repository '${name}'`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.delete_repository,
    "Delete a Git repository. Azure DevOps moves it to the project's recycle bin rather than erasing it, but every clone URL and pipeline pointing at it breaks immediately.",
    {
      repositoryId: z.string().describe("The GUID of the repository to delete. A name is not accepted here, to make an accidental deletion harder."),
      project: requiredProject,
    },
    async ({ repositoryId, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        await gitApi.deleteRepository(repositoryId, project);
        return jsonResult({ deleted: repositoryId, note: "Moved to the project's recycle bin." });
      } catch (error) {
        return toolError(`deleting repository ${repositoryId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_pull_request_labels,
    "List the labels on a pull request.",
    {
      repositoryId: repositoryIdParam,
      pullRequestId: z.number().describe("The ID of the pull request."),
      project: requiredProject,
    },
    async ({ repositoryId, pullRequestId, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const labels = await gitApi.getPullRequestLabels(repositoryId, pullRequestId, project);
        return jsonResult(labels.map((label) => ({ id: label.id, name: label.name, active: label.active })));
      } catch (error) {
        return toolError(`listing labels on pull request ${pullRequestId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.add_pull_request_label,
    "Add one label to a pull request, leaving its other labels alone. Use repo_update_pull_request when replacing the whole set.",
    {
      repositoryId: repositoryIdParam,
      pullRequestId: z.number().describe("The ID of the pull request."),
      project: requiredProject,
      label: z.string().describe("The label to add. Created if the project does not have it yet."),
    },
    async ({ repositoryId, pullRequestId, project, label }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const created = await gitApi.createPullRequestLabel({ name: label }, repositoryId, pullRequestId, project);
        return jsonResult(created);
      } catch (error) {
        return toolError(`adding label '${label}' to pull request ${pullRequestId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.remove_pull_request_label,
    "Remove one label from a pull request. The label itself survives in the project.",
    {
      repositoryId: repositoryIdParam,
      pullRequestId: z.number().describe("The ID of the pull request."),
      project: requiredProject,
      label: z.string().describe("The label name or ID to remove."),
    },
    async ({ repositoryId, pullRequestId, project, label }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        await gitApi.deletePullRequestLabels(repositoryId, pullRequestId, label, project);
        return jsonResult({ removed: label, pullRequestId });
      } catch (error) {
        return toolError(`removing label '${label}' from pull request ${pullRequestId}`, error);
      }
    }
  );

  const asyncRefOperationParams = {
    repositoryId: repositoryIdParam,
    project: requiredProject,
    pullRequestId: z.number().optional().describe("Take every commit of this pull request. Give either this or commitIds."),
    commitIds: z.array(z.string()).optional().describe("Full SHAs of the commits to take, applied in the order given. Give either this or pullRequestId."),
    ontoBranch: z.string().describe("The branch the new branch starts from, e.g. 'release/1.4' or 'refs/heads/release/1.4'."),
    newBranch: z.string().describe("Name of the branch to create with the result, e.g. 'cherry-pick/1234-onto-release'. Must not exist yet."),
  };

  function asyncRefOperationParameters(
    repositoryId: string,
    pullRequestId: number | undefined,
    commitIds: string[] | undefined,
    ontoBranch: string,
    newBranch: string
  ): GitAsyncRefOperationParameters | string {
    const commits = commitIds ?? [];
    if ((pullRequestId === undefined) === (commits.length === 0)) {
      return "Give exactly one of pullRequestId or commitIds.";
    }
    return {
      repository: { id: repositoryId },
      ontoRefName: branchRef(ontoBranch),
      generatedRefName: branchRef(newBranch),
      source: pullRequestId !== undefined ? { pullRequestId } : { commitList: commits.map((commitId) => ({ commitId })) },
    };
  }

  registerTool(
    server,
    REPO_TOOLS.cherry_pick,
    "Cherry-pick a pull request's commits, or a list of commits, onto a branch. Azure DevOps writes the result to a new branch and runs asynchronously: poll repo_get_cherry_pick until the status is Completed, then open a pull request from newBranch with repo_create_pull_request. Conflicts fail the operation instead of producing a branch.",
    asyncRefOperationParams,
    async ({ repositoryId, project, pullRequestId, commitIds, ontoBranch, newBranch }) => {
      const parameters = asyncRefOperationParameters(repositoryId, pullRequestId, commitIds, ontoBranch, newBranch);
      if (typeof parameters === "string") {
        return { content: [{ type: "text", text: parameters }], isError: true };
      }
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const cherryPick = await gitApi.createCherryPick(parameters, project, repositoryId);
        return jsonResult(summarizeAsyncRefOperation(cherryPick.cherryPickId, cherryPick));
      } catch (error) {
        return toolError(`cherry-picking onto '${ontoBranch}'`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.get_cherry_pick,
    "Get the state of a cherry-pick started with repo_cherry_pick: Queued, InProgress, Completed, Failed or Abandoned, with the failure reason and whether it hit a conflict.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      cherryPickId: z.number().describe("The id returned by repo_cherry_pick."),
    },
    async ({ repositoryId, project, cherryPickId }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const cherryPick = await gitApi.getCherryPick(project, cherryPickId, repositoryId);
        // The API answers an unknown id with an empty body, which the client turns into null.
        if (!cherryPick) {
          return { content: [{ type: "text", text: `Cherry-pick ${cherryPickId} not found in repository ${repositoryId}` }], isError: true };
        }
        return jsonResult(summarizeAsyncRefOperation(cherryPick.cherryPickId ?? cherryPickId, cherryPick));
      } catch (error) {
        return toolError(`getting cherry-pick ${cherryPickId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.revert,
    "Revert a completed pull request, or a list of commits, on a branch. Azure DevOps writes the reverting commits to a new branch and runs asynchronously: poll repo_get_revert until the status is Completed, then open a pull request from newBranch with repo_create_pull_request. Nothing lands on ontoBranch until that pull request completes.",
    asyncRefOperationParams,
    async ({ repositoryId, project, pullRequestId, commitIds, ontoBranch, newBranch }) => {
      const parameters = asyncRefOperationParameters(repositoryId, pullRequestId, commitIds, ontoBranch, newBranch);
      if (typeof parameters === "string") {
        return { content: [{ type: "text", text: parameters }], isError: true };
      }
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const revert = await gitApi.createRevert(parameters, project, repositoryId);
        return jsonResult(summarizeAsyncRefOperation(revert.revertId, revert));
      } catch (error) {
        return toolError(`reverting onto '${ontoBranch}'`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.get_revert,
    "Get the state of a revert started with repo_revert: Queued, InProgress, Completed, Failed or Abandoned, with the failure reason and whether it hit a conflict.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      revertId: z.number().describe("The id returned by repo_revert."),
    },
    async ({ repositoryId, project, revertId }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const revert = await gitApi.getRevert(project, revertId, repositoryId);
        // The API answers an unknown id with an empty body, which the client turns into null.
        if (!revert) {
          return { content: [{ type: "text", text: `Revert ${revertId} not found in repository ${repositoryId}` }], isError: true };
        }
        return jsonResult(summarizeAsyncRefOperation(revert.revertId ?? revertId, revert));
      } catch (error) {
        return toolError(`getting revert ${revertId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_pull_request_statuses,
    "List the statuses posted on a pull request itself — external checks that a 'status check' branch policy evaluates. Statuses on the source commit are listed by repo_list_commit_statuses instead.",
    {
      repositoryId: repositoryIdParam,
      pullRequestId: z.number().describe("The ID of the pull request."),
      project: requiredProject,
      iterationId: z.number().optional().describe("Only the statuses posted against this iteration (push) of the pull request. Omit for all of them."),
    },
    async ({ repositoryId, pullRequestId, project, iterationId }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const statuses =
          iterationId !== undefined
            ? await gitApi.getPullRequestIterationStatuses(repositoryId, pullRequestId, iterationId, project)
            : await gitApi.getPullRequestStatuses(repositoryId, pullRequestId, project);
        return jsonResult(statuses);
      } catch (error) {
        return toolError(`listing statuses on pull request ${pullRequestId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.create_pull_request_status,
    "Post a status on a pull request, e.g. the result of an external check that a 'status check' branch policy waits for. Posting again with the same name and genre replaces the earlier status.",
    {
      repositoryId: repositoryIdParam,
      pullRequestId: z.number().describe("The ID of the pull request."),
      project: requiredProject,
      state: z.enum(getEnumKeys(GitStatusState) as [string, ...string[]]).describe("The outcome being reported."),
      name: z.string().describe("Name identifying this check, e.g. 'license-scan'. Together with genre it is the status context that a policy matches on."),
      genre: z.string().optional().describe("Namespace for the check, e.g. 'continuous-integration'. Omit for the default genre."),
      description: z.string().optional().describe("Human-readable summary of the outcome."),
      targetUrl: z.string().optional().describe("URL with the details behind the status."),
      iterationId: z
        .number()
        .optional()
        .describe("Tie the status to this iteration (push), so a policy set to reset on new pushes ignores it once the source branch moves on. Omit to post against the pull request as a whole."),
    },
    async ({ repositoryId, pullRequestId, project, state, name, genre, description, targetUrl, iterationId }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const status = await gitApi.createPullRequestStatus(
          {
            state: safeEnumConvert(GitStatusState, state),
            description,
            targetUrl,
            context: { name, genre },
            iterationId,
          },
          repositoryId,
          pullRequestId,
          project
        );
        return jsonResult(status);
      } catch (error) {
        return toolError(`creating a status on pull request ${pullRequestId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.delete_pull_request_status,
    "Delete one status from a pull request. A policy that required it goes back to waiting.",
    {
      repositoryId: repositoryIdParam,
      pullRequestId: z.number().describe("The ID of the pull request."),
      project: requiredProject,
      statusId: z.number().describe("The status id, as returned by repo_list_pull_request_statuses."),
    },
    async ({ repositoryId, pullRequestId, project, statusId }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        await gitApi.deletePullRequestStatus(repositoryId, pullRequestId, statusId, project);
        return jsonResult({ deleted: statusId, pullRequestId });
      } catch (error) {
        return toolError(`deleting status ${statusId} from pull request ${pullRequestId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_deleted_repositories,
    "List the repositories in a project's recycle bin, with who deleted them and when. Restore one with repo_restore_repository.",
    {
      project: requiredProject,
    },
    async ({ project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const repositories = await gitApi.getRecycleBinRepositories(project);
        return jsonResult(
          repositories.map((repository) => ({
            id: repository.id,
            name: repository.name,
            deletedBy: repository.deletedBy?.displayName,
            deletedDate: repository.deletedDate,
            createdDate: repository.createdDate,
          }))
        );
      } catch (error) {
        return toolError("listing deleted repositories", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.restore_repository,
    "Restore a deleted repository from the project's recycle bin, with its history, branches and pull requests. Fails if a repository with the same name has been created since.",
    {
      repositoryId: z.string().describe("The GUID of the deleted repository, as listed by repo_list_deleted_repositories."),
      project: requiredProject,
    },
    async ({ repositoryId, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const repository = await gitApi.restoreRepositoryFromRecycleBin({ deleted: false }, project, repositoryId);
        return jsonResult(repository);
      } catch (error) {
        return toolError(`restoring repository ${repositoryId}`, error);
      }
    }
  );

  const setBranchLock = async (repositoryId: string, project: string, branch: string, isLocked: boolean) => {
    const connection = await connectionProvider();
    const gitApi = await connection.getGitApi();
    const ref = await gitApi.updateRef({ isLocked }, repositoryId, branchRef(branch).replace(/^refs\//, ""), project);
    return jsonResult({ name: ref.name, isLocked: ref.isLocked, isLockedBy: ref.isLockedBy?.displayName });
  };

  registerTool(
    server,
    REPO_TOOLS.lock_branch,
    "Lock a branch: nobody but the person who locked it can push to it, and pull requests into it cannot be completed. Meant for freezing a branch temporarily — use branch policies for lasting rules.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      branch: z.string().describe("The branch to lock, e.g. 'release/1.4' or 'refs/heads/release/1.4'."),
    },
    async ({ repositoryId, project, branch }) => {
      try {
        return await setBranchLock(repositoryId, project, branch, true);
      } catch (error) {
        return toolError(`locking branch '${branch}'`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.unlock_branch,
    "Unlock a branch locked with repo_lock_branch or from the web UI.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      branch: z.string().describe("The branch to unlock, e.g. 'release/1.4' or 'refs/heads/release/1.4'."),
    },
    async ({ repositoryId, project, branch }) => {
      try {
        return await setBranchLock(repositoryId, project, branch, false);
      } catch (error) {
        return toolError(`unlocking branch '${branch}'`, error);
      }
    }
  );

  // ---------------------------------------------------------- commits, pushes ---

  const commitIdParam = z.string().describe("The full SHA of the commit.");
  const versionTypeParam = z.enum(["branch", "tag", "commit"]).default("branch");
  const VERSION_TYPES = { branch: GitVersionType.Branch, tag: GitVersionType.Tag, commit: GitVersionType.Commit };

  registerTool(
    server,
    REPO_TOOLS.get_commit,
    "Get one commit: author, committer, message, parents, and optionally the first files it changed.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      commitId: commitIdParam,
      changeCount: z.coerce.number().min(0).optional().describe("Also return up to this many changed files. Use repo_list_commit_changes to page through all of them."),
    },
    async ({ repositoryId, project, commitId, changeCount }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const commit = await gitApi.getCommit(commitId, repositoryId, project, changeCount);
        if (!commit) {
          return { content: [{ type: "text", text: `Commit ${commitId} not found in repository ${repositoryId}` }], isError: true };
        }
        return jsonResult(commit);
      } catch (error) {
        return toolError(`getting commit ${commitId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_commit_changes,
    "List the files a commit added, edited, renamed or deleted, with counts per change type.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      commitId: commitIdParam,
      top: z.coerce.number().min(1).optional().describe("Maximum number of changes to return."),
      skip: z.coerce.number().min(0).optional().describe("Number of changes to skip."),
    },
    async ({ repositoryId, project, commitId, top, skip }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        return jsonResult(await gitApi.getChanges(commitId, repositoryId, project, top, skip));
      } catch (error) {
        return toolError(`listing changes of commit ${commitId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.compare_commits,
    "Compare two branches, tags or commits: the files that differ, how many commits the target is ahead of and behind the base, and their common commit. By default it diffs from the common commit, which is what a pull request from target into base would show.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      baseVersion: z.string().describe("The base branch name (without 'refs/heads/'), tag or commit SHA, e.g. 'main'."),
      baseVersionType: versionTypeParam.describe("What baseVersion is."),
      targetVersion: z.string().describe("The target branch name, tag or commit SHA, e.g. 'feature/login'."),
      targetVersionType: versionTypeParam.describe("What targetVersion is."),
      diffCommonCommit: z.boolean().default(true).describe("Diff the target against the common commit rather than against the base itself."),
      top: z.coerce.number().min(1).optional().describe("Maximum number of changed files to return."),
      skip: z.coerce.number().min(0).optional().describe("Number of changed files to skip."),
    },
    async ({ repositoryId, project, baseVersion, baseVersionType, targetVersion, targetVersionType, diffCommonCommit, top, skip }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        // The client reads version and versionType off each descriptor, not the base…/target… fields.
        const diffs = await gitApi.getCommitDiffs(
          repositoryId,
          project,
          diffCommonCommit,
          top,
          skip,
          { version: baseVersion, versionType: VERSION_TYPES[baseVersionType] },
          { version: targetVersion, versionType: VERSION_TYPES[targetVersionType] }
        );
        // changeCounts arrives keyed by the numeric change type; name the keys ("Edit", "Add", …).
        const changeCounts = diffs?.changeCounts && Object.fromEntries(Object.entries(diffs.changeCounts).map(([type, count]) => [VersionControlChangeType[Number(type)] ?? type, count]));
        return jsonResult({ ...diffs, changeCounts });
      } catch (error) {
        return toolError(`comparing ${baseVersion} with ${targetVersion}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.get_merge_bases,
    "Find the merge base of two commits — the most recent commit both descend from.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      commitId: commitIdParam,
      otherCommitId: z.string().describe("The full SHA of the other commit."),
      otherRepositoryId: z.string().optional().describe("The repository of the other commit when it lives in a fork. Omit for the same repository."),
    },
    async ({ repositoryId, project, commitId, otherCommitId, otherRepositoryId }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        return jsonResult(await gitApi.getMergeBases(repositoryId, commitId, otherCommitId, project, undefined, otherRepositoryId));
      } catch (error) {
        return toolError(`finding the merge base of ${commitId} and ${otherCommitId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_pushes,
    "List pushes to a repository: who pushed to which branch and when, with the commits each ref moved from and to. Useful to see what landed on a branch, including force-pushes.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      refName: z.string().optional().describe("Only pushes to this ref, e.g. 'refs/heads/main'."),
      pusherId: z.string().optional().describe("Only pushes by this identity ID."),
      fromDate: z.coerce.date().optional().describe("Only pushes on or after this date."),
      toDate: z.coerce.date().optional().describe("Only pushes on or before this date."),
      includeRefUpdates: z.boolean().default(true).describe("Include the old and new commit of each updated ref."),
      top: z.coerce.number().min(1).default(20).describe("Maximum number of pushes to return."),
      skip: z.coerce.number().min(0).optional().describe("Number of pushes to skip."),
    },
    async ({ repositoryId, project, refName, pusherId, fromDate, toDate, includeRefUpdates, top, skip }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        return jsonResult(await gitApi.getPushes(repositoryId, project, skip, top, { refName, pusherId, fromDate, toDate, includeRefUpdates }));
      } catch (error) {
        return toolError("listing pushes", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.get_push,
    "Get one push with the commits it brought and the refs it moved.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      pushId: z.coerce.number().min(1).describe("The push ID, as repo_list_pushes returns it."),
      includeCommits: z.coerce.number().min(0).default(100).describe("Return up to this many of the pushed commits; 0 for none."),
    },
    async ({ repositoryId, project, pushId, includeCommits }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const push = await gitApi.getPush(repositoryId, pushId, project, includeCommits, true);
        if (!push) {
          return { content: [{ type: "text", text: `Push ${pushId} not found in repository ${repositoryId}` }], isError: true };
        }
        return jsonResult(push);
      } catch (error) {
        return toolError(`getting push ${pushId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.get_branch_stats,
    "Get how far branches are ahead of and behind a base branch (the default branch unless given), with each branch's latest commit. Pass a branch name for one branch, or omit it for all.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      branch: z.string().optional().describe("One branch name without 'refs/heads/', e.g. 'feature/login'. Omit for every branch."),
      baseBranch: z.string().optional().describe("The branch to compare against. Omit for the repository's default branch."),
    },
    async ({ repositoryId, project, branch, baseBranch }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const base = baseBranch ? { version: baseBranch, versionType: GitVersionType.Branch } : undefined;
        return jsonResult(branch ? await gitApi.getBranch(repositoryId, branch, project, base) : await gitApi.getBranches(repositoryId, project, base));
      } catch (error) {
        return toolError("getting branch statistics", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.get_pull_request_suggestions,
    "Get the branches you pushed to recently that have no pull request yet — the 'Create a pull request' suggestions the web UI shows.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
    },
    async ({ repositoryId, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        return jsonResult(await gitApi.getSuggestions(repositoryId, project));
      } catch (error) {
        return toolError("getting pull request suggestions", error);
      }
    }
  );

  // ----------------------------------------------------------- pull requests ---

  const pullRequestIdParam = z.coerce.number().min(1).describe("The ID of the pull request.");

  registerTool(
    server,
    REPO_TOOLS.list_pull_request_commits,
    "List the commits of a pull request, or of one iteration (push) of it.",
    {
      repositoryId: repositoryIdParam,
      pullRequestId: pullRequestIdParam,
      project: requiredProject,
      iterationId: z.coerce.number().min(1).optional().describe("Only the commits of this iteration. Omit for the whole pull request."),
      top: z.coerce.number().min(1).optional().describe("With iterationId: maximum number of commits to return."),
      skip: z.coerce.number().min(0).optional().describe("With iterationId: number of commits to skip."),
    },
    async ({ repositoryId, pullRequestId, project, iterationId, top, skip }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const commits =
          iterationId !== undefined
            ? await gitApi.getPullRequestIterationCommits(repositoryId, pullRequestId, iterationId, project, top, skip)
            : await gitApi.getPullRequestCommits(repositoryId, pullRequestId, project);
        return jsonResult(commits);
      } catch (error) {
        return toolError(`listing commits of pull request ${pullRequestId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_pull_request_work_items,
    "List the work items linked to a pull request. Fetch their fields with wit_get_work_items_batch_by_ids.",
    {
      repositoryId: repositoryIdParam,
      pullRequestId: pullRequestIdParam,
      project: requiredProject,
    },
    async ({ repositoryId, pullRequestId, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const refs = await gitApi.getPullRequestWorkItemRefs(repositoryId, pullRequestId, project);
        return jsonResult((refs ?? []).map((ref) => ({ id: ref.id, url: ref.url })));
      } catch (error) {
        return toolError(`listing work items of pull request ${pullRequestId}`, error);
      }
    }
  );

  const threadCommentParams = {
    repositoryId: repositoryIdParam,
    pullRequestId: pullRequestIdParam,
    threadId: z.coerce.number().min(1).describe("The ID of the comment thread."),
    commentId: z.coerce.number().min(1).describe("The ID of the comment within the thread."),
    project: requiredProject,
  };

  registerTool(
    server,
    REPO_TOOLS.delete_pull_request_comment,
    "Delete a comment from a pull request thread. The thread and its other comments stay.",
    threadCommentParams,
    async ({ repositoryId, pullRequestId, threadId, commentId, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        await gitApi.deleteComment(repositoryId, pullRequestId, threadId, commentId, project);
        return jsonResult({ deleted: commentId, threadId, pullRequestId });
      } catch (error) {
        return toolError(`deleting comment ${commentId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_pull_request_comment_likes,
    "List who liked a pull request comment.",
    threadCommentParams,
    async ({ repositoryId, pullRequestId, threadId, commentId, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const likes = await gitApi.getLikes(repositoryId, pullRequestId, threadId, commentId, project);
        return jsonResult((likes ?? []).map((identity) => ({ id: identity.id, displayName: identity.displayName, uniqueName: identity.uniqueName })));
      } catch (error) {
        return toolError(`listing likes of comment ${commentId}`, error);
      }
    }
  );

  registerTool(server, REPO_TOOLS.like_pull_request_comment, "Like a pull request comment as yourself.", threadCommentParams, async ({ repositoryId, pullRequestId, threadId, commentId, project }) => {
    try {
      const connection = await connectionProvider();
      const gitApi = await connection.getGitApi();
      await gitApi.createLike(repositoryId, pullRequestId, threadId, commentId, project);
      return jsonResult({ liked: commentId, threadId, pullRequestId });
    } catch (error) {
      return toolError(`liking comment ${commentId}`, error);
    }
  });

  registerTool(
    server,
    REPO_TOOLS.unlike_pull_request_comment,
    "Withdraw your like from a pull request comment.",
    threadCommentParams,
    async ({ repositoryId, pullRequestId, threadId, commentId, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        await gitApi.deleteLike(repositoryId, pullRequestId, threadId, commentId, project);
        return jsonResult({ unliked: commentId, threadId, pullRequestId });
      } catch (error) {
        return toolError(`unliking comment ${commentId}`, error);
      }
    }
  );

  // ------------------------------------------------------------- repositories ---

  registerTool(
    server,
    REPO_TOOLS.update_repository,
    "Rename a repository or change its default branch. Renaming changes its clone URL; existing clones must update their remote.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      name: z.string().optional().describe("New repository name."),
      defaultBranch: z.string().optional().describe("New default branch, e.g. 'main' or 'refs/heads/main'. The branch must exist."),
    },
    async ({ repositoryId, project, name, defaultBranch }) => {
      if (name === undefined && defaultBranch === undefined) {
        return { content: [{ type: "text", text: "Nothing to update: give name, defaultBranch or both." }], isError: true };
      }
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const update = { name, defaultBranch: defaultBranch === undefined ? undefined : branchRef(defaultBranch) };
        return jsonResult(await gitApi.updateRepository(update, repositoryId, project));
      } catch (error) {
        return toolError(`updating repository ${repositoryId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.destroy_repository,
    "Permanently erase a deleted repository from the project's recycle bin, with all its history, branches and pull requests. This cannot be undone.",
    {
      repositoryId: z.string().describe("The GUID of the deleted repository, as listed by repo_list_deleted_repositories."),
      project: requiredProject,
    },
    async ({ repositoryId, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        await gitApi.deleteRepositoryFromRecycleBin(project, repositoryId);
        return jsonResult({ destroyed: repositoryId });
      } catch (error) {
        return toolError(`erasing repository ${repositoryId}`, error);
      }
    }
  );

  const describeImport = (request: { importRequestId?: number; status?: GitAsyncOperationStatus; detailedStatus?: unknown; parameters?: unknown; repository?: { id?: string; name?: string } }) => ({
    importRequestId: request.importRequestId,
    status: request.status !== undefined ? GitAsyncOperationStatus[request.status] : undefined,
    detailedStatus: request.detailedStatus,
    parameters: request.parameters,
    repository: request.repository && { id: request.repository.id, name: request.repository.name },
  });

  registerTool(
    server,
    REPO_TOOLS.create_import_request,
    "Import a Git repository from another host (GitHub, GitLab, another Azure DevOps organization) into an existing, empty repository. Runs asynchronously; follow it with repo_get_import_request. A private source needs a service connection holding its credentials.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      sourceUrl: z.string().describe("The clone URL of the source repository, e.g. 'https://github.com/contoso/app.git'."),
      serviceEndpointId: z.string().optional().describe("ID of a service connection (Generic or GitHub) with credentials for a private source."),
      deleteServiceEndpointAfterImportIsDone: z.boolean().optional().describe("Delete that service connection once the import finishes."),
    },
    async ({ repositoryId, project, sourceUrl, serviceEndpointId, deleteServiceEndpointAfterImportIsDone }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const request = await gitApi.createImportRequest({ parameters: { gitSource: { url: sourceUrl }, serviceEndpointId, deleteServiceEndpointAfterImportIsDone } }, project, repositoryId);
        return jsonResult(describeImport(request));
      } catch (error) {
        return toolError(`importing ${sourceUrl}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_import_requests,
    "List the import requests of a repository with their status.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      includeAbandoned: z.boolean().optional().describe("Also return abandoned imports."),
    },
    async ({ repositoryId, project, includeAbandoned }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const requests = await gitApi.queryImportRequests(project, repositoryId, includeAbandoned);
        return jsonResult((requests ?? []).map(describeImport));
      } catch (error) {
        return toolError("listing import requests", error);
      }
    }
  );

  const importRequestIdParam = z.coerce.number().min(1).describe("The import request ID, as returned when the import was created.");

  registerTool(
    server,
    REPO_TOOLS.get_import_request,
    "Get the state of a repository import: Queued, InProgress, Completed, Failed or Abandoned, with the current step and any error.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      importRequestId: importRequestIdParam,
    },
    async ({ repositoryId, project, importRequestId }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const request = await gitApi.getImportRequest(project, repositoryId, importRequestId);
        if (!request) {
          return { content: [{ type: "text", text: `Import request ${importRequestId} not found in repository ${repositoryId}` }], isError: true };
        }
        return jsonResult(describeImport(request));
      } catch (error) {
        return toolError(`getting import request ${importRequestId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.update_import_request,
    "Retry a failed repository import, or abandon it.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      importRequestId: importRequestIdParam,
      action: z.enum(["retry", "abandon"]).describe("'retry' queues the import again; 'abandon' gives up on it."),
    },
    async ({ repositoryId, project, importRequestId, action }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        // The REST API documents the status by name ("queued" retries, "abandoned" gives up).
        const status = (action === "retry" ? "queued" : "abandoned") as unknown as GitAsyncOperationStatus;
        const request = await gitApi.updateImportRequest({ status }, project, repositoryId, importRequestId);
        return jsonResult(describeImport(request));
      } catch (error) {
        return toolError(`updating import request ${importRequestId}`, error);
      }
    }
  );

  // -------------------------------------------------------------------- forks ---

  registerTool(
    server,
    REPO_TOOLS.list_forks,
    "List the forks of a repository within the organization.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
    },
    async ({ repositoryId, project }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        // Forks are looked up per collection; in Azure DevOps Services the organization is the only one.
        const coreApi = await connection.getCoreApi();
        const [collection] = await coreApi.getProjectCollections(1);
        if (!collection?.id) {
          return { content: [{ type: "text", text: "Could not determine the organization's collection ID." }], isError: true };
        }
        return jsonResult(await gitApi.getForks(repositoryId, collection.id, project));
      } catch (error) {
        return toolError(`listing forks of repository ${repositoryId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.create_fork_sync_request,
    "Fetch refs from another repository of the same fork network into this one — typically to bring a fork up to date with its parent. Runs asynchronously; follow it with repo_get_fork_sync_request.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      sourceRepositoryId: z.string().describe("The GUID of the repository to fetch from, e.g. the fork's parent."),
      sourceProjectId: z.string().describe("The GUID of that repository's project."),
      refs: z
        .array(z.object({ sourceRef: z.string().describe("Ref in the source, e.g. 'refs/heads/main'."), targetRef: z.string().describe("Ref to update here, e.g. 'refs/heads/main'.") }))
        .optional()
        .describe("Which refs to bring over and where. Omit to sync every ref."),
    },
    async ({ repositoryId, project, sourceRepositoryId, sourceProjectId, refs }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        return jsonResult(await gitApi.createForkSyncRequest({ source: { repositoryId: sourceRepositoryId, projectId: sourceProjectId }, sourceToTargetRefs: refs }, repositoryId, project));
      } catch (error) {
        return toolError(`syncing repository ${repositoryId}`, error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.list_fork_sync_requests,
    "List the fork sync operations requested on a repository with their status.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      includeAbandoned: z.boolean().optional().describe("Also return abandoned operations."),
    },
    async ({ repositoryId, project, includeAbandoned }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        return jsonResult(await gitApi.getForkSyncRequests(repositoryId, project, includeAbandoned));
      } catch (error) {
        return toolError("listing fork sync requests", error);
      }
    }
  );

  registerTool(
    server,
    REPO_TOOLS.get_fork_sync_request,
    "Get the state of one fork sync operation.",
    {
      repositoryId: repositoryIdParam,
      project: requiredProject,
      forkSyncOperationId: z.coerce.number().min(1).describe("The operation ID, as repo_create_fork_sync_request returns it."),
    },
    async ({ repositoryId, project, forkSyncOperationId }) => {
      try {
        const connection = await connectionProvider();
        const gitApi = await connection.getGitApi();
        const request = await gitApi.getForkSyncRequest(repositoryId, forkSyncOperationId, project);
        if (!request) {
          return { content: [{ type: "text", text: `Fork sync operation ${forkSyncOperationId} not found` }], isError: true };
        }
        return jsonResult(request);
      } catch (error) {
        return toolError(`getting fork sync operation ${forkSyncOperationId}`, error);
      }
    }
  );
}

export { REPO_TOOLS, configureRepoTools };

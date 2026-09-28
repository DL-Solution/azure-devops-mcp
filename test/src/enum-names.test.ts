// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { getBearerHandler, WebApi } from "azure-devops-node-api";
import { TypeInfo as CoreTypeInfo } from "azure-devops-node-api/interfaces/CoreInterfaces";
import { CommentThreadStatus, PullRequestStatus, TypeInfo as GitTypeInfo, VersionControlChangeType } from "azure-devops-node-api/interfaces/GitInterfaces";

import { shareAdoMetadata } from "../../src/shared/ado-metadata-cache";
import { captureContinuationTokens, continuationTokenOf } from "../../src/shared/continuation";
import { captureEnumTypes, enumName, typeInfoOf, withEnumNames } from "../../src/shared/enum-names";
import { reportNotFound } from "../../src/shared/not-found";
import { jsonResult } from "../../src/shared/tool-results";

// ado-metadata-cache logs through our logger, which pulls in @azure/logger (see CLAUDE.md).
jest.mock("../../src/logger", () => ({ logger: { warn: jest.fn() } }));

const ORG = "https://dev.azure.com/contoso";

function response(body: string, headers: Record<string, string> = {}) {
  return { message: { statusCode: 200, headers }, readBody: () => Promise.resolve(body) };
}

interface CoreClientInternals {
  rest: { client: { request: jest.Mock } };
  vsoClient: { getVersioningData: jest.Mock };
}

/** A connection that resolves resource areas without the network (the org URL serves every area). */
function offlineConnection(): WebApi {
  const connection = new WebApi(ORG, getBearerHandler("token"));
  (connection as unknown as { _getResourceAreas: () => Promise<unknown> })._getResourceAreas = () => Promise.resolve([]);
  return connection;
}

/** The real Core client of `connection`, with its HTTP layer answering every request with `answer`. */
async function coreApiAnswering(connection: WebApi, answer: ReturnType<typeof response>) {
  const coreApi = await connection.getCoreApi();
  const internals = coreApi as unknown as CoreClientInternals;
  internals.vsoClient.getVersioningData = jest.fn().mockResolvedValue({ requestUrl: `${ORG}/_apis/projects`, apiVersion: "7.1" });
  internals.rest.client.request = jest.fn().mockResolvedValue(answer);
  return coreApi;
}

// What Azure DevOps actually sends: the enum as a name.
const PAGE = JSON.stringify({ count: 1, value: [{ id: "p1", name: "Alpha", visibility: "private" }] });

describe("enum names", () => {
  it("relies on azure-devops-node-api still turning enum names into numbers", async () => {
    // If an upgrade stops deserializing enums, this module can go.
    const coreApi = await coreApiAnswering(offlineConnection(), response(PAGE));

    const projects = await coreApi.getProjects();

    expect(projects[0].visibility).toBe(0);
    expect(jsonResult(projects).content[0]).toEqual({ type: "text", text: '[{"id":"p1","name":"Alpha","visibility":0}]' });
  });

  it("writes the enums of a real node-api result as names, and leaves the numbers in the handler", async () => {
    const coreApi = await coreApiAnswering(captureEnumTypes(offlineConnection()), response(PAGE));

    const projects = await coreApi.getProjects();

    expect(projects[0].visibility).toBe(0);
    expect(typeInfoOf(projects)).toBe(CoreTypeInfo.TeamProjectReference);
    expect(jsonResult(projects).content[0]).toEqual({ type: "text", text: '[{"id":"p1","name":"Alpha","visibility":"private"}]' });
    // Wrapped in a page, as a paged tool returns it.
    expect(jsonResult({ items: projects }).content[0]).toEqual({ type: "text", text: '{"items":[{"id":"p1","name":"Alpha","visibility":"private"}]}' });
  });

  it.each([
    ["enum names inside continuation tokens", (c: WebApi) => captureEnumTypes(captureContinuationTokens(c))],
    ["continuation tokens inside enum names", (c: WebApi) => captureContinuationTokens(captureEnumTypes(c))],
    ["every wrapper, as the server applies them", (c: WebApi) => shareAdoMetadata(reportNotFound(captureEnumTypes(captureContinuationTokens(c))))],
    ["each wrapper twice", (c: WebApi) => captureEnumTypes(captureContinuationTokens(captureEnumTypes(captureContinuationTokens(c))))],
  ])("composes with the continuation token capture: %s", async (_, wrap) => {
    const coreApi = await coreApiAnswering(wrap(offlineConnection()), response(PAGE, { "x-ms-continuationtoken": "100" }));

    const projects = await coreApi.getProjects();

    expect(continuationTokenOf(projects)).toBe("100");
    expect(jsonResult(projects).content[0].text).toBe('[{"id":"p1","name":"Alpha","visibility":"private"}]');
  });

  it("hands back a client it does not recognise unchanged", async () => {
    const connection = offlineConnection();
    const unfamiliar = { formatResponse: "not a function" };
    (connection as unknown as { getCoreApi: () => Promise<unknown> }).getCoreApi = () => Promise.resolve(unfamiliar);

    await expect(captureEnumTypes(connection).getCoreApi()).resolves.toBe(unfamiliar);
    expect(unfamiliar.formatResponse).toBe("not a function");
  });

  it("follows nested types and arrays", () => {
    const pullRequest = withEnumNames(
      {
        status: PullRequestStatus.Completed,
        mergeStatus: 3,
        lastMergeCommit: { commitId: "abc", changes: [{ changeType: VersionControlChangeType.Edit }] },
      },
      GitTypeInfo.GitPullRequest
    );
    const threads = withEnumNames([{ status: CommentThreadStatus.Fixed }, { status: CommentThreadStatus.WontFix }], GitTypeInfo.GitPullRequestCommentThread);

    expect(JSON.parse(jsonResult({ pullRequest, threads }).content[0].text as string)).toEqual({
      pullRequest: { status: "completed", mergeStatus: "succeeded", lastMergeCommit: { commitId: "abc", changes: [{ changeType: "edit" }] } },
      threads: [{ status: "fixed" }, { status: "wontFix" }],
    });
    // The handler's values are untouched.
    expect(pullRequest.status).toBe(PullRequestStatus.Completed);
  });

  it("writes a flags value as the names of its members, the way the REST API does", () => {
    const changeType = GitTypeInfo.VersionControlChangeType;
    expect(enumName(changeType, VersionControlChangeType.Edit | VersionControlChangeType.Rename)).toBe("edit, rename");
    expect(enumName(changeType, VersionControlChangeType.All)).toBe("all");
    expect(enumName(changeType, 0)).toBe("none");
    // A number neither a member nor a set of members stays a number.
    expect(enumName(changeType, 1 << 20)).toBe(1 << 20);
    expect(enumName(changeType, -2)).toBe(-2);
    expect(enumName(changeType, 1.5)).toBe(1.5);
    expect(enumName(changeType, "edit")).toBe("edit");
    expect(enumName(undefined, 1)).toBe(1);
    expect(enumName({}, 1)).toBe(1);
  });

  it("maps enum arrays and dictionaries", () => {
    const color = { enumValues: { red: 1, green: 2 } };
    const inner = { fields: { tone: { enumType: color } } };
    const type = {
      fields: {
        palette: { isArray: true, enumType: color },
        byColor: { isDictionary: true, dictionaryKeyEnumType: color, dictionaryValueEnumType: color },
        nested: { isDictionary: true, dictionaryValueTypeInfo: inner },
        lists: { isDictionary: true, dictionaryValueFieldInfo: { isArray: true, enumType: color } },
        rows: { isArray: true, typeInfo: inner },
      },
    };
    const value = withEnumNames({ palette: [1, 2, 9], byColor: { "1": 2, "other": 1 }, nested: { a: { tone: 2 } }, lists: { a: [1, 2] }, rows: [{ tone: 1 }], extra: 1 }, type);

    expect(JSON.parse(jsonResult(value).content[0].text as string)).toEqual({
      palette: ["red", "green", 9],
      byColor: { red: "green", other: "red" },
      nested: { a: { tone: "green" } },
      lists: { a: ["red", "green"] },
      rows: [{ tone: "red" }],
      extra: 1,
    });
  });

  it("marks only objects", () => {
    expect(withEnumNames("text", GitTypeInfo.GitPullRequest)).toBe("text");
    expect(typeInfoOf("text")).toBeUndefined();
    const value = withEnumNames({ status: 1 }, undefined);
    expect(typeInfoOf(value)).toBeUndefined();
  });
});

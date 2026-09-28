// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { getBearerHandler, WebApi } from "azure-devops-node-api";

import { shareAdoMetadata } from "../../src/shared/ado-metadata-cache";
import { captureContinuationTokens, continuationTokenOf, rememberContinuationToken } from "../../src/shared/continuation";
import { reportNotFound } from "../../src/shared/not-found";

// ado-metadata-cache logs through our logger, which pulls in @azure/logger (see CLAUDE.md).
jest.mock("../../src/logger", () => ({ logger: { warn: jest.fn() } }));

const ORG = "https://dev.azure.com/contoso";

type Headers = Record<string, string | string[]>;

function response(body: string, headers: Headers = {}, statusCode = 200) {
  return { message: { statusCode, headers }, readBody: () => Promise.resolve(body) };
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

const PAGE = JSON.stringify({ count: 1, value: [{ id: "p1", name: "Alpha" }] });

describe("continuation tokens", () => {
  it("relies on azure-devops-node-api still dropping the continuation token header", async () => {
    // If an upgrade starts returning the token itself, this module can go.
    const coreApi = await coreApiAnswering(offlineConnection(), response(PAGE, { "x-ms-continuationtoken": "100" }));

    const projects = await coreApi.getProjects();

    expect(projects).toEqual([{ id: "p1", name: "Alpha" }]);
    expect((projects as { continuationToken?: unknown }).continuationToken).toBeUndefined();
    expect(continuationTokenOf(projects)).toBeUndefined();
  });

  it("carries the header's token to the array a real node-api list method returns", async () => {
    const coreApi = await coreApiAnswering(captureContinuationTokens(offlineConnection()), response(PAGE, { "x-ms-continuationtoken": "100" }));

    const projects = await coreApi.getProjects();

    expect(projects).toEqual([{ id: "p1", name: "Alpha" }]);
    expect(continuationTokenOf(projects)).toBe("100");
    // The result itself is untouched: nothing extra is serialized.
    expect(JSON.stringify(projects)).toBe('[{"id":"p1","name":"Alpha"}]');
  });

  it("works under the other connection wrappers, in the order the server applies them", async () => {
    const connection = shareAdoMetadata(reportNotFound(captureContinuationTokens(offlineConnection())));
    const coreApi = await coreApiAnswering(connection, response(PAGE, { "x-ms-continuationtoken": "200" }));

    expect(continuationTokenOf(await coreApi.getProjects())).toBe("200");
  });

  it("has no token for the last page, and takes the first of a repeated header", async () => {
    const connection = captureContinuationTokens(offlineConnection());

    const last = await coreApiAnswering(connection, response(PAGE));
    expect(continuationTokenOf(await last.getProjects())).toBeUndefined();

    const repeated = await coreApiAnswering(connection, response(PAGE, { "x-ms-continuationtoken": ["a", "b"] }));
    expect(continuationTokenOf(await repeated.getProjects())).toBe("a");
  });

  it("ignores a body that is not an object", async () => {
    const coreApi = await coreApiAnswering(captureContinuationTokens(offlineConnection()), response("", { "x-ms-continuationtoken": "100" }));

    await expect(coreApi.getProjects()).resolves.toBeFalsy();
  });

  it("patches a client once even when the connection is wrapped twice", async () => {
    const connection = captureContinuationTokens(captureContinuationTokens(offlineConnection()));
    const coreApi = await coreApiAnswering(connection, response(PAGE, { "x-ms-continuationtoken": "100" }));

    expect(continuationTokenOf(await coreApi.getProjects())).toBe("100");
  });

  it("hands back a client it does not recognise unchanged", async () => {
    const connection = offlineConnection();
    const unfamiliar = { rest: { processResponse: "not a function" } };
    (connection as unknown as { getCoreApi: () => Promise<unknown> }).getCoreApi = () => Promise.resolve(unfamiliar);

    await expect(captureContinuationTokens(connection).getCoreApi()).resolves.toBe(unfamiliar);
    expect(unfamiliar.rest.processResponse).toBe("not a function");
  });

  it("remembers tokens only for objects", () => {
    const page = rememberContinuationToken([1], "t");
    expect(continuationTokenOf(page)).toBe("t");
    expect(rememberContinuationToken("text", "t")).toBe("text");
    expect(continuationTokenOf("text")).toBeUndefined();
    expect(continuationTokenOf(null)).toBeUndefined();
    expect(continuationTokenOf(rememberContinuationToken({}, undefined))).toBeUndefined();
  });
});

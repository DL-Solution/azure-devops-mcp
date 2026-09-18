// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { getBearerHandler, WebApi } from "azure-devops-node-api";

import { reportNotFound } from "../../src/shared/not-found";

const ORG = "https://dev.azure.com/contoso";

interface FakeResponse {
  message: { statusCode: number; headers: Record<string, string> };
  readBody: () => Promise<string>;
}

// The body arrives a tick later, as it does from the network: typed-rest-client resolves a
// 404 before reading the body and fills `result` in afterwards on the same object.
function response(statusCode: number, body: string): FakeResponse {
  return { message: { statusCode, headers: {} }, readBody: () => new Promise((resolve) => setTimeout(() => resolve(body), 5)) };
}

interface RestInternals {
  client: { request: jest.Mock };
  get: (url: string) => Promise<{ statusCode: number; result: unknown }>;
  options: (url: string) => Promise<{ statusCode: number; result: unknown }>;
}

/** A client of `connection` whose HTTP layer answers every request (GET, OPTIONS, …) with `answer`. */
async function clientAnswering(connection: WebApi, answer: FakeResponse): Promise<RestInternals> {
  (connection as unknown as { _getResourceAreas: () => Promise<unknown> })._getResourceAreas = () => Promise.resolve([]);
  const client = (await connection.getCoreApi()) as unknown as { rest: RestInternals };
  client.rest.client.request = jest.fn().mockResolvedValue(answer);
  return client.rest;
}

const PROJECT_MISSING = JSON.stringify({ message: "TF200016: The following project does not exist: nope.", typeKey: "ProjectDoesNotExistWithNameException" });

describe("reportNotFound", () => {
  it("relies on typed-rest-client still turning a 404 into null", async () => {
    // Without this library behaviour the wrapper is unnecessary; if an upgrade changes it, revisit.
    const rest = await clientAnswering(new WebApi(ORG, getBearerHandler("token")), response(404, PROJECT_MISSING));

    await expect(rest.get("https://dev.azure.com/contoso/_apis/projects/nope")).resolves.toMatchObject({ statusCode: 404, result: null });
  });

  it("turns a 404 into an error carrying Azure DevOps' message", async () => {
    const rest = await clientAnswering(reportNotFound(new WebApi(ORG, getBearerHandler("token"))), response(404, PROJECT_MISSING));

    await expect(rest.get("https://dev.azure.com/contoso/_apis/projects/nope")).rejects.toMatchObject({
      message: "TF200016: The following project does not exist: nope.",
      statusCode: 404,
    });
  });

  it("falls back to the raw body, then to the status, when the 404 carries no JSON message", async () => {
    const plain = await clientAnswering(reportNotFound(new WebApi(ORG, getBearerHandler("token"))), response(404, "Page not found"));
    await expect(plain.get("https://dev.azure.com/contoso/x")).rejects.toThrow("Page not found");

    const empty = await clientAnswering(reportNotFound(new WebApi(ORG, getBearerHandler("token"))), response(404, ""));
    await expect(empty.get("https://dev.azure.com/contoso/x")).rejects.toThrow("Not found (404)");
  });

  it("leaves successful responses alone", async () => {
    const rest = await clientAnswering(reportNotFound(new WebApi(ORG, getBearerHandler("token"))), response(200, JSON.stringify({ id: 1 })));

    await expect(rest.get("https://dev.azure.com/contoso/_apis/projects/p")).resolves.toMatchObject({ statusCode: 200, result: { id: 1 } });
  });

  it("keeps the library's null for an OPTIONS 404 — it resolves API locations that way", async () => {
    const rest = await clientAnswering(reportNotFound(new WebApi(ORG, getBearerHandler("token"))), response(404, ""));

    await expect(rest.options("https://dev.azure.com/contoso/_apis/unknownArea")).resolves.toMatchObject({ statusCode: 404, result: null });
  });

  it("hands back a client it does not recognise unchanged", async () => {
    const connection = new WebApi(ORG, getBearerHandler("token"));
    const unfamiliar = { rest: { processResponse: "not a function" } };
    (connection as unknown as { getCoreApi: () => Promise<unknown> }).getCoreApi = () => Promise.resolve(unfamiliar);

    await expect(reportNotFound(connection).getCoreApi()).resolves.toBe(unfamiliar);
    expect(unfamiliar.rest.processResponse).toBe("not a function");
  });

  it("does not touch the Location client the library uses to discover resource areas", async () => {
    const connection = reportNotFound(new WebApi(ORG, getBearerHandler("token")));
    const locations = (await connection.getLocationsApi()) as unknown as { rest: RestInternals };
    locations.rest.client.request = jest.fn().mockResolvedValue(response(404, ""));

    await expect(locations.rest.get("https://dev.azure.com/contoso/_apis/ResourceAreas")).resolves.toMatchObject({ result: null });
  });
});

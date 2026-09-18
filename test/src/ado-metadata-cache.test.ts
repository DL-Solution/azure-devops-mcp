// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { getBearerHandler, WebApi } from "azure-devops-node-api";

// src/shared/ado-metadata-cache.ts logs through src/logger.ts, which pulls in
// @azure/logger; that package has its own internal relative "./logger.js"
// import which the project's moduleNameMapper (meant for "../logger.js" inside
// src/) also matches and then fails to resolve. Mocking it here — the same
// workaround used by test/src/usage-stats.test.ts, test/src/domains.test.ts,
// test/src/org-tenants.test.ts and test/src/pat-auth.test.ts — keeps the real
// logger module (and its transitive import) from ever loading.
jest.mock("../../src/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { clearAdoMetadataCache, shareAdoMetadata } from "../../src/shared/ado-metadata-cache";

const ORG = "https://dev.azure.com/contoso";
const SOME_AREAS = [{ id: "x", locationUrl: "https://dev.azure.com/contoso/" }];

interface Internals {
  _getResourceAreas: () => Promise<unknown>;
}
interface ClientInternals {
  vsoClient: { baseUrl: string; _locationsByAreaPromises: Record<string, unknown> };
}

function connectionWithAreas(load: jest.Mock): WebApi {
  const connection = new WebApi(ORG, getBearerHandler("token"));
  (connection as unknown as Internals)._getResourceAreas = load;
  return shareAdoMetadata(connection);
}

describe("shareAdoMetadata", () => {
  beforeEach(() => clearAdoMetadataCache());

  it("relies on azure-devops-node-api internals that still exist", async () => {
    // If this fails after a dependency upgrade, the cache silently stopped working.
    const connection = new WebApi(ORG, getBearerHandler("token"));
    expect(typeof (connection as unknown as Internals)._getResourceAreas).toBe("function");
    (connection as unknown as Internals)._getResourceAreas = jest.fn().mockResolvedValue([]);
    const client = (await connection.getCoreApi()) as unknown as ClientInternals;
    expect(typeof client.vsoClient.baseUrl).toBe("string");
    expect(typeof client.vsoClient._locationsByAreaPromises).toBe("object");
  });

  it("loads the resource areas once per organization", async () => {
    const first = jest.fn().mockResolvedValue(SOME_AREAS);
    const second = jest.fn().mockResolvedValue(SOME_AREAS);
    const a = connectionWithAreas(first);
    const b = connectionWithAreas(second);

    await (a as unknown as Internals)._getResourceAreas();
    await (b as unknown as Internals)._getResourceAreas();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("does not keep a failed lookup", async () => {
    const failing = jest.fn().mockRejectedValue(new Error("401"));
    const working = jest.fn().mockResolvedValue(SOME_AREAS);

    await expect((connectionWithAreas(failing) as unknown as Internals)._getResourceAreas()).rejects.toThrow("401");
    await (connectionWithAreas(working) as unknown as Internals)._getResourceAreas();

    expect(working).toHaveBeenCalledTimes(1);
  });

  it("does not keep an undefined lookup", async () => {
    const empty = jest.fn().mockResolvedValue(undefined);
    const working = jest.fn().mockResolvedValue(SOME_AREAS);

    await (connectionWithAreas(empty) as unknown as Internals)._getResourceAreas();
    await (connectionWithAreas(working) as unknown as Internals)._getResourceAreas();

    expect(working).toHaveBeenCalledTimes(1);
  });

  it("does not keep a null lookup", async () => {
    const nullResult = jest.fn().mockResolvedValue(null);
    const working = jest.fn().mockResolvedValue(SOME_AREAS);

    await (connectionWithAreas(nullResult) as unknown as Internals)._getResourceAreas();
    await (connectionWithAreas(working) as unknown as Internals)._getResourceAreas();

    expect(working).toHaveBeenCalledTimes(1);
  });

  it("does not keep an empty-array lookup", async () => {
    const empty = jest.fn().mockResolvedValue([]);
    const working = jest.fn().mockResolvedValue(SOME_AREAS);

    await (connectionWithAreas(empty) as unknown as Internals)._getResourceAreas();
    await (connectionWithAreas(working) as unknown as Internals)._getResourceAreas();

    expect(working).toHaveBeenCalledTimes(1);
  });

  it("keeps the on-prem {count: 0} shape", async () => {
    const onPrem = jest.fn().mockResolvedValue({ count: 0, value: null });
    const working = jest.fn().mockResolvedValue(SOME_AREAS);

    await (connectionWithAreas(onPrem) as unknown as Internals)._getResourceAreas();
    await (connectionWithAreas(working) as unknown as Internals)._getResourceAreas();

    expect(working).not.toHaveBeenCalled();
  });

  it("falls back to its own loader when the shared in-flight lookup rejects for a caller that did not start it", async () => {
    let rejectShared!: (err: unknown) => void;
    const initiatorLoad = jest.fn().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectShared = reject;
        })
    );
    const ownLoad = jest.fn().mockResolvedValue(SOME_AREAS);

    const initiator = connectionWithAreas(initiatorLoad);
    const other = connectionWithAreas(ownLoad);

    const initiatorPromise = (initiator as unknown as Internals)._getResourceAreas();
    const otherPromise = (other as unknown as Internals)._getResourceAreas();

    rejectShared(new Error("401"));

    await expect(initiatorPromise).rejects.toThrow("401");
    await expect(otherPromise).resolves.toEqual(SOME_AREAS);
    expect(ownLoad).toHaveBeenCalledTimes(1);
  });

  it("shares area locations between clients of different connections", async () => {
    // [] here is the on-prem "no resource areas" shape the library documents:
    // _getResourceAreaUrl treats an empty array like {count: 0} and routes to
    // the org URL directly, so getCoreApi/getGitApi succeed without needing a
    // matching resource area id. It is unrelated to this test, which is about
    // the separate location cache, not the resource-areas cache.
    const a = connectionWithAreas(jest.fn().mockResolvedValue([]));
    const b = connectionWithAreas(jest.fn().mockResolvedValue([]));

    const first = (await a.getCoreApi()) as unknown as ClientInternals;
    const second = (await b.getGitApi()) as unknown as ClientInternals;

    expect(first.vsoClient._locationsByAreaPromises).toBe(second.vsoClient._locationsByAreaPromises);
  });

  it("keeps locations of different hosts apart", async () => {
    // See the comment above: [] is the on-prem shape, unrelated to this test.
    const a = connectionWithAreas(jest.fn().mockResolvedValue([]));

    const core = (await a.getCoreApi()) as unknown as ClientInternals;
    const other = (await a.getCoreApi("https://vssps.dev.azure.com/contoso")) as unknown as ClientInternals;

    expect(core.vsoClient._locationsByAreaPromises).not.toBe(other.vsoClient._locationsByAreaPromises);
  });

  it("returns the same object and warns once, even across two calls, when node-api internals are missing", () => {
    jest.isolateModules(() => {
      // jest.isolateModules needs require() inside its callback: an import at
      // module scope would resolve before the sandbox exists.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require("../../src/logger");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { shareAdoMetadata: shareAdoMetadataIsolated } = require("../../src/shared/ado-metadata-cache");
      const connectionWithoutInternals = {} as WebApi;

      const first = shareAdoMetadataIsolated(connectionWithoutInternals);
      const second = shareAdoMetadataIsolated(connectionWithoutInternals);

      expect(first).toBe(connectionWithoutInternals);
      expect(second).toBe(connectionWithoutInternals);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });
});

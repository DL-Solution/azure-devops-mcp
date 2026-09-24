// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, jest, afterEach } from "@jest/globals";
import { logger } from "../../src/logger";

// @azure/logger imports its own ./logger.js, which the jest moduleNameMapper would rewrite to ours.
jest.mock("@azure/logger", () => ({ setLogLevel: jest.fn() }));

function captureLine(log: () => void): Record<string, unknown> {
  const lines: string[] = [];
  const write = jest.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  try {
    log();
  } finally {
    write.mockRestore();
  }
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]);
}

describe("logger", () => {
  afterEach(() => jest.restoreAllMocks());

  // Winston's JSON format silently drops a string passed after the message; the reason for a warning was lost that way.
  it("keeps a string passed after the message as detail", () => {
    const line = captureLine(() => logger.warn("OAuth state eviction failed", "Table not found"));

    expect(line).toMatchObject({ level: "warn", message: "OAuth state eviction failed", detail: "Table not found" });
  });

  it("leaves structured metadata as it is", () => {
    const line = captureLine(() => logger.warn("Entra token request rejected", { status: 400, error: "invalid_grant" }));

    expect(line).toMatchObject({ status: 400, error: "invalid_grant" });
    expect(line).not.toHaveProperty("detail");
  });
});

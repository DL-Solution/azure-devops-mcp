// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";

import { optionalProject, optionalProjectWith, optionalTeam, optionalTeamWith, requiredProject, requiredTeam } from "../../src/shared/common-params";

describe("common project and team params", () => {
  it("makes the optional ones optional and the required ones required", () => {
    expect(optionalProject.isOptional()).toBe(true);
    expect(optionalTeam.isOptional()).toBe(true);
    expect(requiredProject.isOptional()).toBe(false);
    expect(requiredTeam.isOptional()).toBe(false);
  });

  it("accepts a name or an id, and rejects a non-string", () => {
    expect(requiredProject.parse("Contoso")).toBe("Contoso");
    expect(optionalProject.parse(undefined)).toBeUndefined();
    expect(() => requiredProject.parse(42)).toThrow();
  });

  // These schemas are repeated across every tool, so any description added
  // here costs the model context on every single request. What "project" and
  // "team" mean is said once in `instructions` instead (see
  // server-instructions.ts), not per parameter.
  it("carries no description on the bare schemas", () => {
    for (const schema of [optionalProject, requiredProject, optionalTeam, requiredTeam]) {
      expect(schema.description).toBeUndefined();
    }
  });

  it("describes a builder with only the caller-visible note, no boilerplate", () => {
    expect(optionalProjectWith("The project to delete.").description).toBe("The project to delete.");
    expect(optionalTeamWith("Omit for project-scoped dashboards.").description).toBe("Omit for project-scoped dashboards.");
  });
});

// The wording lives in one module precisely so it cannot drift back into 171
// hand-written copies.
describe("tool modules", () => {
  const toolsDir = path.join(__dirname, "../../src/tools");

  // Matches any hand-written describe() whose text names the project or team
  // as such — the first sweep only caught one wording and left eleven sites
  // spelled "The unique identifier (ID or name) of the Azure DevOps project".
  const INLINE_DESCRIPTION = /\.describe\(\s*"[^"]*\bAzure DevOps (project|team)\b[^"]*"/;

  it("do not re-describe project or team inline", () => {
    const offenders = fs
      .readdirSync(toolsDir)
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => INLINE_DESCRIPTION.test(fs.readFileSync(path.join(toolsDir, file), "utf8")));

    expect(offenders).toEqual([]);
  });
});

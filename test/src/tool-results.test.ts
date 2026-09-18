// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { errorMessage, jsonResult, toolError } from "../../src/shared/tool-results";

describe("tool-results", () => {
  it("serializes JSON compactly", () => {
    expect(jsonResult({ a: [1, 2] })).toEqual({ content: [{ type: "text", text: '{"a":[1,2]}' }] });
  });

  it("reads the message of an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("passes a thrown string through", () => {
    expect(errorMessage("boom")).toBe("boom");
  });

  it("does not print an arbitrary thrown value", () => {
    expect(errorMessage({ status: 500 })).toBe("Unknown error occurred");
  });

  it("formats a tool error the way every tool always has", () => {
    expect(toolError("fetching project teams", new Error("401"))).toEqual({
      content: [{ type: "text", text: "Error fetching project teams: 401" }],
      isError: true,
    });
  });
});

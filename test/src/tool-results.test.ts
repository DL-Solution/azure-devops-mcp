// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { errorMessage, jsonResult, pagedResult, toolError } from "../../src/shared/tool-results";

describe("tool-results", () => {
  it("serializes JSON compactly", () => {
    expect(jsonResult({ a: [1, 2] })).toEqual({ content: [{ type: "text", text: '{"a":[1,2]}' }] });
  });

  it("wraps a page of items with its continuation token, first so a truncated page still shows it", () => {
    expect(pagedResult([1], "next").content[0]).toEqual({ type: "text", text: '{"hasMore":true,"continuationToken":"next","items":[1]}' });
  });

  it("marks the last page, which has no continuation token", () => {
    expect(pagedResult([1]).content[0]).toEqual({ type: "text", text: '{"hasMore":false,"items":[1]}' });
    expect(pagedResult([], "").content[0]).toEqual({ type: "text", text: '{"hasMore":false,"items":[]}' });
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

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { compactJsonText, errorMessage, jsonResult, jsonTextResult, pagedResult, shapeForOutput, toolError } from "../../src/shared/tool-results";

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

const ORG = "https://dev.azure.com/fabrikam";

/** An identity field as a work item carries it (System.AssignedTo, System.CreatedBy, …). */
function identity(name: string, id: string) {
  const descriptor = `aad.${Buffer.from(id).toString("base64")}`;
  return {
    displayName: name,
    url: `https://spsprodweu5.vssps.visualstudio.com/A1b2c3d4-e5f6/_apis/Identities/${id}`,
    _links: { avatar: { href: `${ORG}/_apis/GraphProfile/MemberAvatars/${descriptor}` } },
    id,
    uniqueName: `${name.toLowerCase().replace(" ", ".")}@fabrikam.com`,
    imageUrl: `${ORG}/_apis/GraphProfile/MemberAvatars/${descriptor}`,
    descriptor,
  };
}

/** A work item as GET _apis/wit/workitems/{id}?$expand=all returns it. */
function workItem(id: number) {
  const creator = identity("Jamal Hartnett", "d291b0c4-a05c-4ea6-8df1-4b41d5f39eff");
  const assignee = identity("Norman Paulk", "8c8c7d32-6b1b-47f4-b2e9-30b477b5ab3d");
  const project = "6ce954b1-ce1f-45d1-b94d-e6bf2464ba2c";
  return {
    id,
    rev: 7,
    fields: {
      "System.AreaPath": "Fabrikam-Fiber-Git",
      "System.TeamProject": "Fabrikam-Fiber-Git",
      "System.IterationPath": "Fabrikam-Fiber-Git\\Sprint 1",
      "System.WorkItemType": "Product Backlog Item",
      "System.State": "Committed",
      "System.Reason": "Commitment made by the team",
      "System.AssignedTo": assignee,
      "System.CreatedDate": "2026-09-01T10:14:23.03Z",
      "System.CreatedBy": creator,
      "System.ChangedDate": "2026-09-20T08:40:11.2Z",
      "System.ChangedBy": creator,
      "System.CommentCount": 2,
      "System.Title": "Customer can sign in using their Microsoft Account",
      "Microsoft.VSTS.Common.Priority": 1,
      "Microsoft.VSTS.Scheduling.Effort": 8,
      "System.Description": "<div>Our authorization logic needs to allow for users with Microsoft accounts (formerly Live Ids).</div>",
    },
    relations: [
      {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `${ORG}/_apis/wit/workItems/${id - 1}`,
        attributes: { isLocked: false, name: "Parent" },
      },
      {
        rel: "AttachedFile",
        url: `${ORG}/_apis/wit/attachments/1c81ed2c-4f1b-47c4-8a3c-b1a4c1d2e3f4`,
        attributes: { authorizedDate: "2026-09-02T09:00:00Z", id: 1, resourceSize: 4096, name: "spec.docx" },
      },
    ],
    _links: {
      self: { href: `${ORG}/_apis/wit/workItems/${id}` },
      workItemUpdates: { href: `${ORG}/_apis/wit/workItems/${id}/updates` },
      workItemRevisions: { href: `${ORG}/_apis/wit/workItems/${id}/revisions` },
      workItemComments: { href: `${ORG}/_apis/wit/workItems/${id}/comments` },
      html: { href: `${ORG}/web/wi.aspx?pcguid=20cda608-32f0-4e6e-9b7c-8def7b38d15a&id=${id}` },
      workItemType: { href: `${ORG}/${project}/_apis/wit/workItemTypes/Product%20Backlog%20Item` },
      fields: { href: `${ORG}/_apis/wit/fields` },
    },
    url: `${ORG}/_apis/wit/workItems/${id}`,
  };
}

/** A page of GET _apis/graph/Memberships/{descriptor}. */
function memberships(count: number) {
  const value = Array.from({ length: count }, (_, i) => {
    const member = `aad.${Buffer.from(`member-${i}`).toString("base64")}`;
    const container = `vssgp.${Buffer.from(`group-${i}`).toString("base64")}`;
    return {
      containerDescriptor: container,
      memberDescriptor: member,
      _links: {
        self: { href: `https://vssps.dev.azure.com/fabrikam/_apis/Graph/Memberships/${member}/${container}` },
        member: { href: `https://vssps.dev.azure.com/fabrikam/_apis/Graph/Users/${member}` },
        container: { href: `https://vssps.dev.azure.com/fabrikam/_apis/Graph/Groups/${container}` },
      },
    };
  });
  return { count, value };
}

describe("response shaping", () => {
  it("drops _links everywhere, keeping the web page as webUrl and every url field", () => {
    const item = workItem(42);
    const shaped = JSON.parse(jsonResult([item]).content[0].text as string);

    expect(JSON.stringify(shaped)).not.toContain("_links");
    expect(shaped[0].webUrl).toBe(item._links.html.href);
    expect(shaped[0].url).toBe(item.url);
    expect(shaped[0].relations.map((r: { url: string }) => r.url)).toEqual(item.relations.map((r) => r.url));
    expect(shaped[0].fields["System.AssignedTo"]).toEqual({ ...item.fields["System.AssignedTo"], _links: undefined });
    expect(shaped[0].fields["System.AssignedTo"].imageUrl).toBe(item.fields["System.AssignedTo"].imageUrl);
    // The input is not modified.
    expect(item._links.self.href).toContain("/workItems/42");
    expect(item.fields["System.AssignedTo"]._links).toBeDefined();
  });

  it("makes a work item and a Graph membership page substantially smaller", () => {
    const items = [workItem(101), workItem(102), workItem(103)];
    const page = memberships(20);
    const itemsBefore = JSON.stringify(items).length;
    const itemsAfter = (jsonResult(items).content[0].text as string).length;
    const pageBefore = JSON.stringify(page).length;
    const pageAfter = compactJsonText(JSON.stringify(page)).length;

    // Measured on these fixtures: work items 28% smaller (10864 -> 7780 chars,
    // with an HTML description and two relations), memberships 79% smaller (8002 -> 1682).
    expect(1 - itemsAfter / itemsBefore).toBeGreaterThan(0.25);
    expect(1 - pageAfter / pageBefore).toBeGreaterThan(0.75);
  });

  it("prefers _links.web to _links.html, and never replaces an existing webUrl", () => {
    expect(shapeForOutput({ _links: { html: { href: "h" }, web: { href: "w" } } })).toEqual({ webUrl: "w" });
    expect(shapeForOutput({ webUrl: "mine", _links: { web: { href: "w" } } })).toEqual({ webUrl: "mine" });
    expect(shapeForOutput({ _links: { self: { href: "s" } }, id: 1 })).toEqual({ id: 1 });
    expect(shapeForOutput({ _links: null, a: [{ _links: { web: { href: "" } }, b: 1 }] })).toEqual({ a: [{ b: 1 }] });
  });

  it("leaves dates, primitives and self-serializing values alone", () => {
    const date = new Date("2026-01-02T03:04:05Z");
    expect(jsonResult({ date, n: 1, s: "x", nothing: null }).content[0].text).toBe('{"date":"2026-01-02T03:04:05.000Z","n":1,"s":"x","nothing":null}');
    expect(shapeForOutput("text")).toBe("text");
  });

  it("still rejects a cycle, as JSON.stringify always did", () => {
    const cyclic: Record<string, unknown> = { _links: {} };
    cyclic.self = cyclic;
    expect(() => jsonResult(cyclic)).toThrow(/circular/i);
  });

  it("stops descending past a sane depth", () => {
    let deep: Record<string, unknown> = { _links: { self: { href: "x" } } };
    for (let i = 0; i < 100; i++) deep = { child: deep };
    expect(JSON.stringify(shapeForOutput(deep))).toContain("_links");
  });

  it("shapes a JSON response body, and passes anything else through", () => {
    const body = JSON.stringify({ count: 1, value: [{ id: 1, _links: { web: { href: "w" } } }] });
    expect(compactJsonText(body)).toBe('{"count":1,"value":[{"id":1,"webUrl":"w"}]}');
    expect(jsonTextResult(body)).toEqual({ content: [{ type: "text", text: '{"count":1,"value":[{"id":1,"webUrl":"w"}]}' }] });

    // Unchanged, byte for byte: bodies without links, empty bodies, non-JSON text.
    const pretty = '{\n  "id": 12345678901234567890\n}';
    expect(compactJsonText(pretty)).toBe(pretty);
    expect(compactJsonText("")).toBe("");
    expect(compactJsonText('not json "_links"')).toBe('not json "_links"');
    expect(compactJsonText('"_links"')).toBe('"_links"');
    expect(jsonTextResult("Done.")).toEqual({ content: [{ type: "text", text: "Done." }] });
  });
});

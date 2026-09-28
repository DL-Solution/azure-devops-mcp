// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from "@jest/globals";
import { adoErrorMessage, adoErrorText, HTML_INSTEAD_OF_JSON, isHtmlResponse, subdomainBaseUrl } from "../../src/shared/ado-rest";

describe("subdomainBaseUrl", () => {
  it("maps the cloud host to the given subdomain", () => {
    expect(subdomainBaseUrl("https://dev.azure.com/contoso", "vsaex")).toBe("https://vsaex.dev.azure.com/contoso");
  });

  it("trims a trailing slash before mapping the cloud host", () => {
    expect(subdomainBaseUrl("https://dev.azure.com/contoso/", "vsaex")).toBe("https://vsaex.dev.azure.com/contoso");
  });

  it("maps the legacy visualstudio.com host to the given subdomain", () => {
    expect(subdomainBaseUrl("https://contoso.visualstudio.com", "vsaex")).toBe("https://contoso.vsaex.visualstudio.com");
  });

  it("keeps a path suffix on the legacy visualstudio.com host", () => {
    expect(subdomainBaseUrl("https://contoso.visualstudio.com/DefaultCollection", "vsaex")).toBe("https://contoso.vsaex.visualstudio.com/DefaultCollection");
  });

  it("falls back to the same host for on-prem Azure DevOps Server", () => {
    expect(subdomainBaseUrl("https://tfs.contoso.local/DefaultCollection", "vsaex")).toBe("https://tfs.contoso.local/DefaultCollection");
  });

  it("trims a trailing slash for on-prem Azure DevOps Server too", () => {
    expect(subdomainBaseUrl("https://tfs.contoso.local/DefaultCollection/", "vsaex")).toBe("https://tfs.contoso.local/DefaultCollection");
  });
});

describe("REST error bodies", () => {
  const response = (status: number, contentType?: string) => new Response(null, { status, headers: contentType ? { "content-type": contentType } : {} });

  it("takes the message of an Azure DevOps JSON error", () => {
    const body = JSON.stringify({
      $id: "1",
      innerException: null,
      message: "TF401019: The Git repository does not exist.",
      typeName: "Microsoft.TeamFoundation.Git.Server.GitRepositoryNotFoundException",
      typeKey: "GitRepositoryNotFoundException",
      errorCode: 0,
      eventId: 3000,
    });
    expect(adoErrorText(response(404, "application/json; charset=utf-8"), body)).toBe("404: TF401019: The Git repository does not exist.");
  });

  it("reads the wrapped value.Message and OData error.message shapes", () => {
    expect(adoErrorMessage(response(400, "application/json"), '{"count":1,"value":{"Message":"The request is invalid."}}')).toBe("The request is invalid.");
    expect(adoErrorMessage(response(400, "application/json"), '{"error":{"code":"0","message":"Could not find a property named \'Foo\'."}}')).toBe("Could not find a property named 'Foo'.");
  });

  it("recognizes a JSON body served without a JSON content type", () => {
    expect(adoErrorText(response(403), '{"message":"VS800075: no permission"}')).toBe("403: VS800075: no permission");
  });

  it("keeps a JSON body that carries no message, and a body that only looks like JSON", () => {
    expect(adoErrorText(response(500, "application/json"), '{"code":42}')).toBe('500: {"code":42}');
    expect(adoErrorText(response(500, "application/json"), "{not json")).toBe("500: {not json");
  });

  it("replaces an HTML page with one sentence", () => {
    const page = `<!DOCTYPE html><html><head><title>Azure DevOps Services | Sign In</title></head><body>${"x".repeat(5000)}</body></html>`;
    expect(adoErrorText(response(401, "text/html; charset=utf-8"), page)).toBe(`401: ${HTML_INSTEAD_OF_JSON}`);
    // No content type: the body itself gives the page away.
    expect(adoErrorText(response(302), '  <html lang="en"><body>Object moved</body></html>')).toBe(`302: ${HTML_INSTEAD_OF_JSON}`);
  });

  it("treats a 203 sign-in page as HTML even though it is a 2xx", () => {
    const signIn = response(203, "text/html; charset=utf-8");
    expect(signIn.ok).toBe(true);
    expect(isHtmlResponse(signIn)).toBe(true);
    expect(adoErrorText(signIn, "<!doctype html><html></html>")).toBe(`203: ${HTML_INSTEAD_OF_JSON}`);
  });

  it("does not take JSON or plain text for HTML", () => {
    expect(isHtmlResponse(response(200, "application/json"), '{"value":[]}')).toBe(false);
    expect(isHtmlResponse(response(200), "<htmlish> is not a tag")).toBe(false);
    expect(isHtmlResponse(response(200))).toBe(false);
  });

  it("copes with a response double that has no headers", () => {
    const bare = { status: 500 } as unknown as Response;
    expect(isHtmlResponse(bare)).toBe(false);
    expect(adoErrorText(bare, "boom")).toBe("500: boom");
  });

  it("cuts a long text body to 1000 characters", () => {
    const text = adoErrorMessage(response(500, "text/plain"), "a".repeat(1500));
    expect(text).toBe(`${"a".repeat(1000)}… (500 more characters)`);
  });

  it("cuts a very long JSON message too", () => {
    expect(adoErrorMessage(response(400, "application/json"), JSON.stringify({ message: "m".repeat(1200) }))).toBe(`${"m".repeat(1000)}… (200 more characters)`);
  });
});

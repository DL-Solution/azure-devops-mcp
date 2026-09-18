// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from "@jest/globals";
import { subdomainBaseUrl } from "../../src/shared/ado-rest";

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

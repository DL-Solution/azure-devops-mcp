// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, jest } from "@jest/globals";

// domains.ts pulls in the winston logger, whose Azure dependency confuses the
// suite's ".js" -> ".ts" module mapping.
jest.mock("../../src/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { Domain } from "../../src/shared/domains";
import { createHash } from "node:crypto";

import { DOMAIN_LABELS, LANDING_PAGE_HEADERS, LANDING_PAGE_SCRIPT, LandingEndpoint, LandingPageOptions, renderLandingPage, toolCountLabel } from "../../src/shared/landing-page";
import { PRESET_NAMES, TOOL_PRESETS } from "../../src/shared/presets";

const endpoints: LandingEndpoint[] = [
  ...PRESET_NAMES.map((name) => ({ path: `/mcp/${name}`, preset: name, domains: [...TOOL_PRESETS[name]], toolCount: 100 })),
  { path: "/mcp", domains: Object.values(Domain).filter((domain) => domain !== Domain.MCP_APPS), toolCount: 397 },
];

const options = (overrides: Partial<LandingPageOptions> = {}): LandingPageOptions => ({
  baseUrl: "https://ado-mcp.example.com",
  organization: "dl-sol",
  version: "3.0.0",
  auth: "oauth",
  endpoints,
  ...overrides,
});

describe("DOMAIN_LABELS", () => {
  it("names every domain, so a new one cannot show up on the page as its raw id", () => {
    for (const domain of Object.values(Domain)) {
      expect(DOMAIN_LABELS[domain]).toBeTruthy();
    }
  });
});

describe("toolCountLabel", () => {
  it.each([
    [1, "1 інструмент"],
    [21, "21 інструмент"],
    [11, "11 інструментів"],
    [2, "2 інструменти"],
    [152, "152 інструменти"],
    [12, "12 інструментів"],
    [114, "114 інструментів"],
    [125, "125 інструментів"],
    [397, "397 інструментів"],
    [0, "0 інструментів"],
  ])("%i → %s", (count, label) => {
    expect(toolCountLabel(count)).toBe(label);
  });
});

describe("renderLandingPage", () => {
  it("lists every endpoint with its full URL and tool count", () => {
    const html = renderLandingPage(options());

    for (const endpoint of endpoints) {
      expect(html).toContain(`<code class="url">https://ado-mcp.example.com${endpoint.path}</code>`);
    }
    expect(html).toContain("397 інструментів");
    expect(html).toContain("dl-sol");
  });

  it("describes a preset's own areas but not the base every preset shares", () => {
    const html = renderLandingPage(options({ endpoints: [{ path: "/mcp/dev", preset: "dev", domains: [Domain.CORE, Domain.REPOSITORIES], toolCount: 5 }] }));

    expect(html).toContain(`<p class="muted">${DOMAIN_LABELS[Domain.REPOSITORIES]}</p>`);
  });

  it("uses the dev endpoint in the connection examples when it is served", () => {
    const html = renderLandingPage(options());

    expect(html).toContain("claude mcp add --transport http ado-dev https://ado-mcp.example.com/mcp/dev");
  });

  it("falls back to the first endpoint when there is no dev preset", () => {
    const html = renderLandingPage(options({ endpoints: [{ path: "/mcp", domains: [Domain.CORE], toolCount: 3 }] }));

    expect(html).toContain("claude mcp add --transport http ado https://ado-mcp.example.com/mcp");
  });

  it("explains browser sign-in in oauth mode", () => {
    const html = renderLandingPage(options({ auth: "oauth" }));

    expect(html).toContain("Add custom connector");
    expect(html).not.toContain("az account get-access-token");
  });

  it("explains the bearer token in passthrough mode", () => {
    const html = renderLandingPage(options({ auth: "passthrough" }));

    expect(html).toContain("az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798");
    expect(html).toContain('"Authorization": "Bearer ${input:ado_token}"');
    expect(html).not.toContain("Add custom connector");
  });

  it("escapes everything interpolated", () => {
    const html = renderLandingPage(options({ organization: "<script>alert(1)</script>", baseUrl: 'https://x.example/"><img src=x>' }));

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toMatch(/<script>[^<]*alert/);
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("puts a copy button next to every endpoint URL, hidden until the script enables it", () => {
    const html = renderLandingPage(options());

    for (const endpoint of endpoints) {
      const url = `https://ado-mcp.example.com${endpoint.path}`;
      expect(html).toContain(`<button type="button" class="copy" data-copy="${url}" aria-label="Копіювати ${url}" aria-live="polite" hidden>Копіювати</button>`);
    }
  });

  it("escapes the text a copy button carries", () => {
    const html = renderLandingPage(options({ baseUrl: 'https://x.example/" onclick="alert(1)' }));

    expect(html).not.toContain('" onclick="alert(1)');
    expect(html).toContain('data-copy="https://x.example/&quot; onclick=&quot;alert(1)');
  });

  it("carries only the static copy script, which the CSP admits by its hash", () => {
    const html = renderLandingPage(options());
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

    expect(scripts).toEqual([LANDING_PAGE_SCRIPT]);
    const hash = createHash("sha256").update(LANDING_PAGE_SCRIPT, "utf8").digest("base64");
    expect(LANDING_PAGE_HEADERS["Content-Security-Policy"]).toContain(`script-src 'sha256-${hash}'`);
    expect(LANDING_PAGE_HEADERS["Content-Security-Policy"]).not.toMatch(/script-src[^;]*unsafe/);
  });
});

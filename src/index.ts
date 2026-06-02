#!/usr/bin/env node

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getBearerHandler, getPersonalAccessTokenHandler, WebApi } from "azure-devops-node-api";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { createAuthenticator } from "./auth.js";
import { logger } from "./logger.js";
import { getOrgTenant } from "./org-tenants.js";
//import { configurePrompts } from "./prompts.js";
import { configureAllTools } from "./tools.js";
import { UserAgentComposer } from "./useragent.js";
import { packageVersion } from "./version.js";
import { DomainsManager } from "./shared/domains.js";
import { getRequestToken, startHttpServer } from "./transports/http.js";

function isGitHubCodespaceEnv(): boolean {
  return process.env.CODESPACES === "true" && !!process.env.CODESPACE_NAME;
}

const defaultAuthenticationType = isGitHubCodespaceEnv() ? "azcli" : "interactive";

// Parse command line arguments using yargs
const argv = yargs(hideBin(process.argv))
  .scriptName("mcp-server-azuredevops")
  .usage("Usage: $0 <organization> [options]")
  .version(packageVersion)
  .command("$0 <organization> [options]", "Azure DevOps MCP Server", (yargs) => {
    yargs.positional("organization", {
      describe: "Azure DevOps organization name",
      type: "string",
      demandOption: true,
    });
  })
  .option("domains", {
    alias: "d",
    describe: "Domain(s) to enable: 'all' for everything, or specific domains like 'repositories builds work'. Defaults to 'all'.",
    type: "string",
    array: true,
    default: "all",
  })
  .option("authentication", {
    alias: "a",
    describe: "Type of authentication to use",
    type: "string",
    choices: ["interactive", "azcli", "env", "envvar", "pat"],
    default: defaultAuthenticationType,
  })
  .option("tenant", {
    alias: "t",
    describe: "Azure tenant ID (optional, applied when using 'interactive' and 'azcli' type of authentication)",
    type: "string",
  })
  .option("transport", {
    describe:
      "Transport to serve the MCP server over. 'stdio' (default) runs locally over stdin/stdout. 'http' serves a Streamable HTTP endpoint using token pass-through (each request must carry an Azure DevOps bearer token).",
    type: "string",
    choices: ["stdio", "http"],
    default: "stdio",
  })
  .option("host", {
    describe: "Host/interface to bind when using the 'http' transport. Defaults to 127.0.0.1 (loopback only); expose externally via a reverse proxy.",
    type: "string",
    default: "127.0.0.1",
  })
  .option("port", {
    describe: "Port to listen on when using the 'http' transport.",
    type: "number",
    default: 3000,
  })
  .option("path", {
    describe: "URL path that serves the MCP endpoint when using the 'http' transport.",
    type: "string",
    default: "/mcp",
  })
  .option("allowed-hosts", {
    describe:
      "Hosts permitted in the Host header (DNS rebinding protection) for the 'http' transport. Defaults to the bound host/port plus localhost. Set this to your public hostname when running behind a reverse proxy.",
    type: "string",
    array: true,
  })
  .option("allowed-origins", {
    describe: "Origins permitted in the Origin header for the 'http' transport. By default only requests without an Origin (non-browser clients) are accepted.",
    type: "string",
    array: true,
  })
  .help()
  .parseSync();

export const orgName = argv.organization as string;
const orgUrl = "https://dev.azure.com/" + orgName;

const domainsManager = new DomainsManager(argv.domains);
export const enabledDomains = domainsManager.getEnabledDomains();

function getAzureDevOpsClient(getAzureDevOpsToken: () => Promise<string>, userAgentComposer: UserAgentComposer, authType: string): () => Promise<WebApi> {
  return async () => {
    const accessToken = await getAzureDevOpsToken();
    // For pat, accessToken is base64("{email}:{token}"). Decode to extract the token part,
    // since getPersonalAccessTokenHandler prepends ":" internally and just needs the raw token.
    const authHandler = authType === "pat" ? getPersonalAccessTokenHandler(Buffer.from(accessToken, "base64").toString("utf8").split(":").slice(1).join(":")) : getBearerHandler(accessToken);
    const connection = new WebApi(orgUrl, authHandler, undefined, {
      productName: "AzureDevOps.MCP",
      productVersion: packageVersion,
      userAgent: userAgentComposer.userAgent,
    });
    return connection;
  };
}

function createConfiguredServer(authenticator: () => Promise<string>, connectionProvider: () => Promise<WebApi>, userAgentComposer: UserAgentComposer): McpServer {
  const server = new McpServer({
    name: "Azure DevOps MCP Server",
    version: packageVersion,
    icons: [
      {
        src: "https://cdn.vsassets.io/content/icons/favicon.ico",
      },
    ],
  });

  server.server.oninitialized = () => {
    userAgentComposer.appendMcpClientInfo(server.server.getClientVersion());
  };

  // removing prompts untill further notice
  // configurePrompts(server);

  configureAllTools(server, authenticator, connectionProvider, () => userAgentComposer.userAgent, enabledDomains);

  return server;
}

async function runHttpTransport(userAgentComposer: UserAgentComposer) {
  logger.info("HTTP transport uses token pass-through; the '--authentication' option is ignored. Each request must supply an Azure DevOps bearer token in the 'Authorization' header.");

  // Token pass-through: resolve the bearer token from the in-flight request rather
  // than from process-wide credentials, so each caller acts as themselves and no
  // credential is ever stored on the server.
  const authenticator = () => Promise.resolve(getRequestToken());
  const connectionProvider = getAzureDevOpsClient(authenticator, userAgentComposer, "bearer");

  const allowedHosts = argv.allowedHosts && argv.allowedHosts.length > 0 ? argv.allowedHosts : [`${argv.host}:${argv.port}`, `localhost:${argv.port}`, `127.0.0.1:${argv.port}`];

  await startHttpServer({
    host: argv.host,
    port: argv.port,
    mcpPath: argv.path,
    allowedHosts,
    allowedOrigins: argv.allowedOrigins,
    createServer: () => createConfiguredServer(authenticator, connectionProvider, userAgentComposer),
  });
}

async function runStdioTransport(userAgentComposer: UserAgentComposer) {
  const tenantId = (await getOrgTenant(orgName)) ?? argv.tenant;
  const authenticator = createAuthenticator(argv.authentication, tenantId);

  if (argv.authentication === "pat") {
    const basicValue = await authenticator();
    // basicValue is already base64("{email}:{token}") — use it directly in the Authorization header
    const _originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.headers) {
        const headers = new Headers(init.headers as HeadersInit);
        if (headers.get("Authorization")?.startsWith("Bearer ")) {
          headers.set("Authorization", `Basic ${basicValue}`);
          init = { ...init, headers };
        }
      }
      return _originalFetch(input, init);
    };
    logger.debug("PAT mode: global fetch interceptor installed to rewrite Bearer -> Basic auth headers");
  }

  const server = createConfiguredServer(authenticator, getAzureDevOpsClient(authenticator, userAgentComposer, argv.authentication), userAgentComposer);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main() {
  logger.info("Starting Azure DevOps MCP Server", {
    organization: orgName,
    organizationUrl: orgUrl,
    transport: argv.transport,
    authentication: argv.authentication,
    tenant: argv.tenant,
    domains: argv.domains,
    enabledDomains: Array.from(enabledDomains),
    version: packageVersion,
    isCodespace: isGitHubCodespaceEnv(),
  });

  const userAgentComposer = new UserAgentComposer(packageVersion);

  if (argv.transport === "http") {
    await runHttpTransport(userAgentComposer);
  } else {
    await runStdioTransport(userAgentComposer);
  }
}

main().catch((error) => {
  logger.error("Fatal error in main():", error);
  process.exit(1);
});

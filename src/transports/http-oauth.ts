// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// HTTP transport that fronts the MCP server with a full OAuth 2.1 authorization
// server (dynamic client registration + metadata), bridging sign-in to
// Microsoft Entra ID. This lets MCP clients that rely on DCR (e.g. Claude)
// connect with just a URL and a browser login, instead of a pre-supplied token.

import { createServer as createHttpServer, Server } from "node:http";

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";

import { logger } from "../logger.js";
import { isOriginAllowed, runWithRequestToken } from "./http.js";
import { EntraOAuthProvider } from "../shared/oauth/entra-oauth-provider.js";

export interface OAuthHttpTransportOptions {
  host: string;
  port: number;
  mcpPath: string;
  /** Public base URL clients reach (TLS-terminated), used as the OAuth issuer. */
  publicBaseUrl: string;
  allowedHosts: string[];
  allowedOrigins?: string[];
  provider: EntraOAuthProvider;
  /** Builds a fully configured MCP server (called once per request, stateless). */
  createServer: () => McpServer;
}

/** Start the OAuth-fronted HTTP MCP server and resolve once it is listening. */
export async function startOAuthHttpServer(opts: OAuthHttpTransportOptions): Promise<Server> {
  const app = express();
  app.disable("x-powered-by");

  const issuerUrl = new URL(opts.publicBaseUrl);
  const resourceMetadataUrl = new URL("/.well-known/oauth-protected-resource", opts.publicBaseUrl).toString();

  // OAuth metadata, dynamic client registration, authorize and token endpoints.
  app.use(
    mcpAuthRouter({
      provider: opts.provider,
      issuerUrl,
      scopesSupported: opts.provider.scopes,
      resourceName: "Azure DevOps MCP Server",
      resourceServerUrl: issuerUrl,
    })
  );

  // Entra redirect target — exchanges the upstream code and bounces back to the client.
  app.get(new URL(opts.provider.redirectUri).pathname, (req, res) => {
    void opts.provider.handleCallback(req, res);
  });

  // The MCP endpoint, gated by a valid bearer token (validated by the provider).
  app.post(opts.mcpPath, requireBearerAuth({ verifier: opts.provider, resourceMetadataUrl }), async (req, res) => {
    // Match the passthrough transport's Origin policy: reject any browser Origin
    // not on the allow-list (the SDK only checks Origin when one is configured).
    const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
    if (!isOriginAllowed(origin, opts.allowedOrigins)) {
      res.status(403).json({ error: "Origin not allowed." });
      return;
    }

    const server = opts.createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableDnsRebindingProtection: true,
      allowedHosts: opts.allowedHosts,
      allowedOrigins: opts.allowedOrigins,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      // requireBearerAuth guarantees req.auth on success; guard for type-safety.
      const token = req.auth?.token;
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      await server.connect(transport as unknown as Transport);
      // The validated token is the Azure DevOps access token; expose it to tools.
      await runWithRequestToken(token, () => transport.handleRequest(req, res));
    } catch (error) {
      logger.error("Error handling MCP request", error instanceof Error ? error.message : String(error));
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  const httpServer = createHttpServer(app);
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(opts.port, opts.host, () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });

  logger.info("Azure DevOps MCP Server listening over HTTP with OAuth", {
    host: opts.host,
    port: opts.port,
    path: opts.mcpPath,
    issuer: opts.publicBaseUrl,
    callback: opts.provider.redirectUri,
  });

  return httpServer;
}

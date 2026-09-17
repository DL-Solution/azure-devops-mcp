// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AzureCliCredential, ChainedTokenCredential, DefaultAzureCredential, TokenCredential } from "@azure/identity";
import { AccountInfo, AuthenticationResult, PublicClientApplication } from "@azure/msal-node";
import open from "open";
import { logger } from "./logger.js";

const scopes = ["499b84ac-1321-427f-aa17-267ca6975798/.default"];

/**
 * Whether a Personal Access Token may be sent to this host.
 *
 * Azure DevOps itself plus its sibling service hosts: the fork calls vssps,
 * vsaex, feeds, auditservice, almsearch and analytics on `*.dev.azure.com`,
 * and their legacy forms on `*.visualstudio.com`. Anything else — including
 * look-alikes such as `dev.azure.com.attacker.example` — is refused.
 */
function isPatAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "dev.azure.com" || host.endsWith(".dev.azure.com") || host.endsWith(".visualstudio.com");
}

/**
 * Rewrites `Authorization: Bearer <pat>` to `Basic <pat>` on outgoing fetches.
 *
 * Tools build `Bearer ${token}` headers regardless of auth mode, and in PAT
 * mode that token is the base64 `user:pat` pair. Only a header carrying exactly
 * that value is touched, and only for an https request to an Azure DevOps
 * host — the previous inline interceptor rewrote any bearer header for any
 * destination, which would have sent the PAT wherever a request went.
 * Ported from upstream microsoft/azure-devops-mcp#1557.
 */
function installPatFetchInterceptor(basicValue: string): void {
  const originalFetch = globalThis.fetch;
  const patBearerValue = `Bearer ${basicValue}`;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (headers.get("Authorization") !== patBearerValue) {
      return originalFetch(input, init);
    }

    const requestUrl = new URL(input instanceof Request ? input.url : input.toString());
    if (requestUrl.protocol !== "https:" || !isPatAllowedHost(requestUrl.hostname)) {
      throw new Error(`Refusing to send a Personal Access Token to untrusted destination '${requestUrl.origin}'`);
    }

    headers.set("Authorization", `Basic ${basicValue}`);
    if (input instanceof Request) {
      return originalFetch(new Request(input, { ...init, headers }));
    }
    return originalFetch(input, { ...init, headers });
  };
}

class OAuthAuthenticator {
  static clientId = "0d50963b-7bb9-4fe7-94c7-a99af00b5136";
  static defaultAuthority = "https://login.microsoftonline.com/common";
  static zeroTenantId = "00000000-0000-0000-0000-000000000000";

  private accountId: AccountInfo | null;
  private publicClientApp: PublicClientApplication;

  constructor(tenantId?: string) {
    this.accountId = null;

    let authority = OAuthAuthenticator.defaultAuthority;
    if (tenantId && tenantId !== OAuthAuthenticator.zeroTenantId) {
      authority = `https://login.microsoftonline.com/${tenantId}`;
      logger.debug(`OAuthAuthenticator: Using tenant-specific authority for tenantId='${tenantId}'`);
    } else {
      logger.debug(`OAuthAuthenticator: Using default common authority`);
    }

    this.publicClientApp = new PublicClientApplication({
      auth: {
        clientId: OAuthAuthenticator.clientId,
        authority,
      },
    });
    logger.debug(`OAuthAuthenticator: Initialized with clientId='${OAuthAuthenticator.clientId}'`);
  }

  public async getToken(): Promise<string> {
    let authResult: AuthenticationResult | null = null;
    if (this.accountId) {
      logger.debug(`OAuthAuthenticator: Attempting silent token acquisition for cached account`);
      try {
        authResult = await this.publicClientApp.acquireTokenSilent({
          scopes,
          account: this.accountId,
        });
        logger.debug(`OAuthAuthenticator: Successfully acquired token silently`);
      } catch (error) {
        logger.debug(`OAuthAuthenticator: Silent token acquisition failed: ${error instanceof Error ? error.message : String(error)}`);
        authResult = null;
      }
    } else {
      logger.debug(`OAuthAuthenticator: No cached account available, interactive auth required`);
    }
    if (!authResult) {
      logger.debug(`OAuthAuthenticator: Starting interactive token acquisition`);
      authResult = await this.publicClientApp.acquireTokenInteractive({
        scopes,
        openBrowser: async (url) => {
          logger.debug(`OAuthAuthenticator: Opening browser for authentication`);
          open(url);
        },
      });
      this.accountId = authResult.account;
      logger.debug(`OAuthAuthenticator: Successfully acquired token interactively, account cached`);
    }

    if (!authResult.accessToken) {
      logger.error(`OAuthAuthenticator: Authentication result contains no access token`);
      throw new Error("Failed to obtain Azure DevOps OAuth token.");
    }
    logger.debug(`OAuthAuthenticator: Token obtained successfully`);
    return authResult.accessToken;
  }
}

function createAuthenticator(type: string, tenantId?: string): () => Promise<string> {
  logger.debug(`Creating authenticator of type '${type}' with tenantId='${tenantId ?? "undefined"}'`);
  switch (type) {
    case "pat":
      logger.debug(`Authenticator: Using PAT authentication (PERSONAL_ACCESS_TOKEN)`);
      return async () => {
        logger.debug(`${type}: Reading token from PERSONAL_ACCESS_TOKEN environment variable`);
        const b64Pat = process.env["PERSONAL_ACCESS_TOKEN"];
        if (!b64Pat) {
          logger.error(`${type}: PERSONAL_ACCESS_TOKEN environment variable is not set or empty`);
          throw new Error("Environment variable 'PERSONAL_ACCESS_TOKEN' is not set or empty. Please set it with a valid base64-encoded Azure DevOps Personal Access Token.");
        }
        // Return base64 value as-is — caller uses it directly as the Basic auth credential
        logger.debug(`${type}: Successfully retrieved PAT from environment variable`);
        return b64Pat;
      };

    case "envvar":
      logger.debug(`Authenticator: Using environment variable authentication (ADO_MCP_AUTH_TOKEN)`);
      // Read token from fixed environment variable
      return async () => {
        logger.debug(`${type}: Reading token from ADO_MCP_AUTH_TOKEN environment variable`);
        const token = process.env["ADO_MCP_AUTH_TOKEN"];
        if (!token) {
          logger.error(`${type}: ADO_MCP_AUTH_TOKEN environment variable is not set or empty`);
          throw new Error("Environment variable 'ADO_MCP_AUTH_TOKEN' is not set or empty. Please set it with a valid Azure DevOps Personal Access Token.");
        }
        logger.debug(`${type}: Successfully retrieved token from environment variable`);
        return token;
      };

    case "azcli":
    case "env":
      if (type !== "env") {
        logger.debug(`${type}: Setting AZURE_TOKEN_CREDENTIALS to 'dev' for development credential chain`);
        process.env.AZURE_TOKEN_CREDENTIALS = "dev";
      }
      let credential: TokenCredential = new DefaultAzureCredential(); // CodeQL [SM05138] resolved by explicitly setting AZURE_TOKEN_CREDENTIALS
      if (tenantId) {
        // Use Azure CLI credential if tenantId is provided for multi-tenant scenarios
        const azureCliCredential = new AzureCliCredential({ tenantId });
        credential = new ChainedTokenCredential(azureCliCredential, credential);
      }
      return async () => {
        const result = await credential.getToken(scopes);
        if (!result) {
          logger.error(`${type}: Failed to obtain token - credential.getToken returned null/undefined`);
          throw new Error("Failed to obtain Azure DevOps token. Ensure you have Azure CLI logged or use interactive type of authentication.");
        }
        logger.debug(`${type}: Successfully obtained Azure DevOps token`);
        return result.token;
      };

    default:
      logger.debug(`Authenticator: Using OAuth interactive authentication (default)`);
      const authenticator = new OAuthAuthenticator(tenantId);
      return () => {
        return authenticator.getToken();
      };
  }
}
export { createAuthenticator, installPatFetchInterceptor };

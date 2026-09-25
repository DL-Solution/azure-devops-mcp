// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../shared/tool-registration.js";
import { WebApi } from "azure-devops-node-api";
import { jsonResult, toolError } from "../shared/tool-results.js";

const PROFILE_TOOLS = {
  get_me: "profile_get_me",
};

/** Which deployment answered: lets a caller tell two servers (or two builds of one) apart. */
interface ServerInfo {
  version: string;
  /** Commit the image was built from; absent outside a container build. */
  build?: string;
  transport: string;
  /** How the Azure DevOps token is obtained: oauth / passthrough over HTTP, the --authentication type over stdio. */
  auth: string;
  /** The preset endpoint the request came through, if any. */
  preset?: string;
}

function configureProfileTools(server: McpServer, tokenProvider: () => Promise<string>, connectionProvider: () => Promise<WebApi>, serverInfo?: ServerInfo) {
  registerTool(
    server,
    PROFILE_TOOLS.get_me,
    "Get the identity of the currently authenticated user (id, descriptor, display name), the organization this server is connected to and which server build answered. Use it to resolve 'me'/'my'/'I' in a request before calling tools that take an identity, instead of guessing who the caller is.",
    {},
    async () => {
      try {
        const connection = await connectionProvider();
        // ConnectionData carries the identity behind the current token, so this
        // works for every authentication mode (PAT, bearer pass-through, OAuth).
        const connectionData = await connection.connect();

        if (!connectionData?.authenticatedUser) {
          return { content: [{ type: "text", text: "Could not resolve the authenticated user from the connection data." }], isError: true };
        }

        const result = {
          authenticatedUser: connectionData.authenticatedUser,
          authorizedUser: connectionData.authorizedUser,
          serverUrl: connection.serverUrl,
          deploymentType: connectionData.deploymentType,
          instanceId: connectionData.instanceId,
          server: serverInfo,
        };

        return jsonResult(result);
      } catch (error) {
        return toolError("fetching the authenticated user", error);
      }
    }
  );
}

export { PROFILE_TOOLS, configureProfileTools, ServerInfo };

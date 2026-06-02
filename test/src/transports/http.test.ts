// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, jest } from "@jest/globals";
import { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

jest.mock("../../../src/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createMcpRequestListener, extractBearerToken, getRequestToken, HttpTransportOptions } from "../../../src/transports/http";

function mockReq(opts: { url?: string; host?: string; authorization?: string } = {}): IncomingMessage {
  const headers: Record<string, string> = { host: opts.host ?? "127.0.0.1:3000" };
  if (opts.authorization !== undefined) {
    headers.authorization = opts.authorization;
  }
  return { method: "POST", url: opts.url ?? "/mcp", headers } as unknown as IncomingMessage;
}

interface MockRes extends ServerResponse {
  _status: number;
  _headers: Record<string, string>;
  _body: string;
  _closeHandlers: (() => void)[];
  _triggerClose: () => void;
}

function mockRes(): MockRes {
  const res = {
    headersSent: false,
    _status: 0,
    _headers: {},
    _body: "",
    _closeHandlers: [],
  } as unknown as MockRes;

  res.writeHead = jest.fn((status: number, headers?: Record<string, string>) => {
    res._status = status;
    res._headers = headers ?? {};
    (res as { headersSent: boolean }).headersSent = true;
    return res;
  }) as unknown as ServerResponse["writeHead"];

  res.end = jest.fn((body?: unknown) => {
    res._body = typeof body === "string" ? body : "";
    return res;
  }) as unknown as ServerResponse["end"];

  res.on = jest.fn((event: string, cb: () => void) => {
    if (event === "close") {
      res._closeHandlers.push(cb);
    }
    return res;
  }) as unknown as ServerResponse["on"];

  res._triggerClose = () => res._closeHandlers.forEach((cb) => cb());

  return res;
}

describe("extractBearerToken", () => {
  it("returns the token from a valid Bearer header", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("is case-insensitive on the scheme and trims whitespace", () => {
    expect(extractBearerToken("bearer   token-value  ")).toBe("token-value");
  });

  it("returns null for missing, malformed, or empty tokens", () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer ")).toBeNull();
    expect(extractBearerToken("abc123")).toBeNull();
  });
});

describe("getRequestToken", () => {
  it("throws when called outside of a request context", () => {
    expect(() => getRequestToken()).toThrow(/access token in request context/);
  });
});

describe("createMcpRequestListener", () => {
  const makeOptions = (
    overrides: Partial<HttpTransportOptions> = {}
  ): { options: HttpTransportOptions; server: { connect: jest.Mock; close: jest.Mock }; transport: { handleRequest: jest.Mock; close: jest.Mock; capturedToken?: string } } => {
    const server = { connect: jest.fn(), close: jest.fn() };
    const transport = {
      handleRequest: jest.fn(() => {
        // The token must be resolvable from within the request's async context.
        transport.capturedToken = getRequestToken();
        return Promise.resolve();
      }),
      close: jest.fn(),
    } as { handleRequest: jest.Mock; close: jest.Mock; capturedToken?: string };

    const options: HttpTransportOptions = {
      host: "127.0.0.1",
      port: 3000,
      mcpPath: "/mcp",
      allowedHosts: ["127.0.0.1:3000"],
      createServer: () => server as unknown as McpServer,
      createTransport: () => transport,
      ...overrides,
    };

    return { options, server, transport };
  };

  it("returns 404 for a path other than the MCP endpoint", async () => {
    const { options } = makeOptions();
    const listener = createMcpRequestListener(options);
    const res = mockRes();

    await listener(mockReq({ url: "/other" }), res);

    expect(res._status).toBe(404);
    expect(options.createServer).toBeDefined();
  });

  it("returns 401 with a WWW-Authenticate header when the token is missing", async () => {
    const { options, server } = makeOptions();
    const listener = createMcpRequestListener(options);
    const res = mockRes();

    await listener(mockReq({}), res);

    expect(res._status).toBe(401);
    expect(res._headers["WWW-Authenticate"]).toContain("Bearer");
    expect(server.connect).not.toHaveBeenCalled();
  });

  it("returns 401 for a non-Bearer Authorization header", async () => {
    const { options, server } = makeOptions();
    const listener = createMcpRequestListener(options);
    const res = mockRes();

    await listener(mockReq({ authorization: "Basic dXNlcjpwYXNz" }), res);

    expect(res._status).toBe(401);
    expect(server.connect).not.toHaveBeenCalled();
  });

  it("connects the server and handles the request with the token in context", async () => {
    const { options, server, transport } = makeOptions();
    const listener = createMcpRequestListener(options);
    const res = mockRes();

    await listener(mockReq({ authorization: "Bearer my-ado-token" }), res);

    expect(server.connect).toHaveBeenCalledWith(transport);
    expect(transport.handleRequest).toHaveBeenCalledTimes(1);
    expect(transport.capturedToken).toBe("my-ado-token");
  });

  it("closes the transport and server when the response closes", async () => {
    const { options, server, transport } = makeOptions();
    const listener = createMcpRequestListener(options);
    const res = mockRes();

    await listener(mockReq({ authorization: "Bearer my-ado-token" }), res);
    res._triggerClose();

    expect(transport.close).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when request handling throws", async () => {
    const { options, transport } = makeOptions();
    transport.handleRequest.mockImplementation(() => Promise.reject(new Error("boom")));
    const listener = createMcpRequestListener(options);
    const res = mockRes();

    await listener(mockReq({ authorization: "Bearer my-ado-token" }), res);

    expect(res._status).toBe(500);
  });
});

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import winston from "winston";
import { setLogLevel, AzureLogLevel } from "@azure/logger";

const logLevel = process.env.LOG_LEVEL?.toLowerCase();
if (logLevel && ["verbose", "debug", "info", "warning", "error"].includes(logLevel)) {
  // Map Winston log levels to Azure log levels
  const logLevelMap: Record<string, AzureLogLevel> = {
    verbose: "verbose",
    debug: "info",
    info: "info",
    warning: "warning",
    error: "error",
  };

  const azureLogLevel: AzureLogLevel = logLevelMap[logLevel];
  setLogLevel(azureLogLevel);
}

/**
 * Logger utility for MCP server
 *
 * Since MCP servers use stdio transport for communication on stdout,
 * we log to stderr to avoid interfering with the MCP protocol.
 */

const SPLAT = Symbol.for("splat");

/**
 * The JSON format drops a string passed after the message
 * (`logger.warn("Eviction failed", error.message)`), so the reason never reached
 * the log. Such strings are kept as `detail`, the key tool error lines already use.
 */
const stringDetail = winston.format((info) => {
  const extra = (info as { [SPLAT]?: unknown[] })[SPLAT];
  const strings = Array.isArray(extra) ? extra.filter((value): value is string => typeof value === "string") : [];
  if (strings.length > 0 && info.detail === undefined) {
    info.detail = strings.join(" ");
  }
  return info;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(stringDetail(), winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
  transports: [
    new winston.transports.Stream({
      stream: process.stderr,
    }),
  ],
  // Prevent Winston from exiting on error
  exitOnError: false,
});

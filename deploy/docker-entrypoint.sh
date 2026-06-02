#!/bin/sh
#
# Container entrypoint for the Azure DevOps MCP server.
#
# Builds the CLI invocation from environment variables so the same image can be
# deployed to different organizations/environments without rebuilding.
#
# Required:
#   AZURE_DEVOPS_ORG     Azure DevOps organization name (positional argument).
#
# Optional (defaults shown):
#   MCP_TRANSPORT=http   Transport to serve (stdio|http).
#   MCP_HOST=0.0.0.0     Bind interface. Must be 0.0.0.0 in a container so the
#                        platform ingress can reach it.
#   MCP_PORT=3000        Listen port (match the ingress target port).
#   MCP_ALLOWED_HOSTS    Space-separated Host header allow-list (DNS rebinding
#                        protection). Set to the public FQDN of the app.
#   MCP_ALLOWED_ORIGINS  Space-separated browser Origin allow-list.
#   MCP_DOMAINS          Space-separated tool domains to enable (default: all).
#
set -e

if [ -z "$AZURE_DEVOPS_ORG" ]; then
  echo "Error: AZURE_DEVOPS_ORG environment variable is required." >&2
  exit 1
fi

set -- "$AZURE_DEVOPS_ORG" \
  --transport "${MCP_TRANSPORT:-http}" \
  --host "${MCP_HOST:-0.0.0.0}" \
  --port "${MCP_PORT:-3000}"

# Unquoted expansions below are intentional: they let a space-separated value
# expand into multiple arguments consumed by the corresponding array option.
# shellcheck disable=SC2086
if [ -n "$MCP_ALLOWED_HOSTS" ]; then
  set -- "$@" --allowed-hosts $MCP_ALLOWED_HOSTS
fi
# shellcheck disable=SC2086
if [ -n "$MCP_ALLOWED_ORIGINS" ]; then
  set -- "$@" --allowed-origins $MCP_ALLOWED_ORIGINS
fi
# shellcheck disable=SC2086
if [ -n "$MCP_DOMAINS" ]; then
  set -- "$@" --domains $MCP_DOMAINS
fi

# exec so node becomes PID 1 and receives SIGTERM for graceful shutdown.
exec node dist/index.js "$@"

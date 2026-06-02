# ⭐ Azure DevOps MCP Server

> [!IMPORTANT]
> The Azure DevOps Remote MCP Server is now available in public preview for all organizations. We recommend migrating to the [Remote MCP Server](https://learn.microsoft.com/en-us/azure/devops/mcp-server/remote-mcp-server) going forward.
>
> [Learn more](#-remote-mcp-server-recommended)

This project provides Azure DevOps MCP tooling for AI agents, with a **remote-first** onboarding experience and a local server option when you need it.

## 📄 Table of Contents

1. [📺 Overview](#-overview)
2. [🏆 Expectations](#-expectations)
3. [🚀 Remote MCP Server (Recommended)](#-remote-mcp-server-recommended)
4. [⚙️ Supported Tools](#️-supported-tools)
5. [🔌 Local MCP Server Installation (Optional)](#-local-mcp-server-installation-optional)
6. [🌏 Using Domains (local)](#-using-domains-local)
7. [🔐 HTTP Transport (self-hosted)](#-http-transport-self-hosted)
8. [🐥 Project and Team Defaults (local)](#-project-and-team-defaults-local)
9. [📝 Troubleshooting](#-troubleshooting)
10. [🎩 Examples & Best Practices](#-examples--best-practices)
11. [🙋‍♀️ Frequently Asked Questions](#️-frequently-asked-questions)
12. [📌 Contributing](#-contributing)

## 📺 Overview

The Azure DevOps MCP Server brings Azure DevOps context to your agents. Try prompts like:

- "List my ADO projects"
- "List ADO Builds for 'Contoso'"
- "List ADO Repos for 'Contoso'"
- "List test plans for 'Contoso'"
- "List teams for project 'Contoso'"
- "List iterations for project 'Contoso'"
- "List my work items for project 'Contoso'"
- "List work items in current iteration for 'Contoso' project and 'Contoso Team'"
- "List all wikis in the 'Contoso' project"
- "Create a wiki page '/Architecture/Overview' with content about system design"
- "Update the wiki page '/Getting Started' with new onboarding instructions"
- "Get the content of the wiki page '/API/Authentication' from the Documentation wiki"

## 🏆 Expectations

The Azure DevOps MCP Server is built around tools that are concise, simple, focused, and easy to use, with each one designed for a specific scenario. We intentionally avoid creating complex tools that try to do too much. The goal is to provide a thin abstraction layer over the REST APIs that makes data access straightforward while allowing the language model to handle the more complex reasoning.

## 🚀 Remote MCP Server (Recommended)

The Azure DevOps **Remote MCP Server** is now available in [public preview](https://devblogs.microsoft.com/devops/azure-devops-remote-mcp-server-public-preview).

Over time, the Remote MCP Server will replace this local MCP Server. We will continue to support the local server for now, but future investments will primarily focus on the remote experience.

We encourage all users of the local MCP Server to begin migrating to the Remote MCP Server.

If you encounter issues with tools, need support, or have a feature request, you can report an issue using the [Remote MCP Server issue template](https://github.com/microsoft/azure-devops-mcp/issues/new?template=remote-mcp-server-issue.md). During the preview period, we will track Remote MCP Server issues through this repository.

> [!WARNING]
> Internal Microsoft users of the Remote MCP Server should **not** create issues in this repository. Please use the dedicated Teams channel instead.

For complete instructions, see the [Remote MCP Server onboarding documentation](https://learn.microsoft.com/en-us/azure/devops/mcp-server/remote-mcp-server?view=azure-devops).

### Quick start with `.vscode/mcp.json`

Use this configuration to connect directly to the Azure DevOps-hosted endpoint using streamable HTTP transport:

```json
{
  "servers": {
    "ado-remote-mcp": {
      "url": "https://mcp.dev.azure.com/{organization}",
      "type": "http"
    }
  },
  "inputs": []
}
```

See [documentation](https://learn.microsoft.com/en-us/azure/devops/mcp-server/remote-mcp-server?view=azure-devops#mcpjson-configuration) for additional configuration options.

After saving `.vscode/mcp.json`, start the server from the MCP view in VS Code, then run a prompt like `List ADO projects`.

## ⚙️ Supported Tools

See the [Available Tools](https://learn.microsoft.com/en-us/azure/devops/mcp-server/remote-mcp-server?view=azure-devops#available-tools) documentation for the complete list of available remote tools.

For a comprehensive list of local tools, see [TOOLSET.md](./docs/TOOLSET.md).

## 🔌 Local MCP Server Installation (Optional)

> [!IMPORTANT]
> Start with the Remote MCP Server first. Use the local MCP Server only if your scenario specifically requires a local `stdio` setup.

Use this section if you specifically need the local `stdio` server experience. For most users, start with the [Remote MCP Server](#-remote-mcp-server-recommended) section above.

For the best experience, use Visual Studio Code and GitHub Copilot. See the [getting started documentation](./docs/GETTINGSTARTED.md) to use our MCP Server with other tools such as Visual Studio 2022, Codex, Claude Code, Cursor, Opencode, and Kilocode.

### Prerequisites

1. Install [VS Code](https://code.visualstudio.com/download) or [VS Code Insiders](https://code.visualstudio.com/insiders)
2. Install [Node.js](https://nodejs.org/en/download) 20+
3. Open VS Code in an empty folder

### Installation

#### 🧨 Install from Public Feed

This installation method is the easiest for all users of Visual Studio Code.

🎥 [Watch this quick start video to get up and running in under two minutes!](https://youtu.be/EUmFM6qXoYk)

##### Steps

In your project, add a `.vscode\mcp.json` file with the following content:

```json
{
  "inputs": [
    {
      "id": "ado_org",
      "type": "promptString",
      "description": "Azure DevOps organization name  (e.g. 'contoso')"
    }
  ],
  "servers": {
    "ado": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@azure-devops/mcp", "${input:ado_org}"]
    }
  }
}
```

🔥 To stay up to date with the latest features, you can use our nightly builds. Simply update your `mcp.json` configuration to use `@azure-devops/mcp@next`. Here is an updated example:

```json
{
  "inputs": [
    {
      "id": "ado_org",
      "type": "promptString",
      "description": "Azure DevOps organization name  (e.g. 'contoso')"
    }
  ],
  "servers": {
    "ado": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@azure-devops/mcp@next", "${input:ado_org}"]
    }
  }
}
```

Save the file, then click 'Start'.

![start mcp server](./docs/media/start-mcp-server.gif)

In chat, switch to [Agent Mode](https://code.visualstudio.com/blogs/2025/02/24/introducing-copilot-agent-mode).

Click "Select Tools" and choose the available tools.

![configure mcp server tools](./docs/media/configure-mcp-server-tools.gif)

Open GitHub Copilot Chat and try a prompt like `List ADO projects`. The first time an ADO tool is executed browser will open prompting to login with your Microsoft account. Please ensure you are using credentials matching selected Azure DevOps organization.

> 💥 We strongly recommend creating a `.github\copilot-instructions.md` in your project. This will enhance your experience using the Azure DevOps MCP Server with GitHub Copilot Chat.
> To start, just include "`This project uses Azure DevOps. Always check to see if the Azure DevOps MCP server has a tool relevant to the user's request`" in your copilot instructions file.

See the [getting started documentation](./docs/GETTINGSTARTED.md) to use our MCP Server with other tools such as Visual Studio 2022, Codex, Claude Code, and Cursor.

## 🌏 Using Domains (local)

Azure DevOps exposes a large surface area. As a result, our Azure DevOps MCP Server includes many tools. To keep the toolset manageable, avoid confusing the model, and respect client limits on loaded tools, use Domains to load only the areas you need. Domains are named groups of related tools (for example: core, work, work-items, repositories, wiki). Add the `-d` argument and the domain names to the server args in your `mcp.json` to list the domains to enable.

For example, use `"-d", "core", "work", "work-items"` to load only Work Item related tools (see the example below).

```json
{
  "inputs": [
    {
      "id": "ado_org",
      "type": "promptString",
      "description": "Azure DevOps organization name  (e.g. 'contoso')"
    }
  ],
  "servers": {
    "ado_with_filtered_domains": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@azure-devops/mcp", "${input:ado_org}", "-d", "core", "work", "work-items"]
    }
  }
}
```

Domains that are available are: `core`, `work`, `work-items`, `search`, `test-plans`, `repositories`, `wiki`, `pipelines`, `advanced-security`, `dashboards`, `policy`, `task-agent`

We recommend that you always enable `core` tools so that you can fetch project level information.

> By default all domains are loaded

## 🔐 HTTP Transport (self-hosted)

By default the server communicates over **stdio**, which is ideal when the MCP client launches the server as a local child process. If instead you need a long-running, network-reachable endpoint, start the server with the **Streamable HTTP** transport:

```bash
npx -y @azure-devops/mcp contoso --transport http --port 3000
```

### Authentication: token pass-through

The HTTP transport uses **token pass-through**. The server stores no credentials of its own — every request must carry the caller's Azure DevOps **bearer token** (an Entra ID access token for the `499b84ac-1321-427f-aa17-267ca6975798` resource) in the `Authorization` header:

```
Authorization: Bearer <azure-devops-access-token>
```

Each request therefore acts as the calling user, with exactly their permissions. Requests without a valid bearer token are rejected with `401 Unauthorized`.

> [!NOTE]
> Personal Access Tokens (PAT) and the `--authentication` option are only used by the stdio transport. The HTTP transport always uses bearer pass-through.

### Security expectations

The HTTP transport is intended to run **behind your own TLS-terminating reverse proxy** (for example nginx or Caddy). It ships with safe defaults:

- **Loopback binding** — it listens on `127.0.0.1` by default. Use `--host` to change the bind interface (do this only behind a proxy/firewall).
- **DNS rebinding protection** is always on. Only requests whose `Host` header matches `--allowed-hosts` are served (defaults to the bound host/port plus `localhost`). When running behind a proxy, set `--allowed-hosts your.public.hostname`.
- **Origin allow-listing** — by default only non-browser clients (no `Origin` header) are accepted. Use `--allowed-origins https://your.app` to permit specific browser origins.
- The server never logs tokens or request bodies.

### HTTP options

| Option              | Default     | Description                                                      |
| ------------------- | ----------- | ---------------------------------------------------------------- |
| `--transport`       | `stdio`     | `stdio` or `http`.                                               |
| `--host`            | `127.0.0.1` | Interface to bind (http transport).                              |
| `--port`            | `3000`      | Port to listen on (http transport).                              |
| `--path`            | `/mcp`      | URL path that serves the MCP endpoint.                           |
| `--allowed-hosts`   | bound host  | Hosts permitted in the `Host` header (DNS rebinding protection). |
| `--allowed-origins` | none        | Browser origins permitted in the `Origin` header.                |

### Example client configuration

```json
{
  "servers": {
    "ado_http": {
      "type": "http",
      "url": "https://your.public.hostname/mcp",
      "headers": {
        "Authorization": "Bearer ${input:ado_token}"
      }
    }
  }
}
```

## 🐥 Project and Team Defaults (local)

You can also configure default Azure DevOps project and team values from `.vscode/mcp.json` using `project` and `team`, so tools can skip selection prompts.

### Example `.vscode/mcp.json`

```json
{
  "servers": {
    "ado": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@azure-devops/mcp", "myorg", "--authentication", "azcli"],
      "env": {
        "ado_mcp_project": "Contoso",
        "ado_mcp_team": "Fabrikam Team"
      }
    }
  }
}
```

## 📝 Troubleshooting

See the [Troubleshooting guide](./docs/TROUBLESHOOTING.md) for help with common issues and logging.

## 🎩 Examples & Best Practices

Explore example prompts in our [Examples documentation](./docs/EXAMPLES.md).

For best practices and tips to enhance your experience with the MCP Server, refer to the [How-To guide](./docs/HOWTO.md).

## 🙋‍♀️ Frequently Asked Questions

For answers to common questions about the Azure DevOps MCP Server, see the [Frequently Asked Questions](./docs/FAQ.md).

## 📌 Contributing

We welcome contributions! During preview, please file issues for bugs, enhancements, or documentation improvements.

See our [Contributions Guide](./CONTRIBUTING.md) for:

- 🛠️ Development setup
- ✨ Adding new tools
- 📝 Code style & testing
- 🔄 Pull request process

> ⚠️ Please read the [Contributions Guide](./CONTRIBUTING.md) before creating a pull request.

## 🤝 Code of Conduct

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For questions, see the [FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [open@microsoft.com](mailto:open@microsoft.com).

## 📈 Project Stats

[![Star History Chart](https://api.star-history.com/svg?repos=microsoft/azure-devops-mcp&type=Date)](https://star-history.com/#microsoft/azure-devops-mcp)

## 🏆 Hall of Fame

Thanks to all contributors who make this project awesome! ❤️

[![Contributors](https://contrib.rocks/image?repo=microsoft/azure-devops-mcp)](https://github.com/microsoft/azure-devops-mcp/graphs/contributors)

> Generated with [contrib.rocks](https://contrib.rocks)

## License

Licensed under the [MIT License](./LICENSE.md).

---

_Trademarks: This project may include trademarks or logos for Microsoft or third parties. Use of Microsoft trademarks or logos must follow [Microsoft’s Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general). Third-party trademarks are subject to their respective policies._

<!-- version: 2023-04-07 [Do not delete this line, it is used for analytics that drive template improvements] -->

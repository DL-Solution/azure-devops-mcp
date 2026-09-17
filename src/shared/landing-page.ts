// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// The HTML page served at "/" of the HTTP transport.
//
// Someone handed the server's address usually opens it in a browser first, and
// until this page existed they got a JSON 404. The page says what the server is
// and gives the exact URL and steps to connect each client, for the auth mode
// this deployment actually runs. It is written in Ukrainian for the team that
// uses the fork's deployment; identifiers, commands and URLs stay as they are.
//
// Everything interpolated is escaped. The only script is the static copy-button
// handler below, and the CSP admits exactly that script by its hash, so nothing
// injected into the page could run (see LANDING_PAGE_HEADERS).

import { createHash } from "node:crypto";

import { Domain } from "./domains.js";

/** One MCP URL this deployment serves: the bare path or a preset under it. */
export interface LandingEndpoint {
  /** Path relative to the server root, e.g. "/mcp/dev". */
  path: string;
  /** Preset name, or undefined for the bare endpoint. */
  preset?: string;
  domains: readonly string[];
  toolCount: number;
}

export interface LandingPageOptions {
  /** Absolute origin clients reach, without a trailing slash, e.g. "https://ado-mcp.example.com". */
  baseUrl: string;
  organization: string;
  version: string;
  auth: "oauth" | "passthrough";
  endpoints: readonly LandingEndpoint[];
}

/**
 * Wires up the copy buttons. They are rendered hidden and only shown where the
 * Clipboard API is available (a secure context), so without the script, or on
 * plain http, nothing dead is left on the page. Static on purpose: its hash is in the CSP.
 */
export const LANDING_PAGE_SCRIPT = `
(function () {
  var announce = document.getElementById("copy-status");
  document.querySelectorAll("button[data-copy]").forEach(function (button) {
    if (!navigator.clipboard || !window.isSecureContext) return;
    var timer;
    button.hidden = false;
    button.addEventListener("click", function () {
      var show = function (state, message) {
        button.classList.remove("copied", "failed");
        button.classList.add(state);
        button.title = message;
        announce.textContent = message;
        clearTimeout(timer);
        timer = setTimeout(function () {
          button.classList.remove(state);
          button.title = "Копіювати";
        }, 1500);
      };
      navigator.clipboard.writeText(button.getAttribute("data-copy")).then(
        function () { show("copied", "Скопійовано"); },
        function () { show("failed", "Не вдалося скопіювати"); }
      );
    });
  });
})();
`;

const SCRIPT_HASH = `sha256-${createHash("sha256").update(LANDING_PAGE_SCRIPT, "utf8").digest("base64")}`;

export const LANDING_PAGE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": `default-src 'none'; script-src '${SCRIPT_HASH}'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-cache",
};

/** What each domain covers, in the page's language. */
export const DOMAIN_LABELS: Readonly<Record<Domain, string>> = {
  [Domain.CORE]: "проєкти й команди",
  [Domain.PROFILE]: "ваш профіль",
  [Domain.SEARCH]: "повнотекстовий пошук",
  [Domain.WORK_ITEMS]: "робочі елементи",
  [Domain.WORK]: "дошки, беклоги, спринти",
  [Domain.REPOSITORIES]: "Git і pull requests",
  [Domain.PIPELINES]: "пайплайни й збірки",
  [Domain.RELEASE]: "класичні релізи",
  [Domain.WIKI]: "wiki",
  [Domain.TEST_PLANS]: "тест-плани",
  [Domain.TEST_RESULTS]: "результати тестів",
  [Domain.DASHBOARDS]: "дашборди",
  [Domain.POLICY]: "політики гілок",
  [Domain.TASK_AGENT]: "агенти, змінні, середовища",
  [Domain.SERVICE_ENDPOINT]: "service connections",
  [Domain.SERVICE_HOOKS]: "service hooks",
  [Domain.ARTIFACTS]: "фіди пакетів",
  [Domain.ADVANCED_SECURITY]: "Advanced Security",
  [Domain.APPROVALS]: "погодження",
  [Domain.ANALYTICS]: "аналітика (OData)",
  [Domain.PROJECT_ANALYSIS]: "активність і мови",
  [Domain.WIT_PROCESS]: "кастомізація процесів",
  [Domain.MEMBER_ENTITLEMENT]: "ліцензії користувачів",
  [Domain.GRAPH]: "користувачі й групи",
  [Domain.PERMISSIONS]: "права доступу",
  [Domain.SECURITY_ROLES]: "ролі на ресурсах",
  [Domain.AUDIT]: "журнал аудиту",
  [Domain.NOTIFICATION]: "сповіщення",
  [Domain.EXTENSIONS]: "розширення",
  [Domain.GALLERY]: "Marketplace",
  [Domain.FEATURE_MANAGEMENT]: "функції проєкту",
  [Domain.OPERATIONS]: "асинхронні операції",
  [Domain.MCP_APPS]: "перевірка зв'язку",
};

/** Who each preset is for. A preset without an entry is still listed, just without this line. */
const PRESET_AUDIENCE: Readonly<Record<string, string>> = {
  dev: "Розробка: код, pull requests, робочі елементи, пайплайни.",
  plan: "Планування: беклоги, спринти, ємність, звіти, тест-плани.",
  ops: "Доставка: пайплайни, релізи, агенти, підключення, пакети.",
  admin: "Адміністрування: процеси, користувачі, ліцензії, права, аудит.",
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function domainLabel(domain: string): string {
  return (DOMAIN_LABELS as Record<string, string>)[domain] ?? domain;
}

/** The endpoint to show in the connection examples: `dev` when served, otherwise the first one. */
function exampleEndpoint(endpoints: readonly LandingEndpoint[]): LandingEndpoint | undefined {
  return endpoints.find((endpoint) => endpoint.preset === "dev") ?? endpoints[0];
}

/** "152 інструменти", "125 інструментів", "1 інструмент". */
export function toolCountLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} інструментів`;
  if (last === 1) return `${count} інструмент`;
  if (last >= 2 && last <= 4) return `${count} інструменти`;
  return `${count} інструментів`;
}

/** A button that copies `text`; hidden until the script confirms the clipboard is usable. */
function copyButton(text: string): string {
  return `<button type="button" class="copy" data-copy="${escapeHtml(text)}" aria-label="Копіювати ${escapeHtml(text)}" title="Копіювати" hidden>${COPY_ICON}${CHECK_ICON}</button>`;
}

// Inline so the page needs no image source; stroke follows the text colour, so both themes work.
const COPY_ICON = `<svg class="icon icon-copy" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const CHECK_ICON = `<svg class="icon icon-check" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function endpointCards(options: LandingPageOptions): string {
  return options.endpoints
    .map((endpoint) => {
      const url = `${options.baseUrl}${endpoint.path}`;
      const summary = endpoint.preset ? PRESET_AUDIENCE[endpoint.preset] : "Усі інструменти разом. Найбільший список — забирає в моделі найбільше контексту.";
      // The shared base (core, profile, search) is in every preset, so listing it on each card is noise;
      // the bare endpoint serves everything, so its list would just repeat the presets.
      const areas = endpoint.preset ? endpoint.domains.filter((domain) => domain !== Domain.CORE && domain !== Domain.PROFILE && domain !== Domain.SEARCH) : [];
      return `<div class="endpoint">
          <div class="endpoint-head">
            <div class="endpoint-url">
              <code class="url">${escapeHtml(url)}</code>
              ${copyButton(url)}
            </div>
            <span class="count">${escapeHtml(toolCountLabel(endpoint.toolCount))}</span>
          </div>
          ${summary ? `<p class="summary">${escapeHtml(summary)}</p>` : ""}
          ${areas.length > 0 ? `<p class="muted">${escapeHtml(areas.map(domainLabel).join(" · "))}</p>` : ""}
        </div>`;
    })
    .join("\n");
}

function oauthSteps(url: string, name: string): string {
  return `
    <section>
      <h2>Підключення</h2>
      <p>Вхід — через ваш обліковий запис Microsoft в організації. Токенів чи ключів вводити не потрібно: клієнт сам відкриє сторінку входу під час першого підключення.</p>

      <h3>claude.ai</h3>
      <ol>
        <li>Відкрийте <b>Settings → Connectors</b> і натисніть <b>Add custom connector</b>. У командах та організаціях Claude конектор додає власник у налаштуваннях адміністратора.</li>
        <li>Назва — будь-яка, наприклад <code>${escapeHtml(name)}</code>. URL — <code class="url">${escapeHtml(url)}</code>.</li>
        <li>Натисніть <b>Connect</b> і увійдіть обліковим записом Microsoft.</li>
      </ol>

      <h3>Claude Code</h3>
      <pre><code>claude mcp add --transport http ${escapeHtml(name)} ${escapeHtml(url)}</code></pre>
      <p>Далі в сесії Claude Code виконайте <code>/mcp</code>, оберіть <code>${escapeHtml(name)}</code> і <b>Authenticate</b>.</p>

      <h3>VS Code (GitHub Copilot)</h3>
      <p>Файл <code>.vscode/mcp.json</code>:</p>
      <pre><code>{
  "servers": {
    "${escapeHtml(name)}": {
      "type": "http",
      "url": "${escapeHtml(url)}"
    }
  }
}</code></pre>
      <p>Запустіть сервер кнопкою <b>Start</b> над його записом і підтвердьте вхід.</p>

      <h3>Інші клієнти</h3>
      <p>Підійде будь-який MCP-клієнт із транспортом Streamable HTTP і OAuth з динамічною реєстрацією клієнтів.</p>
    </section>`;
}

function passthroughSteps(url: string, name: string): string {
  return `
    <section>
      <h2>Підключення</h2>
      <p>Цей сервер не має власного входу: кожен запит має нести ваш токен Azure DevOps у заголовку <code>Authorization: Bearer …</code>. Отримати токен можна через Azure CLI; він діє близько години.</p>
      <pre><code>az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv</code></pre>

      <h3>Claude Code</h3>
      <pre><code>claude mcp add --transport http ${escapeHtml(name)} ${escapeHtml(url)} \\
  --header "Authorization: Bearer $(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)"</code></pre>

      <h3>VS Code (GitHub Copilot)</h3>
      <p>Файл <code>.vscode/mcp.json</code> — VS Code попросить вставити токен під час запуску:</p>
      <pre><code>{
  "inputs": [
    { "id": "ado_token", "type": "promptString", "description": "Azure DevOps token", "password": true }
  ],
  "servers": {
    "${escapeHtml(name)}": {
      "type": "http",
      "url": "${escapeHtml(url)}",
      "headers": { "Authorization": "Bearer \${input:ado_token}" }
    }
  }
}</code></pre>
    </section>`;
}

/** Render the landing page for this deployment. */
export function renderLandingPage(options: LandingPageOptions): string {
  const example = exampleEndpoint(options.endpoints);
  const exampleUrl = `${options.baseUrl}${example?.path ?? "/mcp"}`;
  const exampleName = example?.preset ? `ado-${example.preset}` : "ado";
  const organization = escapeHtml(options.organization);

  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Azure DevOps MCP</title>
<style>
  :root {
    --bg: #f7f7f5; --surface: #ffffff; --text: #1d1d1b; --muted: #62625d; --border: #e3e2dd;
    --accent: #0b5cad; --code-bg: #f0efeb; --success: #1a7f37; --danger: #c62828;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #151514; --surface: #1e1e1c; --text: #ecebe6; --muted: #a3a29b; --border: #33332f;
      --accent: #6cb0f5; --code-bg: #262623; --success: #57c27a; --danger: #f07167;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 48px 16px 64px; }
  header { margin-bottom: 32px; }
  .eyebrow { color: var(--muted); font-size: 14px; margin: 0 0 4px; }
  h1 { font-size: 32px; line-height: 1.2; margin: 0 0 12px; }
  h2 { font-size: 22px; margin: 0 0 12px; }
  h3 { font-size: 17px; margin: 24px 0 8px; }
  p, ol, ul { margin: 0 0 12px; }
  li { margin-bottom: 4px; }
  section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 20px; }
  code { font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--code-bg); border-radius: 4px; padding: 1px 5px; }
  pre { background: var(--code-bg); border-radius: 8px; padding: 14px 16px; overflow-x: auto; margin: 0 0 12px; }
  pre code { background: none; padding: 0; }
  .url { overflow-wrap: anywhere; }
  .muted { color: var(--muted); font-size: 14px; margin-top: 4px; }
  .endpoints { display: grid; gap: 12px; margin-bottom: 12px; }
  .endpoint { border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
  .endpoint-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; }
  .endpoint .url { font-size: 15px; font-weight: 600; }
  .endpoint-url { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .count { color: var(--muted); font-size: 14px; white-space: nowrap; margin-left: auto; }
  .copy { flex: none; display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; opacity: 0; transition: opacity 120ms ease, background-color 120ms ease, color 120ms ease; }
  .copy[hidden] { display: none; }
  .endpoint:hover .copy, .copy:focus-visible, .copy.copied, .copy.failed { opacity: 1; }
  .copy:hover { background: var(--code-bg); color: var(--text); }
  .copy:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .copy .icon { grid-area: 1 / 1; }
  .copy .icon-check { display: none; }
  .copy.copied { color: var(--success); }
  .copy.copied .icon-copy { display: none; }
  .copy.copied .icon-check { display: block; }
  .copy.failed { color: var(--danger); }
  /* Touch screens have no hover, so the icon stays visible there. */
  @media (hover: none) { .copy { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .copy { transition: none; } }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .summary { margin: 6px 0 0; }
  .endpoint .muted { margin: 2px 0 0; }
  a { color: var(--accent); }
  footer { color: var(--muted); font-size: 14px; text-align: center; margin-top: 32px; }
</style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">MCP-сервер · версія ${escapeHtml(options.version)}</p>
    <h1>Azure DevOps MCP для організації ${organization}</h1>
    <p>Сервер дає AI-асистентам — Claude, Claude Code, GitHub Copilot у VS Code — доступ до Azure DevOps організації <b>${organization}</b>: робочих елементів, репозиторіїв і pull requests, пайплайнів, wiki, дошок і налаштувань. Асистент читає й змінює дані, викликаючи інструменти сервера.</p>
  </header>

  <section>
    <h2>Як це працює</h2>
    <ul>
      <li>Кожен інструмент — це один виклик REST API Azure DevOps. Складні сценарії асистент будує сам із кількох викликів.</li>
      <li>Сервер не має власного доступу до Azure DevOps. Кожен виклик виконується з вашим токеном, тож асистент бачить і змінює лише те, що дозволено вам.</li>
      <li>Інструменти позначені як читання, запис або видалення. За цими позначками клієнт вирішує, про що питати у вас підтвердження.</li>
      <li>Текст, отриманий з Azure DevOps, сервер позначає як недовірений, щоб асистент не виконував інструкцій, записаних у робочих елементах чи коментарях.</li>
    </ul>
  </section>

  <section>
    <h2>Адреси</h2>
    <p>Один сервер, кілька адрес: кожна віддає лише інструменти для певної ролі. Що менший список, то менше контексту він забирає в моделі й то точніше вона обирає інструмент. Підключайте адресу під свою роботу.</p>
    <div class="endpoints">
    ${endpointCards(options)}
    </div>
    ${options.endpoints.some((endpoint) => endpoint.preset) ? `<p class="muted">Кожна рольова адреса також містить проєкти й команди, ваш профіль і пошук. Підключати можна кілька адрес одночасно.</p>` : ""}
  </section>
${options.auth === "oauth" ? oauthSteps(exampleUrl, exampleName) : passthroughSteps(exampleUrl, exampleName)}
  <section>
    <h2>Поради</h2>
    <ul>
      <li>Почніть із запиту на кшталт «Покажи мої активні робочі елементи» або «Які pull requests чекають мого рев'ю?».</li>
      <li>Називайте проєкт у запиті. Якщо його не вказано, асистент запитає, а не вгадуватиме.</li>
      <li>Перед записом перевіряйте, що саме асистент збирається змінити, особливо для прав доступу, процесів і видалень.</li>
    </ul>
  </section>

  <footer>
    Список інструментів з параметрами — <a href="https://github.com/DL-Solution/azure-devops-mcp/blob/main/docs/TOOLSET.md">docs/TOOLSET.md</a> ·
    <a href="https://github.com/DL-Solution/azure-devops-mcp">вихідний код</a>
  </footer>
</main>
<p id="copy-status" class="sr-only" aria-live="polite"></p>
<script>${LANDING_PAGE_SCRIPT}</script>
</body>
</html>
`;
}

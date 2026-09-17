#!/usr/bin/env node
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Measures how much of the documented Azure DevOps REST API the server's tools
// call, and writes docs/API-COVERAGE.md.
//
// The yardstick is Microsoft's own OpenAPI description of the service,
// github.com/MicrosoftDocs/vsts-rest-api-specs: every operation of the newest
// 7.x version of each area. An operation counts as covered when a tool module
// calls it, found in one of two ways:
//
//   - through azure-devops-node-api: the operation's x-ms-vss-method, camel-
//     cased, is called as a method in a file that also obtains that area's
//     client (getGitApi, getBuildApi, …). A few client methods are named
//     differently from the operation; METHOD_ALIASES maps them.
//   - through a hand-rolled REST call: every string or template literal in a
//     tool module that looks like a route ("_apis/git/…", or a path relative to
//     the module's request helper, see REST_PREFIXES) is matched segment by
//     segment against the operation paths. The HTTP method is taken from the
//     same statement; when none is visible, any method on that path counts.
//
// Both are static heuristics, so the numbers are close rather than exact; the
// report lists what it could not attribute, to keep that honest.
//
// The report has two hand-maintained parts that survive regeneration: the plan
// (between the plan markers) and the notes column of the progress table. A new
// progress row is appended whenever the covered count or the tool count changes.
//
// Usage: npm run api-coverage                      (clones the specs into the OS temp dir)
//        npm run api-coverage -- --specs <dir>     (use an existing checkout)
//        npm run api-coverage -- --covered <area>  (list the operations counted as covered in one area)

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const docPath = path.join(root, "docs", "API-COVERAGE.md");
const SPECS_REPO = "https://github.com/MicrosoftDocs/vsts-rest-api-specs.git";
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

// Areas deliberately left out, with the reason shown in the report.
const EXCLUDED_AREAS = {
  tfvc: "TFVC — застаріла система контролю версій, свідомо відкладено",
  release: "класичні релізи — застарілий механізм, свідомо відкладено",
  processDefinitions: "XML-процеси (лише 4.1) — замінені успадкованими процесами",
  test: "старий Test API — перекритий testPlan і testResults",
  account: "службове: список організацій облікового запису",
  delegatedAuth: "службове: делегована авторизація",
  ims: "службове: Identity Management",
  tokens: "керування PAT — не для асистента",
  tokenAdmin: "адміністрування PAT — не для асистента",
  tokenAdministration: "адміністрування PAT — не для асистента",
  resourceUsage: "службове: ліміти ресурсів",
  status: "стан сервісу Azure DevOps — не про організацію",
  symbol: "сервер символів налагодження",
  governance: "порожня область",
};

// Human-readable name of each area in the report.
const AREA_LABELS = {
  advancedSecurity: "Advanced Security",
  approvalsAndChecks: "Погодження й перевірки",
  artifacts: "Artifacts: фіди",
  artifactsPackageTypes: "Artifacts: пакети за протоколами",
  audit: "Аудит",
  build: "Збірки",
  core: "Проєкти й команди",
  dashboard: "Дашборди",
  distributedTask: "Агенти, змінні, task groups",
  environments: "Середовища",
  extensionManagement: "Розширення",
  favorite: "Обране",
  git: "Git",
  graph: "Користувачі й групи",
  hooks: "Service hooks",
  memberEntitlementManagement: "Ліцензії",
  notification: "Сповіщення",
  operations: "Асинхронні операції",
  permissionsReport: "Звіти про права",
  pipelines: "YAML-пайплайни",
  policy: "Політики гілок",
  processadmin: "Імпорт/експорт процесів",
  processes: "Кастомізація процесів",
  profile: "Профіль",
  search: "Пошук",
  security: "Права доступу",
  securityRoles: "Ролі на ресурсах",
  serviceEndpoint: "Service connections",
  testPlan: "Тест-плани",
  testResults: "Результати тестів",
  wiki: "Wiki",
  wit: "Робочі елементи",
  work: "Дошки й спринти",
};

// The node-api client getters whose methods implement each area.
const AREA_CLIENTS = {
  advancedSecurity: ["getAlertApi"],
  build: ["getBuildApi"],
  core: ["getCoreApi"],
  dashboard: ["getDashboardApi"],
  distributedTask: ["getTaskAgentApi", "getTaskApi"],
  environments: ["getTaskAgentApi"],
  extensionManagement: ["getExtensionManagementApi"],
  git: ["getGitApi"],
  notification: ["getNotificationApi"],
  pipelines: ["getPipelinesApi"],
  policy: ["getPolicyApi"],
  processes: ["getWorkItemTrackingProcessApi"],
  profile: ["getProfileApi"],
  release: ["getReleaseApi"],
  securityRoles: ["getSecurityRolesApi"],
  test: ["getTestApi"],
  testPlan: ["getTestPlanApi"],
  // The older TestApi client serves the same run and result operations from the collection host.
  testResults: ["getTestResultsApi", "getTestApi"],
  tfvc: ["getTfvcApi"],
  wiki: ["getWikiApi"],
  wit: ["getWorkItemTrackingApi"],
  work: ["getWorkApi"],
};

// Client methods whose name differs from the operation's x-ms-vss-method.
const METHOD_ALIASES = {
  getAlert: "getAlertAsync",
  getAlerts: "getAlertsAsync",
  getArtifactContentZip: "getArtifact",
  getBuildLogLines: "getBuildLog",
  getItemText: "getItem",
  getAttachmentContent: "getAttachment",
  getPageText: "getPage",
  getField: "getWorkItemField",
  getFields: "getWorkItemFields",
  createField: "createWorkItemField",
  getTaskGroup: "getTaskGroups",
  getTestResultAttachmentContent: "getTestResultAttachment",
  getTestRunAttachmentContent: "getTestRunAttachment",
  getExtension: "getInstalledExtensionByName",
  queryExtensions: "getInstalledExtensions",
};

// Route prefix each module's request helper puts in front of the relative
// paths it is handed ("" when the helper adds only "_apis/").
const REST_PREFIXES = {
  "graph.ts": "graph/",
  "audit.ts": "audit/",
  "artifacts.ts": "packaging/",
  "approvals.ts": "pipelines/",
  "extensions.ts": "extensionmanagement/",
  "permissions.ts": "",
  "feature-management.ts": "",
  "member-entitlement.ts": "",
  "service-endpoint.ts": "",
  "service-hooks.ts": "",
  "operations.ts": "",
};

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function specsDirectory() {
  const given = argValue("--specs");
  if (given) return path.resolve(given);
  const dir = path.join(os.tmpdir(), "vsts-rest-api-specs");
  if (fs.existsSync(path.join(dir, ".git"))) {
    execFileSync("git", ["-C", dir, "pull", "--quiet", "--ff-only"], { stdio: "inherit" });
  } else {
    execFileSync("git", ["clone", "--quiet", "--depth", "1", SPECS_REPO, dir], { stdio: "inherit" });
  }
  return dir;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
// Long descriptions would make prettier pad every cell of the table to their width.
const shorten = (text, max = 110) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const lowerFirst = (name) => name.charAt(0).toLowerCase() + name.slice(1);

/** "git/repositories/{repositoryId}/commits" → ["git", "repositories", "{}", "commits"], lowercased. */
function routeSegments(route) {
  return route
    .replace(/\{[^}]*\}/g, "{}")
    .toLowerCase()
    .split("/")
    .filter(Boolean);
}

function segmentsMatch(spec, candidate) {
  if (spec.length !== candidate.length) return false;
  return spec.every((segment, i) => {
    const other = candidate[i];
    // A parameter in the spec takes any value; a variable in the code is only
    // known to fill a parameter, not to spell out a fixed segment.
    if (segment === other || segment === "{}") return true;
    // "$${type}" in code against "${type}" in the spec: both a literal prefix plus a parameter.
    return segment.includes("{}") && other.includes("{}") && segment.replace("{}", "") === other.replace("{}", "");
  });
}

// ---------------------------------------------------------------- the spec ---

function loadOperations(specsDir) {
  const specRoot = path.join(specsDir, "specification");
  const operations = [];
  for (const area of fs.readdirSync(specRoot).sort()) {
    const versions = fs
      .readdirSync(path.join(specRoot, area))
      .filter((v) => /^\d+\.\d+$/.test(v))
      .sort((a, b) => parseFloat(a) - parseFloat(b));
    const version = versions.at(-1);
    if (!version) continue;
    const versionDir = path.join(specRoot, area, version);
    for (const file of fs.readdirSync(versionDir).filter((f) => f.endsWith(".json"))) {
      const spec = readJson(path.join(versionDir, file));
      for (const paths of [spec.paths ?? {}, spec["x-ms-paths"] ?? {}]) {
        for (const [route, byMethod] of Object.entries(paths)) {
          const apisIndex = route.indexOf("_apis/");
          if (apisIndex === -1) continue;
          const apiRoute = route.slice(apisIndex + "_apis/".length).split("?")[0];
          for (const method of HTTP_METHODS) {
            const op = byMethod[method];
            if (!op) continue;
            operations.push({
              area,
              version,
              method: method.toUpperCase(),
              route: apiRoute,
              segments: routeSegments(apiRoute),
              vssMethod: op["x-ms-vss-method"] ? lowerFirst(op["x-ms-vss-method"]) : undefined,
              group: op.tags?.[0] ?? "",
              summary: shorten((op.description ?? "").split("\n")[0].trim()),
              covered: false,
            });
          }
        }
      }
    }
  }
  return operations;
}

// ---------------------------------------------------------------- the code ---

function loadSources() {
  const dir = path.join(root, "src", "tools");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
  const sources = files.map((file) => ({ file, text: fs.readFileSync(path.join(dir, file), "utf8") }));
  sources.push({ file: "resources.ts", text: fs.readFileSync(path.join(root, "src", "resources.ts"), "utf8") });
  return sources;
}

/** Client methods each module calls, by name. */
function clientCalls(source) {
  return new Set([...source.text.matchAll(/\.([a-z][A-Za-z0-9]+)\(/g)].map((m) => m[1]));
}

/** Route-like literals in a module, with the HTTP method of their statement when one is visible. */
function restCalls(source) {
  const calls = [];
  const prefix = REST_PREFIXES[source.file];
  const literal = /`((?:[^`\\]|\\.)*)`|"([^"\\\n]*)"/g;
  for (const match of source.text.matchAll(literal)) {
    const raw = match[1] ?? match[2];
    if (!raw || raw.includes("pathAndQuery")) continue;
    // A relative route either has a path separator or carries a query string;
    // a bare word ("GET", "zod", an enum value) or a media type is not one.
    if (!raw.includes("_apis/") && ((!raw.includes("/") && !raw.includes("?")) || raw.startsWith("application/"))) continue;
    const normalized = raw
      .replace(/\$\{[^}]*\}/g, "{}")
      .split("?")[0]
      .replace(/^\{\}(?=\/)/, "");
    if (/\s/.test(normalized)) continue;
    let route;
    const apisIndex = normalized.indexOf("_apis/");
    if (apisIndex !== -1) {
      route = normalized.slice(apisIndex + "_apis/".length);
    } else if (prefix !== undefined && /^[a-z][a-z0-9]*(\/[^/]+)*$/i.test(normalized) && normalized !== "{}") {
      route = prefix + normalized;
    } else {
      continue;
    }
    if (!route || route.endsWith("/")) continue;

    // The statement around the literal: back to the previous line that ends one, forward to the next ";".
    const start = source.text.lastIndexOf(";", match.index) + 1;
    const end = source.text.indexOf(";", match.index);
    const statement = source.text.slice(start, end === -1 ? undefined : end);
    const method = statement.match(/["'](GET|POST|PUT|PATCH|DELETE)["']/)?.[1];
    calls.push({ route, segments: routeSegments(route), method, file: source.file });
  }
  return calls;
}

// ---------------------------------------------------------------- matching ---

function measure(operations, sources) {
  const unmappedClientMethods = new Set();
  const specVssMethods = new Set(operations.map((op) => op.vssMethod).filter(Boolean));
  const clientMethodNames = new Set();
  const nodeApiDir = path.join(root, "node_modules", "azure-devops-node-api");
  for (const file of fs.readdirSync(nodeApiDir).filter((f) => /Api(Base)?\.d\.ts$/.test(f))) {
    const declarations = fs.readFileSync(path.join(nodeApiDir, file), "utf8").split(/export declare class/)[0];
    for (const m of declarations.matchAll(/^\s{4}([a-z]\w+)\(/gm)) clientMethodNames.add(m[1]);
  }

  for (const source of sources) {
    const called = [...clientCalls(source)].filter((name) => clientMethodNames.has(name));
    for (const name of called) {
      const vssName = METHOD_ALIASES[name] ?? name;
      if (!specVssMethods.has(vssName)) unmappedClientMethods.add(name);
      for (const op of operations) {
        if (op.vssMethod !== vssName) continue;
        const clients = AREA_CLIENTS[op.area] ?? [];
        if (clients.some((getter) => source.text.includes(`${getter}(`))) op.covered = true;
      }
    }
  }

  const unmatchedRest = [];
  for (const call of sources.flatMap(restCalls)) {
    const hits = operations.filter((op) => segmentsMatch(op.segments, call.segments));
    if (hits.length === 0) {
      unmatchedRest.push(call);
      continue;
    }
    const sameMethod = hits.filter((op) => op.method === call.method);
    for (const op of call.method && sameMethod.length > 0 ? sameMethod : hits) op.covered = true;
  }

  return { unmappedClientMethods: [...unmappedClientMethods].sort(), unmatchedRest };
}

// ---------------------------------------------------------------- report ---

const PLAN_START = "<!-- plan:start -->";
const PLAN_END = "<!-- plan:end -->";
const HISTORY_START = "<!-- history:start -->";
const HISTORY_END = "<!-- history:end -->";

const DEFAULT_PLAN = `- [ ] Artifacts: фіди (зміна, видалення, кошик, права, views, retention), пакети й версії, просування у view, unlist, видалення й відновлення версій
- [ ] Git: порівняння комітів, коміт і пуші, конфлікти PR, коміти PR, зміна репозиторію, імпорт, форки
- [ ] Робочі елементи: видалення коментаря й версії коментарів, зміна й видалення поля, історія змін
- [ ] Пайплайни: видалення збірки, видалення й відновлення визначення, теги визначень, YAML визначення, дозволи на ресурси, налаштування retention
- [ ] Агенти: пули й черги, черга запитів до агентів, deployment groups, secure files
- [ ] Тест-плани: зміна й видалення планів і сьютів, конфігурації, змінні, клонування
- [ ] Wiki: коментарі до сторінок, зміна й видалення wiki
- [ ] Service connections і service hooks: решта операцій`;

function between(text, start, end) {
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  return a === -1 || b === -1 ? undefined : text.slice(a + start.length, b).trim();
}

const pct = (covered, total) => (total === 0 ? "—" : `${Math.round((100 * covered) / total)}%`);

function render({ operations, specsCommit, specsDate, toolCount, previous, measured }) {
  const relevant = operations.filter((op) => !EXCLUDED_AREAS[op.area]);
  const excluded = operations.filter((op) => EXCLUDED_AREAS[op.area]);
  const covered = relevant.filter((op) => op.covered).length;
  const today = new Date().toISOString().slice(0, 10);

  const plan = (previous && between(previous, PLAN_START, PLAN_END)) || DEFAULT_PLAN;

  const historyRows = ((previous && between(previous, HISTORY_START, HISTORY_END)) || "").split("\n").filter((line) => /^\|\s*\d{4}-\d{2}-\d{2}/.test(line));
  const last = historyRows
    .at(-1)
    ?.split("|")
    .map((cell) => cell.trim());
  const lastTools = last ? Number(last[2]) : undefined;
  const lastCovered = last ? Number(last[3]) : undefined;
  if (lastTools !== toolCount || lastCovered !== covered) {
    historyRows.push(`| ${today} | ${toolCount} | ${covered} | ${relevant.length} | ${pct(covered, relevant.length)} | |`);
  }

  const areas = [...new Set(operations.map((op) => op.area))];
  const areaRows = areas
    .map((area) => {
      const ops = operations.filter((op) => op.area === area);
      const done = ops.filter((op) => op.covered).length;
      return { area, total: ops.length, done, excluded: EXCLUDED_AREAS[area] };
    })
    .sort((a, b) => Number(Boolean(a.excluded)) - Number(Boolean(b.excluded)) || b.total - b.done - (a.total - a.done));

  const label = (area) => `${AREA_LABELS[area] ?? area} (\`${area}\`)`;

  const lines = [
    "# Покриття Azure DevOps REST API",
    "",
    "Скільки документованих операцій Azure DevOps REST API викликають інструменти сервера. Згенеровано `npm run api-coverage` ([scripts/api-coverage.mjs](../scripts/api-coverage.mjs)); таблиці перезаписуються при кожному запуску, план і примітки в таблиці прогресу зберігаються.",
    "",
    `Еталон — [MicrosoftDocs/vsts-rest-api-specs](https://github.com/MicrosoftDocs/vsts-rest-api-specs) \`${specsCommit}\` (${specsDate}), найновіша версія 7.x кожної області. Операція вважається покритою, якщо модуль інструментів викликає її через \`azure-devops-node-api\` або прямим REST-запитом. Обидва способи визначаються статичним аналізом коду, тож цифри близькі, а не точні; нерозпізнане перелічено наприкінці.`,
    "",
    "## Підсумок",
    "",
    "| | Операцій | Покрито | % |",
    "| --- | ---: | ---: | ---: |",
    `| Потрібні області | ${relevant.length} | ${covered} | ${pct(covered, relevant.length)} |`,
    `| Свідомо не покриваємо | ${excluded.length} | ${excluded.filter((op) => op.covered).length} | — |`,
    "",
    "## Прогрес",
    "",
    "Новий рядок додається, коли змінюється кількість інструментів або покритих операцій. Стовпець «Примітка» — ручний.",
    "",
    HISTORY_START,
    "",
    "| Дата | Інструментів | Покрито операцій | З | % | Примітка |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    ...historyRows,
    "",
    HISTORY_END,
    "",
    "## План",
    "",
    "Редагується вручну; генератор його не чіпає.",
    "",
    PLAN_START,
    "",
    plan,
    "",
    PLAN_END,
    "",
    "## За областями",
    "",
    "Спершу потрібні області — від найбільшої кількості непокритих операцій, далі ті, що свідомо не покриваємо.",
    "",
    "| Область | Операцій | Покрито | % | Непокрито | Примітка |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    ...areaRows.map((row) => `| ${label(row.area)} | ${row.total} | ${row.done} | ${row.excluded ? "—" : pct(row.done, row.total)} | ${row.total - row.done} | ${row.excluded ?? ""} |`),
    "",
    "## Непокриті операції",
    "",
    "Лише потрібні області. Шлях — частина маршруту після `_apis/`.",
    "",
  ];

  for (const row of areaRows.filter((r) => !r.excluded && r.done < r.total)) {
    const missing = operations.filter((op) => op.area === row.area && !op.covered).sort((a, b) => a.group.localeCompare(b.group) || a.route.localeCompare(b.route));
    lines.push(`<details>`, `<summary>${AREA_LABELS[row.area] ?? row.area} — ${row.total - row.done} з ${row.total}</summary>`, "");
    lines.push("| Група | Метод | Шлях | Що робить |", "| --- | --- | --- | --- |");
    for (const op of missing) {
      lines.push(`| ${op.group} | ${op.method} | \`${op.route}\` | ${op.summary.replace(/\|/g, "\\|")} |`);
    }
    lines.push("", "</details>", "");
  }

  lines.push(
    "## Нерозпізнане",
    "",
    "Виклики в коді, які генератор не зміг прив'язати до операції специфікації. Це або API поза специфікацією (Analytics OData, Project Analysis, `connectionData`), або прогалина в евристиці — тоді її варто виправити в скрипті.",
    ""
  );
  const unmatched = [...new Set(measured.unmatchedRest.map((call) => `\`${call.route}\` (${call.file})`))].sort();
  lines.push(unmatched.length ? unmatched.map((entry) => `- ${entry}`).join("\n") : "- REST-виклики: усі розпізнано.");
  lines.push(
    "",
    measured.unmappedClientMethods.length
      ? `- Методи \`azure-devops-node-api\` без відповідної операції: ${measured.unmappedClientMethods.map((name) => `\`${name}\``).join(", ")}.`
      : "- Методи `azure-devops-node-api`: усі зіставлено.",
    ""
  );

  return { text: lines.join("\n"), covered, relevant: relevant.length };
}

// ---------------------------------------------------------------- main ---

const specsDir = specsDirectory();
const specsCommit = execFileSync("git", ["-C", specsDir, "log", "-1", "--format=%h"], { encoding: "utf8" }).trim();
const specsDate = execFileSync("git", ["-C", specsDir, "log", "-1", "--format=%cs"], { encoding: "utf8" }).trim();

const operations = loadOperations(specsDir);
const measured = measure(operations, loadSources());

// --covered <area>: print what the heuristics attributed, to check them against the tools.
const explainArea = argValue("--covered");
if (explainArea) {
  for (const op of operations.filter((o) => o.area === explainArea && o.covered)) console.log(`${op.method.padEnd(6)} ${op.route}`);
  process.exit(0);
}

const toolsetPath = path.join(root, "docs", "TOOLSET.md");
const toolCount = (fs.readFileSync(toolsetPath, "utf8").match(/^### mcp_ado_/gm) ?? []).length;
const previous = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf8") : undefined;

const { text, covered, relevant } = render({ operations, specsCommit, specsDate, toolCount, previous, measured });

const { format, resolveConfig } = await import("prettier");
fs.writeFileSync(docPath, await format(text, { ...(await resolveConfig(docPath)), filepath: docPath }));
console.log(`docs/API-COVERAGE.md: ${covered} of ${relevant} operations covered (${pct(covered, relevant)}), specs ${specsCommit}.`);

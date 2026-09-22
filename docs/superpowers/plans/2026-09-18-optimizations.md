# Оптимізації після аналізу 2026-09-18 — план реалізації

> **Для агентів-виконавців:** ОБОВ'ЯЗКОВА під-навичка: superpowers:subagent-driven-development (рекомендовано) або superpowers:executing-plans. Кроки позначені чекбоксами (`- [ ]`). Кожен агент виконує **лише своє завдання** і читає розділи «Глобальні обмеження» та «Робоче середовище агента».

**Мета:** прискорити виклики інструментів, зменшити схеми `tools/list` і відповіді в токенах, прибрати дублювання в `src/tools`, пришвидшити локальний цикл і CI.

**Архітектура:** дев'ять агентів у дві хвилі. Кожен працює у власному git worktree на своїй гілці. Файли між завданнями не перетинаються, тож гілки зливаються без конфліктів. Координатор (основна сесія) рев'юїть, інтегрує, оновлює згенеровані документи й відкриває 4 PR.

**Стек:** TypeScript (ESM, `module: Node16`), `@modelcontextprotocol/sdk` 1.30.0, `azure-devops-node-api` 15.1.2, zod 3, jest 30 + ts-jest, GitHub Actions.

**Джерело вимог:** аналіз у сесії 2026-09-18. Ключові заміри, на які спирається план:

- Кожен виклик через node-api робить 4 HTTP-запити: `OPTIONS _apis/Location`, `GET _apis/ResourceAreas`, `OPTIONS _apis/<area>` і сам запит. Займає це ~1050 мс, а з кешем метаданих ~250–450 мс.
- `tools/list` важить 545 KB. З них `$schema` займає ~8k токенів, `execution` ~6k, `destructiveHint` у read-only ~2k, опис `project` ~4k.
- Відповіді з `JSON.stringify(x, null, 2)` на 13–15% довші за компактні.
- 328 однакових catch-блоків, 7 локальних копій `ok`/`failed`, 5 копій `resolveProject`.
- `lint-staged` форматує весь репозиторій, ~15 с на коміт. `npm test <file>` падає на глобальних порогах покриття. У CI `tsc` працює тричі.

## Глобальні обмеження

- Мова коммітів: українська, conventional-префікс як в історії (`perf(...)`, `refactor(...)`, `chore(...)`). Останній рядок кожного комміту: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Кожен новий `src/**/*.ts` починається з заголовка:
  ```ts
  // Copyright (c) Microsoft Corporation.
  // Licensed under the MIT License.
  ```
- Імпорти в `src` з `.js`-специфікаторами (`../shared/tool-results.js`).
- Нічого не писати в stdout; логування лише через `logger` з `src/logger.ts`.
- Тексти помилок інструментів зберігаються дослівно (`Error <action>: <message>`), бо тести й користувачі на них покладаються.
- **Не редагувати** `CLAUDE.md`, `TODO.md`, `docs/TOOLSET.md`, `docs/API-COVERAGE.md`, `deploy/azure/README.md`. Їх оновлює координатор під час інтеграції (завдання 10). Замість цього агент у фінальному звіті перелічує, що в цих документах застаріло.
- Не пушити і не відкривати PR: агент лише коммітить у свою гілку.
- Не запускати `npm run format`: воно переписує весь репозиторій. Форматувати тільки свої файли: `npx prettier --write <файли>`.

## Робоче середовище агента

- [ ] Агент стартує в ізольованому worktree (`isolation: "worktree"`). Першою дією створює свою гілку. Точна команда наведена в завданні.
- [ ] Залежності ставить у своєму worktree: `npm ci --ignore-scripts`. `node_modules` з основного checkout не симлінкувати: `.gitignore` і `.prettierignore` не покривають симлінк.
- [ ] Збірка: `npm run build`. Швидкі тести: `npx jest <файли> --coverage=false`.
- [ ] Pre-commit хук (`npx lint-staged`) може тривати до ~15 с, це нормально. `--no-verify` не використовувати.
- [ ] Фінальний звіт агента містить: гілку, список коммітів, вивід перевірок (tsc, jest, eslint), застарілі місця в документах.

## Хвилі виконання

| Хвиля | Завдання                               | Гілка                                     | Від чого відгалужується | PR   |
| ----- | -------------------------------------- | ----------------------------------------- | ----------------------- | ---- |
| 1     | 1. Кеш метаданих ADO                   | `perf/ado-metadata-cache`                 | `main`                  | PR-1 |
| 1     | 2. Схуднення `tools/list`              | `perf/tool-list-slimming`                 | `main`                  | PR-2 |
| 1     | 3. Цикл розробки, CI, залежності       | `chore/dev-loop-ci`                       | `main`                  | PR-3 |
| 1     | 4. Фундамент рефакторингу інструментів | `refactor/foundation`                     | `main`                  | PR-4 |
| 2     | 5–9. Зрізи інструментів E1–E5          | `refactor/tools-e1` … `refactor/tools-e5` | `refactor/foundation`   | PR-4 |
| 3     | 10. Інтеграція (координатор)           | `refactor/tool-responses` + решта         | —                       | усі  |

Хвиля 2 стартує, щойно завдання 4 закоммічене. Завдання 1–3 можуть ще тривати.

## Карта файлів

| Файл                                                                                                                                                                                                                               | Завдання | Що міняється                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------ |
| `src/shared/ado-metadata-cache.ts` (новий)                                                                                                                                                                                         | 1        | спільний кеш resource areas і locations    |
| `src/index.ts` — `getAzureDevOpsClient`                                                                                                                                                                                            | 1        | обгортання `WebApi`                        |
| `src/index.ts` — імпорти, `createConfiguredServer`                                                                                                                                                                                 | 2        | `slimToolList(server)`, прибрати `prompts` |
| `src/prompts.ts` (видалити)                                                                                                                                                                                                        | 2        | мертвий код                                |
| `src/shared/tool-list.ts` (новий)                                                                                                                                                                                                  | 2        | пост-обробка відповіді `tools/list`        |
| `src/shared/tool-registration.ts`                                                                                                                                                                                                  | 2        | `read` без `destructiveHint`               |
| `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `jest.config.cjs` (`collectCoverage`), `.github/workflows/build.yml`                                                                                           | 3        | цикл розробки й CI                         |
| `src/shared/tool-results.ts` (новий), `src/shared/common-params.ts`, `src/shared/elicitations.ts`, `src/shared/content-safety.ts`, `src/resources.ts`, `src/shared/server-instructions.ts`, `jest.config.cjs` (`moduleNameMapper`) | 4        | спільні хелпери                            |
| `src/tools/*.ts` + відповідні `test/src/tools/*.test.ts`                                                                                                                                                                           | 5–9      | застосування хелперів, по зрізах           |

---

### Завдання 1: спільний кеш метаданих ADO (PR-1)

**Гілка:** `git checkout -b perf/ado-metadata-cache main`

**Файли:**

- Створити: `src/shared/ado-metadata-cache.ts`
- Змінити: `src/index.ts:118-131` (`getAzureDevOpsClient`)
- Тест: `test/src/ado-metadata-cache.test.ts`

**Інтерфейси:**

- Надає: `shareAdoMetadata(connection: WebApi): WebApi`, `clearAdoMetadataCache(): void`

**Чому.** `azure-devops-node-api` кешує resource areas у полі `WebApi._resourceAreas`, а locations — у `VsoClient._locationsByAreaPromises`, тобто на рівні екземпляра. `connectionProvider` будує новий `WebApi` на кожен виклик, тож кеш щоразу порожній. Обидва набори метаданих описують розкладку сервісів організації й однакові для всіх користувачів. Отже, спільний кеш на рівні процесу безпечний і в stateless HTTP-транспорті: токени й дані користувачів у нього не потрапляють. Невдалі запити бібліотека не кешує, і наш кеш теж.

- [ ] **Крок 1: написати тест, що падає**

`test/src/ado-metadata-cache.test.ts`:

```ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { getBearerHandler, WebApi } from "azure-devops-node-api";

import { clearAdoMetadataCache, shareAdoMetadata } from "../../src/shared/ado-metadata-cache";

const ORG = "https://dev.azure.com/contoso";

type Internals = { _getResourceAreas: () => Promise<unknown> };
type ClientInternals = { vsoClient: { baseUrl: string; _locationsByAreaPromises: Record<string, unknown> } };

function connectionWithAreas(load: jest.Mock): WebApi {
  const connection = new WebApi(ORG, getBearerHandler("token"));
  (connection as unknown as Internals)._getResourceAreas = load;
  return shareAdoMetadata(connection);
}

describe("shareAdoMetadata", () => {
  beforeEach(() => clearAdoMetadataCache());

  it("relies on azure-devops-node-api internals that still exist", async () => {
    // If this fails after a dependency upgrade, the cache silently stopped working.
    const connection = new WebApi(ORG, getBearerHandler("token"));
    expect(typeof (connection as unknown as Internals)._getResourceAreas).toBe("function");
    (connection as unknown as Internals)._getResourceAreas = jest.fn().mockResolvedValue([]);
    const client = (await connection.getCoreApi()) as unknown as ClientInternals;
    expect(typeof client.vsoClient.baseUrl).toBe("string");
    expect(typeof client.vsoClient._locationsByAreaPromises).toBe("object");
  });

  it("loads the resource areas once per organization", async () => {
    const first = jest.fn().mockResolvedValue([]);
    const second = jest.fn().mockResolvedValue([]);
    const a = connectionWithAreas(first);
    const b = connectionWithAreas(second);

    await (a as unknown as Internals)._getResourceAreas();
    await (b as unknown as Internals)._getResourceAreas();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("does not keep a failed lookup", async () => {
    const failing = jest.fn().mockRejectedValue(new Error("401"));
    const working = jest.fn().mockResolvedValue([]);

    await expect((connectionWithAreas(failing) as unknown as Internals)._getResourceAreas()).rejects.toThrow("401");
    await (connectionWithAreas(working) as unknown as Internals)._getResourceAreas();

    expect(working).toHaveBeenCalledTimes(1);
  });

  it("does not keep an empty lookup", async () => {
    const empty = jest.fn().mockResolvedValue(undefined);
    const working = jest.fn().mockResolvedValue([]);

    await (connectionWithAreas(empty) as unknown as Internals)._getResourceAreas();
    await (connectionWithAreas(working) as unknown as Internals)._getResourceAreas();

    expect(working).toHaveBeenCalledTimes(1);
  });

  it("shares area locations between clients of different connections", async () => {
    const a = connectionWithAreas(jest.fn().mockResolvedValue([]));
    const b = connectionWithAreas(jest.fn().mockResolvedValue([]));

    const first = (await a.getCoreApi()) as unknown as ClientInternals;
    const second = (await b.getGitApi()) as unknown as ClientInternals;

    expect(first.vsoClient._locationsByAreaPromises).toBe(second.vsoClient._locationsByAreaPromises);
  });

  it("keeps locations of different hosts apart", async () => {
    const a = connectionWithAreas(jest.fn().mockResolvedValue([]));

    const core = (await a.getCoreApi()) as unknown as ClientInternals;
    const other = (await a.getCoreApi("https://vssps.dev.azure.com/contoso")) as unknown as ClientInternals;

    expect(core.vsoClient._locationsByAreaPromises).not.toBe(other.vsoClient._locationsByAreaPromises);
  });
});
```

- [ ] **Крок 2: переконатися, що тест падає**

Команда: `npx jest test/src/ado-metadata-cache.test.ts --coverage=false`
Очікувано: FAIL, `Cannot find module '../../src/shared/ado-metadata-cache'`.

- [ ] **Крок 3: реалізація**

`src/shared/ado-metadata-cache.ts`:

```ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// azure-devops-node-api resolves two kinds of service metadata before the first
// real request of a client: the organization's resource areas (which host
// serves which area) and each area's resource locations (the OPTIONS response
// that maps a route id to a URL template and api-versions). It caches both, but
// on the WebApi and client instances — and the server builds a fresh WebApi for
// every tool call, so every call paid three extra round trips (measured on a
// real organization: 4 requests and ~1s instead of 1 request).
//
// Neither is user data: both describe the organization's service layout and are
// the same for every caller, so one process-wide cache is safe in the stateless
// HTTP transport too. Failed or empty lookups are not kept, matching the
// library, which only stores a location promise once it resolved.

import { WebApi } from "azure-devops-node-api";

import { logger } from "../logger.js";

type AreaLocations = Record<string, Promise<unknown>>;

interface WebApiInternals {
  _getResourceAreas?: () => Promise<unknown>;
}

interface ClientInternals {
  vsoClient?: { baseUrl?: unknown; _locationsByAreaPromises?: unknown };
}

const resourceAreasByOrganization = new Map<string, Promise<unknown>>();
const locationsByBaseUrl = new Map<string, AreaLocations>();

// getCoreApi, getGitApi, … — every factory that hands out a REST client.
const API_FACTORIES = Object.getOwnPropertyNames(WebApi.prototype).filter((name) => /^get\w+Api$/.test(name));

let warnedAboutInternals = false;

/** Make `connection` use the process-wide metadata cache. Returns the same object. */
export function shareAdoMetadata(connection: WebApi): WebApi {
  const internals = connection as unknown as WebApiInternals & Record<string, unknown>;
  if (typeof internals._getResourceAreas !== "function") {
    if (!warnedAboutInternals) {
      warnedAboutInternals = true;
      logger.warn("azure-devops-node-api internals changed; Azure DevOps metadata is no longer shared between tool calls");
    }
    return connection;
  }

  const loadResourceAreas = internals._getResourceAreas.bind(connection);
  const organization = connection.serverUrl.toLowerCase();
  internals._getResourceAreas = () => {
    let areas = resourceAreasByOrganization.get(organization);
    if (!areas) {
      areas = loadResourceAreas();
      resourceAreasByOrganization.set(organization, areas);
      const forget = () => resourceAreasByOrganization.delete(organization);
      areas.then((value) => value === undefined && forget(), forget);
    }
    return areas;
  };

  for (const factory of API_FACTORIES) {
    const original = internals[factory];
    if (typeof original === "function") {
      internals[factory] = async (...args: unknown[]) => shareLocations(await original.apply(connection, args));
    }
  }
  return connection;
}

function shareLocations<T>(client: T): T {
  const vsoClient = (client as ClientInternals | undefined)?.vsoClient;
  if (vsoClient && typeof vsoClient.baseUrl === "string" && typeof vsoClient._locationsByAreaPromises === "object" && vsoClient._locationsByAreaPromises !== null) {
    const key = vsoClient.baseUrl.toLowerCase();
    let shared = locationsByBaseUrl.get(key);
    if (!shared) {
      shared = vsoClient._locationsByAreaPromises as AreaLocations;
      locationsByBaseUrl.set(key, shared);
    }
    vsoClient._locationsByAreaPromises = shared;
  }
  return client;
}

/** Test seam: forget everything cached. */
export function clearAdoMetadataCache(): void {
  resourceAreasByOrganization.clear();
  locationsByBaseUrl.clear();
}
```

- [ ] **Крок 4: переконатися, що тести проходять**

Команда: `npx jest test/src/ado-metadata-cache.test.ts --coverage=false`
Очікувано: 6 passed.

- [ ] **Крок 5: підключити в `src/index.ts`**

Додати імпорт **одразу після** рядка `import { DomainsManager } from "./shared/domains.js";`. Місце зафіксоване: завдання 2 додає свій імпорт на три рядки нижче, і так гілки не конфліктують.

```ts
import { shareAdoMetadata } from "./shared/ado-metadata-cache.js";
```

У `getAzureDevOpsClient` замінити `return connection;` на:

```ts
// A fresh WebApi per call keeps credentials per request; the service
// metadata it would otherwise re-fetch every time is shared instead.
return shareAdoMetadata(connection);
```

- [ ] **Крок 6: перевірка на живій організації (якщо є `az`-токен)**

Покласти скрипт у `dist/__reqcount.mjs`: з `dist` резолвиться `node_modules`, а `dist` у `.gitignore`.

```js
import https from "node:https";
import { getBearerHandler, WebApi } from "azure-devops-node-api";
import { shareAdoMetadata } from "./shared/ado-metadata-cache.js";
const log = [];
const orig = https.request;
https.request = function (...a) {
  const o = typeof a[0] === "object" && !(a[0] instanceof URL) ? a[0] : (a[1] ?? {});
  log.push(`${o.method ?? "GET"} ${o.path ?? String(a[0])}`);
  return orig.apply(this, a);
};
const conn = () => shareAdoMetadata(new WebApi("https://dev.azure.com/dl-sol", getBearerHandler(process.env.T)));
for (let i = 1; i <= 3; i++) {
  log.length = 0;
  const t = performance.now();
  await (await conn().getGitApi()).getRepositories();
  console.log(`call ${i}: ${log.length} requests, ${(performance.now() - t).toFixed(0)} ms`);
}
```

Команда: `npm run build && T=$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv) node dist/__reqcount.mjs; rm dist/__reqcount.mjs`
Очікувано: перший виклик 4 запити, другий і третій по 1. Якщо `az` недоступний, пропустити крок і написати про це у звіті.

- [ ] **Крок 7: повна перевірка й коміт**

```bash
npx tsc --noEmit && npx eslint src/shared/ado-metadata-cache.ts src/index.ts test/src/ado-metadata-cache.test.ts
npx prettier --write src/shared/ado-metadata-cache.ts src/index.ts test/src/ado-metadata-cache.test.ts
git add src/shared/ado-metadata-cache.ts src/index.ts test/src/ado-metadata-cache.test.ts
git commit -m "perf(core): спільний кеш метаданих ADO — один запит на виклик замість чотирьох"
```

**У звіті для CLAUDE.md:** у розділі «Tools and domains» біля речення «Most tools use `connectionProvider()`…» додати, що `shareAdoMetadata` кешує resource areas і locations на рівні процесу, і пояснити чому.

---

### Завдання 2: схуднення `tools/list` (PR-2)

**Гілка:** `git checkout -b perf/tool-list-slimming main`

**Файли:**

- Створити: `src/shared/tool-list.ts`
- Змінити: `src/index.ts` (рядок 14, блок біля 158–169), `src/shared/tool-registration.ts:16`, `jest.config.cjs` (одна мапа наприкінці `moduleNameMapper`)
- Видалити: `src/prompts.ts`
- Тести: `test/src/tool-list.test.ts` (новий), `test/src/tool-registration.test.ts:72`

**Інтерфейси:**

- Надає: `slimTool(tool: Tool): Tool`, `slimToolList(server: McpServer): void`

**Чому.** SDK 1.30 додає до кожного інструмента `inputSchema.$schema` (~8k токенів на весь набір) і `execution: {taskSupport:"forbidden"}` (~6k), а за специфікацією відсутнє `execution` і так означає `forbidden`. `destructiveHint` має сенс лише при `readOnlyHint:false` (~2k). Робимо це пост-обробкою відповіді `tools/list`, тим самим прийомом, яким `instrumentToolUsage` обгортає `tools/call`. Поле `additionalProperties:false` **лишаємо**: без нього ламаються строгі клієнти.

- [ ] **Крок 1: написати тест, що падає**

`test/src/tool-list.test.ts`:

```ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { slimTool, slimToolList } from "../../src/shared/tool-list";
import { registerTool } from "../../src/shared/tool-registration";

async function listTools(server: McpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await server.connect(serverSide);
  await client.connect(clientSide);
  const result = await client.listTools();
  await client.close();
  return result.tools;
}

describe("slimToolList", () => {
  it("drops $schema and the default execution from every listed tool", async () => {
    const server = new McpServer({ name: "t", version: "1" });
    slimToolList(server);
    registerTool(server, "wit_get_work_item", "Get a work item.", { id: z.number().describe("The id.") }, async () => ({ content: [] }));

    const [tool] = await listTools(server);

    expect(tool.inputSchema).not.toHaveProperty("$schema");
    expect(tool).not.toHaveProperty("execution");
    expect(tool.inputSchema.properties).toEqual({ id: { type: "number", description: "The id." } });
    expect(tool.annotations).toEqual({ readOnlyHint: true });
  });

  it("leaves other request handlers alone", async () => {
    const server = new McpServer({ name: "t", version: "1" });
    slimToolList(server);
    registerTool(server, "core_create_team", "Create a team.", { name: z.string() }, async () => ({ content: [{ type: "text", text: "done" }] }));

    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await server.connect(serverSide);
    await client.connect(clientSide);
    const result = await client.callTool({ name: "core_create_team", arguments: { name: "x" } });
    await client.close();

    expect(result.content).toEqual([{ type: "text", text: "done" }]);
  });
});

describe("slimTool", () => {
  const base: Tool = { name: "x", inputSchema: { type: "object", $schema: "http://json-schema.org/draft-07/schema#", properties: {} } as Tool["inputSchema"] };

  it("keeps an execution that is not the default", () => {
    expect(slimTool({ ...base, execution: { taskSupport: "optional" } }).execution).toEqual({ taskSupport: "optional" });
  });

  it("drops $schema from an output schema too", () => {
    const slim = slimTool({ ...base, outputSchema: { type: "object", $schema: "x" } as Tool["outputSchema"] });
    expect(slim.outputSchema).not.toHaveProperty("$schema");
  });

  it("does not mutate the tool it was given", () => {
    slimTool(base);
    expect(base.inputSchema).toHaveProperty("$schema");
  });
});
```

У `test/src/tool-registration.test.ts:72` замінити очікування на `["wit_get_work_item", { readOnlyHint: true }],`.

- [ ] **Крок 2: переконатися, що тести падають**

Команда: `npx jest test/src/tool-list.test.ts test/src/tool-registration.test.ts --coverage=false`
Очікувано: FAIL. `tool-list` не знаходить модуль, а в `tool-registration` є зайвий `destructiveHint`.

- [ ] **Крок 3: реалізація**

`src/shared/tool-list.ts`:

```ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Trims what the SDK adds to every entry of a tools/list response but no client
// needs. The full tool list is paid for in model context on every request, so
// per-tool boilerplate multiplies by ~620:
//
//   inputSchema.$schema          the JSON Schema dialect URL        ~8k tokens
//   execution.taskSupport         "forbidden" is what absence means  ~6k tokens
//
// additionalProperties:false stays: strict clients rely on it.

import { ListToolsRequestSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function withoutDialect<T extends object>(schema: T): T {
  const copy = { ...schema } as T & { $schema?: unknown };
  delete copy.$schema;
  return copy;
}

/** A copy of `tool` without the fields that carry no information. */
export function slimTool(tool: Tool): Tool {
  const slim: Tool = { ...tool, inputSchema: withoutDialect(tool.inputSchema) };
  if (tool.outputSchema) {
    slim.outputSchema = withoutDialect(tool.outputSchema);
  }
  if (!tool.execution?.taskSupport || tool.execution.taskSupport === "forbidden") {
    delete slim.execution;
  }
  return slim;
}

/**
 * Slim every tools/list response of `server`.
 *
 * Must run before the first tool is registered, like instrumentToolUsage:
 * McpServer installs its tools/list handler lazily on the first registration,
 * and this wraps that handler as it is installed.
 */
export function slimToolList(server: McpServer): void {
  const lowLevel = server.server;
  const original = lowLevel.setRequestHandler.bind(lowLevel) as (...args: unknown[]) => void;

  (lowLevel as unknown as { setRequestHandler: (...args: unknown[]) => void }).setRequestHandler = (schema: unknown, handler: unknown) => {
    if (schema !== ListToolsRequestSchema || typeof handler !== "function") {
      original(schema, handler);
      return;
    }
    const listHandler = handler as (...args: unknown[]) => Promise<{ tools: Tool[] }>;
    original(schema, async (...args: unknown[]) => {
      const result = await listHandler(...args);
      return { ...result, tools: result.tools.map(slimTool) };
    });
  };
}
```

`src/shared/tool-registration.ts:16`: `read: { readOnlyHint: true },`. Коментар у рядку 10 уже каже `read -> readOnlyHint: true`.

`jest.config.cjs`, після рядка `"^(.+)/usage-stats\\.js$": "$1/usage-stats.ts",` додати:

```js
    "^(.+)/tool-list\\.js$": "$1/tool-list.ts",
```

- [ ] **Крок 4: переконатися, що тести проходять**

Команда: `npx jest test/src/tool-list.test.ts test/src/tool-registration.test.ts --coverage=false`
Очікувано: усі тести проходять.

- [ ] **Крок 5: підключити в `src/index.ts` і прибрати prompts**

Спершу перевірити: `grep -rn "prompts" src test`. Мають бути лише `src/prompts.ts` і два коментарі в `src/index.ts`. Якщо знайдеться тест на `configurePrompts`, видалити і його.

- Видалити рядок 14 `//import { configurePrompts } from "./prompts.js";` і рядки 168–169 (`// removing prompts untill further notice` та `// configurePrompts(server);`).
- `git rm src/prompts.ts`.
- Додати імпорт `import { slimToolList } from "./shared/tool-list.js";` **одразу після** рядка `import { instrumentToolUsage, logToolCatalog } from "./shared/usage-stats.js";`. Місце зафіксоване: завдання 1 додає свій імпорт трьома рядками вище.
- Одразу після виклику `instrumentToolUsage(...)` додати:

```ts
// Also before any tool registers: trims per-tool boilerplate from tools/list.
slimToolList(server);
```

- [ ] **Крок 6: замір токенів**

```bash
npm run build
node dist/index.js dl-sol --transport http --port 3931 >/dev/null 2>&1 & PID=$!; sleep 4
for p in /mcp /mcp/dev /mcp/plan /mcp/ops /mcp/admin; do
  curl -s -H "Authorization: Bearer dummy" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
    -X POST http://127.0.0.1:3931$p -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | wc -c | awk -v p=$p '{printf "%s %d bytes ≈ %.1fk tokens\n", p, $1, $1/4/1000}'
done; kill $PID
```

Очікувано: `/mcp` до зміни 544 915 байт (≈136k), після ≈ 480 000 байт або менше. Цифри для кожного шляху занести у звіт.

- [ ] **Крок 7: повна перевірка й коміт**

```bash
npx tsc --noEmit && npx eslint src/shared/tool-list.ts src/shared/tool-registration.ts src/index.ts test/src/tool-list.test.ts test/src/tool-registration.test.ts
npm run toolset-check   # TOOLSET.md не має змінитися; якщо змінився — описати у звіті, не комітити
npx prettier --write src/shared/tool-list.ts src/shared/tool-registration.ts src/index.ts test/src/tool-list.test.ts test/src/tool-registration.test.ts jest.config.cjs
git add src/shared/tool-list.ts src/shared/tool-registration.ts src/index.ts jest.config.cjs test/src/tool-list.test.ts test/src/tool-registration.test.ts
git commit -m "perf(tools): без \$schema, execution і зайвого destructiveHint у tools/list; прибрано prompts.ts"
```

**У звіті:** нові розміри для таблиці в `deploy/azure/README.md:153-161`, для `CLAUDE.md` (~136k, ~55k) і `TODO.md:11`; пункт `TODO.md:70` про `$schema` закрито.

---

### Завдання 3: цикл розробки, CI, залежності (PR-3)

**Гілка:** `git checkout -b chore/dev-loop-ci main`

**Файли:** `package.json`, `package-lock.json`, `jest.config.cjs` (рядок `collectCoverage` і новий `cacheDirectory`), `tsconfig.json`, `.gitignore`, `.github/workflows/build.yml`

**Інтерфейси:**

- Надає: скрипт `npm run test:ci` (= `jest --coverage`). Координатор згадує його в `CLAUDE.md`.

- [ ] **Крок 1: lint-staged форматує лише staged-файли**

`package.json`, розділ `lint-staged`: замінити `"npm run format"` на `"prettier --write"`.

Перевірка: змінити пробіл у будь-якому `.md`, зробити `git add` і `npx lint-staged --debug 2>&1 | grep -i "prettier --write"`. Має бути запущено `prettier --write <шлях>`, не `.`. Зміну скасувати.

- [ ] **Крок 2: покриття лише в CI**

`jest.config.cjs`: `collectCoverage: false,`. Коментар над рядком: `// Coverage (and its global thresholds) runs in CI via "npm run test:ci"; a local run of one file would otherwise always fail the thresholds.`

Одразу після `collectCoverage` додати:

```js
  // Kept inside the repository so CI can cache it between runs.
  cacheDirectory: "<rootDir>/.jest-cache",
```

`package.json` scripts: `"test:ci": "jest --coverage"`.
`.gitignore`: додати рядок `.jest-cache/` наприкінці.

Перевірка: `npm test test/src/utils.test.ts` → exit 0 (раніше 1). `npm run test:ci` → усі тести й пороги проходять.

- [ ] **Крок 3: залежності**

```bash
grep -rn "azure-devops-extension\|tsconfig-paths" src test scripts   # має бути порожньо
grep -rn "zod-to-json-schema" src                                      # має бути порожньо
npm uninstall azure-devops-extension-api azure-devops-extension-sdk tsconfig-paths
npm uninstall zod-to-json-schema && npm install --save-dev zod-to-json-schema@^3.24.5
```

`package.json`: `"start": "node dist/index.js"`.

`tsconfig.json`: перевірити `grep -rnE "from \"(@modules|@tools|@config|@utils)" src`. Якщо порожньо, видалити `baseUrl` і `paths`. Потім `npx tsc --noEmit` має пройти. Якщо ні, повернути `baseUrl` і написати про це у звіті.

- [ ] **Крок 4: CI — `build.yml`**

Job `build` (лишається на `windows-latest`: там перевіряється запуск через `npx` на Windows):

- `setup-node`: додати `cache: npm`.
- `npm ci` → `npm ci --ignore-scripts`. `prepare` запускав повну збірку, яку наступний крок однаково повторює.
- Крок «Validate tool names and parameters»: `run: node scripts/build-validate-tools.js`. Типи вже перевірив `npm run build`.
- Перед «Run tests» додати кешування jest. SHA дізнатися командою `gh api repos/actions/cache/git/ref/tags/v4.2.3 --jq .object.sha` і закріпити так само, як інші дії:

```yaml
- name: Cache jest transforms
  uses: actions/cache@<sha> # v4.2.3
  with:
    path: .jest-cache
    key: jest-${{ runner.os }}-${{ hashFiles('package-lock.json', 'jest.config.cjs', 'tsconfig.jest.json') }}
```

- «Run tests»: `run: npm run test:ci`.

Job `static-code-analysis`:

- `runs-on: ubuntu-latest`.
- `setup-node`: `cache: npm`.
- `npm ci --ignore-scripts`, а за ним крок `- name: Regenerate src/version.ts` / `run: npm run prebuild`. Раніше це робив `prepare`, і без нього перевірка версії нижче нічого б не перевіряла.
- Крок «Verify package version is synced» переписати на bash:

```yaml
- name: Verify package version is synced
  run: |
    git diff --exit-code ./src/version.ts || { echo "Version mismatch detected. Please ensure that the version information in version.ts is up to date with package.json."; exit 1; }
    git diff --exit-code ./package-lock.json || { echo "Please run 'npm install' to update package-lock.json and add changes to the commit."; exit 1; }
```

Перевірка: `npx prettier --check .github/workflows/build.yml`. Якщо встановлений `actionlint`, то й `actionlint .github/workflows/build.yml`.

- [ ] **Крок 5: повна локальна перевірка**

```bash
npm run build && node scripts/build-validate-tools.js && npm run test:ci && npm run toolset-check && npm run eslint && npx prettier --check .
git diff --exit-code src/version.ts
```

Очікувано: усе зелене, `src/version.ts` без змін.

- [ ] **Крок 6: коміти (два окремі)**

```bash
git add package.json package-lock.json jest.config.cjs tsconfig.json .gitignore
git commit -m "chore: lint-staged лише для staged-файлів, покриття тільки в CI, прибрано невикористані залежності"
git add .github/workflows/build.yml
git commit -m "ci: кеш npm і jest, одна компіляція, статичний аналіз на ubuntu"
```

**У звіті для CLAUDE.md:** розділ Commands (`npm test` без покриття, `npm run test:ci` з порогами) і рядок про CI (`npm ci --ignore-scripts` → `build` → `node scripts/build-validate-tools.js` → `test:ci` → …).

---

### Завдання 4: фундамент рефакторингу інструментів (PR-4, база для хвилі 2)

**Гілка:** `git checkout -b refactor/foundation main`

**Файли:**

- Створити: `src/shared/tool-results.ts`, `test/src/tool-results.test.ts`
- Змінити: `src/shared/common-params.ts`, `src/shared/elicitations.ts`, `src/shared/content-safety.ts:34`, `src/resources.ts:143`, `src/shared/server-instructions.ts` (рядок Conventions про `project`), `jest.config.cjs` (`moduleNameMapper`, після рядка `common-params`)
- Оновити тести: `test/src/common-params.test.ts`, `test/src/elicitations.test.ts`, `test/src/content-safety.test.ts`, `test/src/tools-content-safety.test.ts`, `test/src/resources.test.ts`, `test/src/server-instructions.test.ts`

**Інтерфейси (на них спираються завдання 5–9, імена точні):**

```ts
// src/shared/tool-results.ts
export function jsonResult(value: unknown): CallToolResult; // compact JSON.stringify(value)
export function errorMessage(error: unknown): string; // Error → message; string → itself; else "Unknown error occurred"
export function toolError(action: string, error: unknown): CallToolResult; // text `Error ${action}: ${errorMessage(error)}`, isError: true

// src/shared/elicitations.ts
export interface ElicitResponse {
  response: { content: { type: "text"; text: string }[]; isError?: boolean };
}
export async function resolveProject(server: McpServer, connection: WebApi, project: string | undefined, message?: string): Promise<{ project: string } | ElicitResponse>;

// src/shared/common-params.ts (нові)
export const processIdParam; // z.string().describe("The ID (GUID) of the process.")
export const witRefNameParam; // z.string().describe("The reference name of the work item type, e.g. 'MyProcess.Bug'.")
export const continuationTokenParam; // z.string().optional().describe("Continuation token from a previous response, to fetch the next page.")
```

- [ ] **Крок 1: тест, що падає**

`test/src/tool-results.test.ts`:

```ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { errorMessage, jsonResult, toolError } from "../../src/shared/tool-results";

describe("tool-results", () => {
  it("serializes JSON compactly", () => {
    expect(jsonResult({ a: [1, 2] })).toEqual({ content: [{ type: "text", text: '{"a":[1,2]}' }] });
  });

  it("reads the message of an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("passes a thrown string through", () => {
    expect(errorMessage("boom")).toBe("boom");
  });

  it("does not print an arbitrary thrown value", () => {
    expect(errorMessage({ status: 500 })).toBe("Unknown error occurred");
  });

  it("formats a tool error the way every tool always has", () => {
    expect(toolError("fetching project teams", new Error("401"))).toEqual({
      content: [{ type: "text", text: "Error fetching project teams: 401" }],
      isError: true,
    });
  });
});
```

Команда: `npx jest test/src/tool-results.test.ts --coverage=false`. Очікувано: FAIL, модуль не знайдено.

- [ ] **Крок 2: `src/shared/tool-results.ts`**

```ts
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// The two shapes almost every tool handler returns. Each tool module used to
// spell them out inline — 328 identical catch blocks and seven local copies of
// an ok/failed pair — so they live here once.

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * A successful result carrying `value` as JSON. Compact on purpose: the reader
 * is a model, and indentation made typical Azure DevOps payloads 13–15% longer.
 */
export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

/** The text to show for something a handler caught. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown error occurred";
}

/** A failed result: `Error <action>: <message>`. */
export function toolError(action: string, error: unknown): CallToolResult {
  return { content: [{ type: "text", text: `Error ${action}: ${errorMessage(error)}` }], isError: true };
}
```

`jest.config.cjs`, одразу після рядка `"^(.+)/common-params\\.js$": "$1/common-params.ts",`:

```js
    "^(.+)/tool-results\\.js$": "$1/tool-results.ts",
```

Команда: `npx jest test/src/tool-results.test.ts --coverage=false`. Очікувано: 5 passed.

- [ ] **Крок 3: `resolveProject` в `elicitations.ts`**

Експортувати наявний `interface ElicitResponse` (додати `export`) і дописати наприкінці файлу:

```ts
/**
 * The project a tool acts on: the argument when given, otherwise the env
 * default or the user's pick. Returns the elicitation's own response when the
 * user could not pick one — hand it back as the tool result.
 */
export async function resolveProject(server: McpServer, connection: WebApi, project: string | undefined, message = "Select the Azure DevOps project."): Promise<{ project: string } | ElicitResponse> {
  if (project) {
    return { project };
  }
  const result = await elicitProject(server, connection, message);
  return "response" in result ? result : { project: result.resolved };
}
```

У `test/src/elicitations.test.ts` додати три тести: аргумент повертається без виклику `getCoreApi`; при `process.env.ado_mcp_project = "P"` повертається `{ project: "P" }`; коли `getProjects` дає `[]`, повертається `{ response: … "No projects found to select from." }`.

- [ ] **Крок 4: спільні параметри в `common-params.ts`**

- Прибрати опис із «голих» схем: `optionalProject = z.string().optional()`, `requiredProject = z.string()`, так само `optionalTeam` і `requiredTeam`.
- Білдери `…With(note)` описуються лише нотаткою: `z.string().optional().describe(note)`.
- Константи `PROJECT_DESCRIPTION` і `TEAM_DESCRIPTION` видалити.
- Оновити коментар у шапці файлу: опис прибрано зовсім, бо «project name or ID» повторювалося 342 рази (~4k токенів), а що це назва або ID, тепер один раз каже `instructions`.

Дописати:

```ts
/** `processId` of the witprocess_ tools. */
export const processIdParam = z.string().describe("The ID (GUID) of the process.");

/** `witRefName` — a work item type inside a process. */
export const witRefNameParam = z.string().describe("The reference name of the work item type, e.g. 'MyProcess.Bug'.");

/** An opaque paging token handed back by the previous page. */
export const continuationTokenParam = z.string().optional().describe("Continuation token from a previous response, to fetch the next page.");
```

У `src/shared/server-instructions.ts` рядок Conventions замінити на:

```ts
    '- Most tools take an optional "project" (a project name or ID) and sometimes "team" (a team name or ID). Omit it and the server falls back to its configured default or asks the user — do not invent a project name.',
```

Оновити `test/src/common-params.test.ts` і `test/src/server-instructions.test.ts` під нові тексти. Тест, що забороняє рукописні копії опису `project`, лишити. Якщо він шукає старе речення, додатково заборонити `z.string().optional().describe("Azure DevOps project name or ID.")`.

- [ ] **Крок 5: компактний JSON у спільних місцях**

- `src/shared/content-safety.ts:34`: `JSON.stringify(data, null, 2)` → `JSON.stringify(data)`.
- `src/resources.ts:143`: так само.
- Тести `content-safety.test.ts:119,128,146`, `tools-content-safety.test.ts` і `resources.test.ts`: очікування з `, null, 2)` замінити на компактні.

- [ ] **Крок 6: перевірка й коміт**

```bash
npx tsc --noEmit
npx jest test/src --coverage=false --testPathIgnorePatterns test/src/tools
npx eslint src/shared src/resources.ts test/src/*.ts
npx prettier --write src/shared/tool-results.ts src/shared/common-params.ts src/shared/elicitations.ts src/shared/content-safety.ts src/resources.ts src/shared/server-instructions.ts jest.config.cjs test/src/*.ts
git add src/shared src/resources.ts jest.config.cjs test/src/*.ts
git commit -m "refactor(shared): jsonResult, toolError, resolveProject і спільні параметри для модулів інструментів"
```

Тести в `test/src/tools` на цій гілці можуть падати через тексти `project`. Це очікувано, їх лагодять завдання 5–9. Перелічити такі падіння у звіті: `npx jest test/src/tools --coverage=false 2>&1 | grep "✕" | head -50`.

---

### Завдання 5–9: зрізи модулів інструментів E1–E5 (PR-4, хвиля 2)

Усі п'ять агентів виконують ту саму процедуру, кожен над своїм зрізом. Файли зрізів не перетинаються.

| Завд. | Зріз | Гілка               | `src/tools/*.ts`                                                                                                                                                                                                                                                                       | `test/src/tools/*.test.ts`                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ---- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5     | E1   | `refactor/tools-e1` | `repositories`, `search`                                                                                                                                                                                                                                                               | `repositories`, `repositories-git`, `repositories-org-pull-requests`, `search`                                                                                                                                                                                                                                                                                                     |
| 6     | E2   | `refactor/tools-e2` | `work-items`                                                                                                                                                                                                                                                                           | `work-items`, `work-items-fields-reactions`                                                                                                                                                                                                                                                                                                                                        |
| 7     | E3   | `refactor/tools-e3` | `work`, `wiki`, `dashboards`, `core`, `project-analysis`                                                                                                                                                                                                                               | `work`, `wiki`, `wiki-admin`, `dashboards`, `core`, `project-analysis`                                                                                                                                                                                                                                                                                                             |
| 8     | E4   | `refactor/tools-e4` | `pipelines`, `task-agent`, `test-plans`, `test-results`, `release`, `policy`, `approvals`                                                                                                                                                                                              | `pipelines`, `pipelines-admin`, `task-agent`, `task-agent-admin`, `test-plan`, `test-plan-admin`, `test-results`, `release`, `policy`, `approvals`                                                                                                                                                                                                                                 |
| 9     | E5   | `refactor/tools-e5` | `wit-process`, `artifacts`, `advanced-security`, `member-entitlement`, `graph`, `service-endpoint`, `service-hooks`, `permissions`, `security-roles`, `notification`, `audit`, `extensions`, `feature-management`, `gallery`, `profile`, `operations`, `analytics`, `auth`, `mcp-apps` | `wit-process`, `wit-process-layout`, `artifacts`, `artifacts-management`, `advanced-security`, `advanced-security-admin`, `member-entitlement`, `graph`, `hooks-endpoints-graph-admin`, `service-endpoint`, `service-hooks`, `permissions`, `security-roles`, `notification`, `audit`, `extensions`, `feature-management`, `gallery`, `profile`, `operations`, `analytics`, `auth` |

**Гілка:** `git checkout -b refactor/tools-eN refactor/foundation` (N — номер зрізу).

**Інтерфейси:** використовує лише надане завданням 4 (див. блок «Інтерфейси» там). Нових спільних модулів не створювати. Файли поза своїм зрізом не чіпати: якщо щось потрібно змінити там, написати про це у звіті.

- [ ] **Крок 1: базова лінія**

```bash
npm ci --ignore-scripts
for f in <свої src/tools файли>; do printf "%s null2=%s unknown=%s string=%s\n" $f $(grep -c "null, 2)" src/tools/$f.ts) $(grep -c '"Unknown error occurred"' src/tools/$f.ts) $(grep -c ": String(error)" src/tools/$f.ts); done
npx jest <свої тестові файли> --coverage=false 2>&1 | tail -5
```

Записати цифри для звіту. Падіння, спричинені фундаментом (тексти `project`), лагодяться на кроці 4.

- [ ] **Крок 2: механічні заміни у кожному файлі зрізу**

1. Імпорт: `import { errorMessage, jsonResult, toolError } from "../shared/tool-results.js";`. Лишити тільки ті імена, які реально використовуються, бо ESLint падає на невикористаних.
2. Catch-блок стандартної форми

   ```ts
   } catch (error) {
     const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
     return { content: [{ type: "text", text: `Error fetching project teams: ${errorMessage}` }], isError: true };
   }
   ```

   (також з `: String(error)` або `"Unknown error"`) замінити на

   ```ts
   } catch (error) {
     return toolError("fetching project teams", error);
   }
   ```

   `action` — це дослівно текст між `Error ` і `: ` в оригіналі.

3. Catch-блоки іншої форми, де текст не `Error <action>: <msg>` (наприклад, `Failed to …`): не переписувати, лише вираз `error instanceof Error ? error.message : …` замінити на `errorMessage(error)`.
4. Локальні хелпери `ok`/`json` (`JSON.stringify(value, null, 2)`) і `failed`/`failure` видалити. Виклики `ok(x)`/`json(x)` → `jsonResult(x)`, `failed(a, e)`/`failure(a, e)` → `toolError(a, e)`. Місця: `pipelines.ts:910-914`, `test-results.ts:186-190`, `wit-process.ts:1003-1004`, `task-agent.ts:422`, `repositories.ts:2555`, `test-plans.ts:650`, `work-items.ts:2709-2713`.
5. `return { content: [{ type: "text", text: JSON.stringify(X, null, 2) }] };` → `return jsonResult(X);`. Інші `JSON.stringify(X, null, 2)` у тексті відповіді → `JSON.stringify(X)`.
6. Локальний `const resolveProject = async (connection, project) => …` (у `policy.ts:29`, `project-analysis.ts:26`, `release.ts:38`, `test-results.ts:51`, `task-agent.ts:82`) видалити. Виклики `resolveProject(connection, project)` → `resolveProject(server, connection, project)` з імпортом із `../shared/elicitations.js`.
7. Спільні параметри:
   - `processId: z.string().describe("The ID (GUID) of the process.")` або `"The ID of the (inherited) process."` → `processIdParam`;
   - `witRefName: z.string().describe("The reference name of the work item type…")` → `witRefNameParam`;
   - `continuationToken`, що означає непрозорий токен попередньої відповіді → `continuationTokenParam`. Параметри з іншою семантикою не чіпати, наприклад «The last branch name of the previous page».
8. Тільки E5, `member-entitlement.ts`: `memberEntitlementBaseUrl(url)` → `subdomainBaseUrl(url, "vsaex")`. Тіло `memberEntitlementFetch` звести до `adoFetch({ url: \`${subdomainBaseUrl(connection.serverUrl, "vsaex")}/_apis/${pathAndQuery}\`, method, token: accessToken, userAgent: userAgentProvider(), body, contentType })`. Імпорт з `../shared/ado-rest.js`. Сигнатуру `memberEntitlementFetch` не міняти.

Локальні обгортки над `adoFetch` (`request`, `call`, `send`) **не чіпати**: на префікси їхніх маршрутів спирається `scripts/api-coverage.mjs` (`REST_PREFIXES`).

- [ ] **Крок 3: контроль залишків**

```bash
for f in <свої src/tools файли>; do printf "%s null2=%s instanceof=%s\n" $f $(grep -c "null, 2)" src/tools/$f.ts) $(grep -c "error instanceof Error ?" src/tools/$f.ts); done
```

Очікувано: `null2=0`. `instanceof` лишається лише там, де це не форма «повідомлення помилки»; кожен такий випадок пояснити у звіті.

- [ ] **Крок 4: тести зрізу**

- Очікування з `JSON.stringify(x, null, 2)` → `JSON.stringify(x)` (sed по своїх тестових файлах, потім перечитати diff).
- Де тест кидав не-`Error` і не рядок і очікував `String(error)` (наприклад, `[object Object]`), тепер очікувати `Unknown error occurred`.
- Очікування опису `project` ("Azure DevOps project name or ID.") прибрати або замінити на нову нотатку.

```bash
npx tsc --noEmit
npx jest <свої тестові файли> --coverage=false
npx jest <свої тестові файли> --coverage --collectCoverageFrom='src/tools/<файл>.ts'   # покриття файлу не має впасти помітно нижче базової лінії
npx eslint <свої src і test файли>
npm run build && node scripts/build-validate-tools.js
```

Очікувано: усе зелене.

- [ ] **Крок 5: коміти (по коміту на кожен src-файл зрізу разом з його тестами)**

```bash
npx prettier --write src/tools/<файл>.ts test/src/tools/<його тести>.test.ts
git add src/tools/<файл>.ts test/src/tools/<його тести>.test.ts
git commit -m "refactor(<домен>): спільні toolError/jsonResult, компактний JSON у відповідях"
```

**У звіті:** рядки до й після (`git diff --stat refactor/foundation`), залишки з кроку 3, файли поза зрізом, які варто змінити.

---

### Завдання 10: інтеграція (координатор, основна сесія)

- [ ] **Рев'ю кожної гілки.** `git diff main...<гілка>` (для E-зрізів `refactor/foundation...<гілка>`). Перевірити, що тексти помилок не змінилися, у diff немає чужих файлів і тести не послаблені. Для завдань 1 і 2 додатково запустити навичку `code-review` на гілці.
- [ ] **Зібрати PR-4.**

  ```bash
  git checkout -b refactor/tool-responses refactor/foundation
  for n in 1 2 3 4 5; do git merge --no-ff refactor/tools-e$n -m "merge: зріз інструментів E$n"; done
  ```

- [ ] **Повна перевірка кожної з чотирьох гілок:** `npm ci --ignore-scripts && npm run build && node scripts/build-validate-tools.js && npx jest --coverage && npm run toolset-check && npm run eslint && npm run format-check`. На PR-4 спершу виконати `npm run toolset` і закомітити оновлений `docs/TOOLSET.md`.
- [ ] **Документація.** Кожна правка йде в гілку свого PR:
  - PR-1: `CLAUDE.md`, розділ «Tools and domains».
  - PR-2: цифри токенів у `CLAUDE.md` і `deploy/azure/README.md:153-161`; `TODO.md:11` і прибрати `TODO.md:70`.
  - PR-3: у `CLAUDE.md` оновити Commands і рядок про CI.
  - PR-4: у `CLAUDE.md` оновити bullet про `common-params.ts` (додати `processIdParam`, `witRefNameParam`, `continuationTokenParam`) і додати bullet про `tool-results.ts`: хендлери повертають `jsonResult`/`toolError`, а не будують відповіді вручну.
- [ ] **Push і PR.** Завжди з `--repo DL-Solution/azure-devops-mcp`. Порядок злиття: PR-3 → PR-1 → PR-2 → PR-4. Перед злиттям кожного наступного — rebase на `main`. Після PR-4 перезаміряти токени (завдання 2, крок 6) і, якщо цифри змінились, окремим комітом оновити таблицю в `deploy/azure/README.md`.
- [ ] **Після деплою:** на проді перевірити в Log Analytics, що `durationMs` у рядках `tool_call` помітно впав (запити з `docs/USAGE-STATS.md`).

## Запуск агентів (для координатора)

Хвиля 1 — одне повідомлення з чотирма викликами `Agent`: `isolation: "worktree"`, `run_in_background: true`, `subagent_type: "general-purpose"`. Промпт кожного:

> Виконай «Завдання N» з плану `/home/genius/develop/azure-devops-mcp/docs/superpowers/plans/2026-09-18-optimizations.md`. Спершу прочитай розділи «Глобальні обмеження» і «Робоче середовище агента». Працюй лише у своєму worktree і лише над файлами свого завдання. Не пуш і не відкривай PR. Наприкінці дай звіт у форматі з «Робочого середовища агента».

Хвиля 2 — щойно завдання 4 повідомило про коміт: п'ять викликів `Agent` в одному повідомленні з тим самим промптом для завдань 5–9. Гілку-основу `refactor/foundation` агенти бачать у спільному сховищі git.

Хвиля 3 — завдання 10 у основній сесії.

## Свідомо поза планом

- Прибирання `additionalProperties:false`: ламає строгі клієнти.
- Кешування `McpServer` між HTTP-запитами: ~17 мс CPU на запит не варті втрати stateless-ізоляції.
- Лінивий імпорт `@azure/identity` та інших для старту stdio (−0.3 с одноразово).
- Кеш Docker-шарів у `deploy-aca.yml`: деплої рідкісні, а раннери ефемерні.
- Уніфікація `repositoryId`, `top`, `skip`: типи й дефолти різняться між інструментами, виграш ~2k токенів не вартий ризику.
- Злиття локальних REST-обгорток в одну: від їхніх префіксів залежить `scripts/api-coverage.mjs`.

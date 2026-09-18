# Статистика використання інструментів

Сервер пише в лог один рядок на кожен виклик інструмента, щоб було видно, які інструменти потрібні, хто ними користується і чому ними не користуються. Код — [src/shared/usage-stats.ts](../src/shared/usage-stats.ts). Розгорнутий сервер пише лог у stderr, а Container Apps передає його в Log Analytics (`ado-mcp-logs`), тож окремої інфраструктури не потрібно. Лог зберігається 90 днів ([deploy/azure/main.bicep](../deploy/azure/main.bicep)).

## Що записується

**`tool_call`** — кожен виклик `tools/call`, також і ті, що SDK відхилив ще до обробника:

| Поле         | Значення                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool`       | назва інструмента, як її надіслав клієнт                                                                                                                       |
| `endpoint`   | шлях, через який прийшов виклик: `/mcp`, `/mcp/dev`, `/mcp/plan`, `/mcp/ops`, `/mcp/admin`; для локального stdio — `stdio`                                     |
| `outcome`    | `ok`; `error` — інструмент повернув помилку або впав; `invalid_args` — аргументи не пройшли схему; `unknown_tool` — такого інструмента на цьому endpoint немає |
| `durationMs` | тривалість виклику                                                                                                                                             |
| `argNames`   | **назви** переданих аргументів, відсортовані; значень немає                                                                                                    |
| `client`     | заголовок `User-Agent`                                                                                                                                         |
| `userId`     | `oid` з токена — Entra object id людини чи service principal                                                                                                   |
| `user`       | ім'я входу (`upn`, інакше `preferred_username` / `unique_name` / `email`), для токена застосунку — його `appid`                                                |

**`tool_catalog`** — при старті HTTP-сервера по рядку на кожен увімкнений домен: `domain` і `tools` (усі його інструменти). З цього рахується, що не викликалось жодного разу.

Значення аргументів, відповіді інструментів і сам токен не записуються. Ідентичність читається з JWT-токена без перевірки підпису: в OAuth-режимі токен уже перевірено, у passthrough підроблений токен відхилить Azure DevOps на першому ж запиті. PAT, переданий як bearer, ідентичності не має — `user` і `userId` порожні.

Ім'я користувача — персональні дані. Доступ до них має той, хто може читати workspace `ado-mcp-logs` (роль Log Analytics Reader або вища на ресурсній групі).

## Запити

Log Analytics → `ado-mcp-logs` → Logs. Кожен запит починається з однакової вибірки викликів; її можна зберегти як функцію `McpToolCalls` і далі писати `McpToolCalls | ...`.

```kusto
let calls = ContainerAppConsoleLogs_CL
    | where ContainerAppName_s == "ado-mcp"
    | extend e = parse_json(Log_s)
    | where tostring(e.message) == "tool_call"
    | project TimeGenerated, tool = tostring(e.tool), area = tostring(split(tostring(e.tool), "_")[0]), endpoint = tostring(e.endpoint),
        outcome = tostring(e.outcome), durationMs = toint(e.durationMs), user = tostring(e.user), userId = tostring(e.userId),
        client = tostring(e.client), argNames = e.argNames;
```

### Найуживаніші інструменти

```kusto
calls
| where TimeGenerated > ago(30d)
| summarize calls = count(), users = dcount(userId), failed = countif(outcome != "ok") by tool
| order by calls desc
```

### Жодного виклику за період

Кандидати на прибирання з пресетів або на переписування опису. Руйнівні й адміністративні інструменти (`delete_*`, `destroy_*`, `core_create_project`) викликаються рідко за своєю природою — їх варто відкладати, а не прибирати.

```kusto
let catalog = ContainerAppConsoleLogs_CL
    | where ContainerAppName_s == "ado-mcp"
    | extend e = parse_json(Log_s)
    | where tostring(e.message) == "tool_catalog"
    | extend domain = tostring(e.domain)
    | summarize arg_max(TimeGenerated, e) by domain
    | mv-expand tool = e.tools
    | project domain, tool = tostring(tool);
catalog
| join kind=leftanti (calls | where TimeGenerated > ago(90d) | distinct tool) on tool
| order by domain asc, tool asc
```

Для кожного домену береться найсвіжіший каталог — сервер пише його при кожному старті, зокрема після cold start (`minReplicas: 0`), тож прибрані інструменти зі звіту зникають.

### Чому не працює: помилки й невалідні аргументи

Висока частка `invalid_args` означає, що модель не розуміє схему — треба уточнити опис параметра. Висока частка `error` — здебільшого права або api-version.

```kusto
calls
| where TimeGenerated > ago(30d)
| summarize calls = count(), error = countif(outcome == "error"), invalid_args = countif(outcome == "invalid_args") by tool
| extend failedPct = round(100.0 * (error + invalid_args) / calls, 1)
| where error + invalid_args > 0
| order by failedPct desc, calls desc
```

Деталі помилки (текст від Azure DevOps) лежать поруч у рядках `Tool returned error result` з тим самим `tool`.

Невідомі назви (`unknown_tool`) показують, що модель шукала інструмент, якого на цьому endpoint немає — часто це ознака, що він потрібен у пресеті:

```kusto
calls
| where outcome == "unknown_tool"
| summarize calls = count(), users = dcount(userId) by endpoint, tool
| order by calls desc
```

### Хто чим користується

```kusto
calls
| where TimeGenerated > ago(30d)
| summarize calls = count(), tools = dcount(tool), areas = make_set(area), endpoints = make_set(endpoint), lastSeen = max(TimeGenerated) by user
| order by calls desc
```

Активність за ролями. Ролі в токені немає, тож відповідність «людина → роль» задається в запиті (або в watchlist Sentinel). Без неї роль видно побічно — з endpoint (пресета), через який людина підключилась.

```kusto
let roles = datatable(user: string, role: string) [
    "someone@example.com", "developer",
    "manager@example.com", "planning",
];
calls
| where TimeGenerated > ago(30d)
| lookup kind=leftouter roles on user
| extend role = coalesce(role, strcat("endpoint:", endpoint))
| summarize calls = count(), users = dcount(userId) by role, area
| order by role asc, calls desc
```

### Чи правильно нарізані пресети

Інструменти, які через повний `/mcp` викликають люди, що користуються й пресетами, — кандидати на додавання в пресет:

```kusto
let presetUsers = calls | where endpoint startswith "/mcp/" | distinct userId;
calls
| where TimeGenerated > ago(30d) and endpoint == "/mcp" and userId in (presetUsers)
| summarize calls = count(), users = dcount(userId) by tool
| order by calls desc
```

### Повільні інструменти

```kusto
calls
| where TimeGenerated > ago(30d)
| summarize calls = count(), p50 = percentile(durationMs, 50), p95 = percentile(durationMs, 95) by tool
| where calls >= 5
| order by p95 desc
```

### Послідовності «A, одразу за ним B»

Якщо після одного інструмента модель майже завжди викликає інший, опис першого, ймовірно, вводить в оману, або ці два можна об'єднати.

```kusto
calls
| where TimeGenerated > ago(30d) and isnotempty(userId)
| order by userId asc, TimeGenerated asc
| extend prevTool = prev(tool), prevUser = prev(userId), prevTime = prev(TimeGenerated)
| where userId == prevUser and TimeGenerated - prevTime < 1m and prevTool != tool
| summarize times = count(), users = dcount(userId) by prevTool, tool
| order by times desc
| take 30
```

### Клієнти

```kusto
calls
| where TimeGenerated > ago(30d)
| summarize calls = count(), users = dcount(userId) by client, endpoint
| order by calls desc
```

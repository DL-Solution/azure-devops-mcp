# TODO — Azure DevOps MCP

Складено 2026-09-17 для наступної сесії; оновлено того ж дня після PR #71–#90.

## Звідки стартуємо

|             |                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Прод        | ACA-ревізія `ado-mcp--0000079`, образ `919dae4` (PR #92), стан Running; на `/` — коренева сторінка з інструкцією підключення                                  |
| Версія      | 3.0.0                                                                                                                                                         |
| Інструменти | 630 у 33 доменах; схеми `/mcp` ≈117k токенів, пресети 24–50k ([deploy/azure/README.md](deploy/azure/README.md#tool-presets-a-smaller-tool-list-per-endpoint)) |
| Тести       | 2371, покриття 92.8 / 85.6 / 97.5 / 94.0                                                                                                                      |
| REST API    | покрито 654 з 1024 операцій потрібних областей (64%) — [docs/API-COVERAGE.md](docs/API-COVERAGE.md)                                                           |
| Upstream    | переглянуто до `aacff1e` ([docs/UPSTREAM-SYNC.md](docs/UPSTREAM-SYNC.md)), нерозібраних комітів немає                                                         |
| Пошук       | код знаходиться (`infoCode 0`); пошук робочих елементів 2026-09-18 досі `infoCode 6`, wiki працює                                                             |

Покриття REST API й план доповнень — [docs/API-COVERAGE.md](docs/API-COVERAGE.md) (`npm run api-coverage`).

## 1. Пошук на dl-sol — почати з цього

- [x] Повторно перевірити пошук: 11:05 UTC код і робочі елементи досі `count 0, infoCode 6`.
- [x] Код-пошук запрацював (перевірено 16:30 UTC).
- [ ] Якщо пошук робочих елементів і далі `infoCode: 6` — відкрити запит у підтримку Microsoft. `infoCode 6` = «Account is being onboarded».
- [x] Змінити `search_code`, `search_wiki`, `search_workitem`: ненульовий `infoCode` описувати словами — PR #71.

## Далі

- [x] Статистика викликів інструментів — PR #92: рядки `tool_call` і `tool_catalog` у Log Analytics (зберігання 90 днів), запити в [docs/USAGE-STATS.md](docs/USAGE-STATS.md). Працює на проді з 2026-09-18.
- [ ] Близько 2026-10-02: перший звіт за статистикою — топ інструментів, невикористані, частка `invalid_args`, активність за ролями. Заповнити таблицю «email → роль» у запиті.
- [ ] Близько 2026-12-18 (квартал даних): рішення, що прибрати з пресетів і які описи переписати.
- [x] Upstream #1600 і #1606 — портовано: `repo_list_pull_requests_by_org` і уточнений опис `top` у `wiki_list_pages`; маркер у [docs/UPSTREAM-SYNC.md](docs/UPSTREAM-SYNC.md) пересунуто на `aacff1e`.
- [ ] Переглянути **testResults** (85 непокритих операцій) — останній відкритий пункт плану в [docs/API-COVERAGE.md](docs/API-COVERAGE.md).
- [x] Доповнення REST API за планом: Artifacts, Git, робочі елементи, збірки, агенти й середовища, тест-плани, погодження, service hooks/connections/graph, Advanced Security, Wiki — PR #81–#90.

## 2. Git (покриття ~25%)

- [x] Cherry-pick і revert для pull request — PR #73.
- [x] Статуси на самому PR — зовнішні перевірки для політик — PR #73.
- [x] Відновлення видаленого репозиторію з кошика — PR #73.
- [x] Блокування гілок — PR #73.

## 3. Pipelines (покриття ~24%)

- [x] Створення й редагування визначень збірки — PR #74.
- [x] Retention leases — утримання збірок від видалення — PR #74.
- [x] Папки пайплайнів — PR #74.

## 4. Робочі елементи й процеси

- [x] Створення полів на рівні організації — PR #77.
- [x] Реакції на коментарі — PR #77.
- [x] Розмітка форм у кастомізації процесів (~13 інструментів) — PR #77.
- [x] Створення групових ліцензійних правил — PR #77.

## 5. Технічна перевірка

- [x] `.github/workflows/version-update.yml` справді нічого не робив — видалено в PR #72.

## Потребує рішення або доступу

- [ ] **Власник підписки:** дати CI-ідентичності роль RBAC Administrator на реєстр і storage, щоб Bicep працював з `assignAcrPullRole=true` і `assignTableRole=true`.
- [ ] **GitHub:** увімкнути Issues — тоді `Upstream watch` вестиме одне issue замість червоних запусків.
- [x] **claude.ai:** конектори на пресети `…/mcp/dev`, `…/mcp/plan`, `…/mcp/ops`, `…/mcp/admin` додано (2026-09-17).

## Свідомо відкладено

- Класичні релізи (покриття ~11%) і TFVC (~12%) — застарілі механізми.
- Upstream #1360 (`repo_search_commits` на Search API) — на dl-sol Search API не знаходив комітів, які є в Git API.
- Upstream #1538 (MSAL broker) — для Windows/macOS, сервер працює на Linux і ACA.

## Нагадування

- Команди `gh`, що пишуть, запускати з `--repo DL-Solution/azure-devops-mcp`: через remote `upstream` один PR уже потрапив у microsoft/azure-devops-mcp.
- Після зміни інструментів: `npm run build && npm run toolset` — інакше CI впаде на `toolset-check`.

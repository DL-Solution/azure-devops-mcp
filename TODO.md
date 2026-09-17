# TODO — Azure DevOps MCP

Складено 2026-09-17 для наступної сесії; оновлено того ж дня після PR #71–#90.

## Звідки стартуємо

|             |                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Прод        | ACA-ревізія `ado-mcp--0000077`, образ `4c6747b` (PR #90), стан Running; на `/` — коренева сторінка з інструкцією підключення                                  |
| Версія      | 3.0.0                                                                                                                                                         |
| Інструменти | 620 у 33 доменах; схеми `/mcp` ≈136k токенів, пресети 27–55k ([deploy/azure/README.md](deploy/azure/README.md#tool-presets-a-smaller-tool-list-per-endpoint)) |
| Тести       | 2283, покриття 91.0 / 76.0 / 97.6 / 92.0                                                                                                                      |
| REST API    | покрито 654 з 1024 операцій потрібних областей (64%) — [docs/API-COVERAGE.md](docs/API-COVERAGE.md)                                                           |
| Upstream    | переглянуто до `e24cc98` ([docs/UPSTREAM-SYNC.md](docs/UPSTREAM-SYNC.md)); після нього upstream має 2 коміти (#1600, #1606) — чекають розбору                 |
| Пошук       | о 16:30 UTC код знаходиться (`infoCode 0`), робочі елементи досі `infoCode 6`, wiki працює                                                                    |

Покриття REST API й план доповнень — [docs/API-COVERAGE.md](docs/API-COVERAGE.md) (`npm run api-coverage`).

## 1. Пошук на dl-sol — почати з цього

- [x] Повторно перевірити пошук: 11:05 UTC код і робочі елементи досі `count 0, infoCode 6`.
- [x] Код-пошук запрацював (перевірено 16:30 UTC).
- [ ] Якщо пошук робочих елементів і далі `infoCode: 6` — відкрити запит у підтримку Microsoft. `infoCode 6` = «Account is being onboarded».
- [x] Змінити `search_code`, `search_wiki`, `search_workitem`: ненульовий `infoCode` описувати словами — PR #71.

## Далі

- [ ] Розібрати upstream #1600 (організаційний список pull request з фільтрами) і #1606 (опис максимуму сторінок у `wiki_list_pages`), записати рішення в [docs/UPSTREAM-SYNC.md](docs/UPSTREAM-SYNC.md).
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
- Поле `$schema` у схемах (~4.8k токенів на запит) — додає MCP SDK, питання до SDK.

## Нагадування

- Команди `gh`, що пишуть, запускати з `--repo DL-Solution/azure-devops-mcp`: через remote `upstream` один PR уже потрапив у microsoft/azure-devops-mcp.
- Після зміни інструментів: `npm run build && npm run toolset` — інакше CI впаде на `toolset-check`.

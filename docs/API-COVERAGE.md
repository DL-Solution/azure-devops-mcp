# Покриття Azure DevOps REST API

Скільки документованих операцій Azure DevOps REST API викликають інструменти сервера. Згенеровано `npm run api-coverage` ([scripts/api-coverage.mjs](../scripts/api-coverage.mjs)); таблиці перезаписуються при кожному запуску, план і примітки в таблиці прогресу зберігаються.

Еталон — [MicrosoftDocs/vsts-rest-api-specs](https://github.com/MicrosoftDocs/vsts-rest-api-specs) `c7e66d9` (2026-09-02), найновіша версія 7.x кожної області. Операція вважається покритою, якщо модуль інструментів викликає її через `azure-devops-node-api` або прямим REST-запитом. Обидва способи визначаються статичним аналізом коду, тож цифри близькі, а не точні; нерозпізнане перелічено наприкінці.

## Підсумок

|                       | Операцій | Покрито |   % |
| --------------------- | -------: | ------: | --: |
| Потрібні області      |     1024 |     530 | 52% |
| Свідомо не покриваємо |      167 |      23 |   — |

## Прогрес

Новий рядок додається, коли змінюється кількість інструментів або покритих операцій. Стовпець «Примітка» — ручний.

<!-- history:start -->

| Дата       | Інструментів | Покрито операцій |    З |   % | Примітка                       |
| ---------- | -----------: | ---------------: | ---: | --: | ------------------------------ |
| 2026-09-17 |          420 |              398 | 1024 | 39% | перший замір, після PR #71–#79 |
| 2026-09-17 |          450 |              469 | 1024 | 46% | Artifacts, PR #81              |
| 2026-09-17 |          474 |              495 | 1024 | 48% | Git, PR #82                    |
| 2026-09-17 |          487 |              509 | 1024 | 50% | Робочі елементи, PR #83        |
| 2026-09-17 |          505 |              530 | 1024 | 52% | Збірки, PR #84                 |

<!-- history:end -->

## План

Редагується вручну; генератор його не чіпає.

<!-- plan:start -->

Порядок — за домовленістю; «Операцій» — скільки непокритих операцій закриває пункт приблизно.

- [x] **Artifacts** (~40 з 110) — PR #81: +68 операцій; лишилися пакетні (batch) операції, завантаження вмісту, scoped npm у кошику й відстеження змін фідів: фіди — зміна, видалення, кошик, права, views, retention; пакети й версії, provenance; просування версії у view, unlist, видалення й відновлення версій (один інструмент на всі протоколи)
- [x] **Git** (~25 з 66) — PR #82: +26 операцій; лишилися blobs і trees, батч-операції, вкладення й властивості PR, merges, обрані refs, окремі get-и: порівняння комітів, окремий коміт, пуші; конфлікти й коміти PR; зміна репозиторію, імпорт, форки
- [x] **Робочі елементи** (~10 з 39) — PR #83: +13 операцій; лишилися reporting-API (його перекриває Analytics), іконки, тимчасові запити, розсилка пошти, GitHub connections: видалення коментаря й версії коментарів, зміна й видалення поля, історія змін
- [x] **Збірки** (~15 з 65) — PR #84: +21 операція; лишилися source providers (GitHub/Bitbucket), шаблони визначень, властивості, бейджі, контролери XAML, вкладення, пакетні оновлення: видалення збірки, видалення й відновлення визначення, теги визначень, YAML визначення, дозволи на ресурси, налаштування retention
- [ ] **Агенти й середовища** (~20 з 67): пули й черги, черга запитів до агентів, deployment groups, завантаження secure files, ресурси середовищ
- [ ] **Тест-плани** (~20 з 31): зміна й видалення планів і сьютів, конфігурації, змінні, клонування
- [ ] **Погодження й перевірки** (~10 з 12): конфігурації перевірок, дозволи пайплайнів на ресурси
- [ ] **Service hooks, service connections, graph** (~25): решта операцій підписок і підключень, service principals
- [ ] **Advanced Security** (~15 з 27): стан увімкнення, зведення, оновлення алертів
- [ ] **Wiki** (5): зміна й видалення wiki, вкладення, переміщення сторінок, статистика переглядів
- [ ] Переглянути **testResults** (85): більшість — службові операції log store і вкладень; відібрати корисне

<!-- plan:end -->

## За областями

Спершу потрібні області — від найбільшої кількості непокритих операцій, далі ті, що свідомо не покриваємо.

| Область                                                    | Операцій | Покрито |    % | Непокрито | Примітка                                                     |
| ---------------------------------------------------------- | -------: | ------: | ---: | --------: | ------------------------------------------------------------ |
| Результати тестів (`testResults`)                          |       97 |      12 |  12% |        85 |                                                              |
| Агенти, змінні, task groups (`distributedTask`)            |       72 |      17 |  24% |        55 |                                                              |
| Збірки (`build`)                                           |       93 |      49 |  53% |        44 |                                                              |
| Git (`git`)                                                |      112 |      72 |  64% |        40 |                                                              |
| Тест-плани (`testPlan`)                                    |       44 |      12 |  27% |        32 |                                                              |
| Advanced Security (`advancedSecurity`)                     |       29 |       2 |   7% |        27 |                                                              |
| Artifacts: пакети за протоколами (`artifactsPackageTypes`) |       73 |      46 |  63% |        27 |                                                              |
| Робочі елементи (`wit`)                                    |       89 |      63 |  71% |        26 |                                                              |
| Користувачі й групи (`graph`)                              |       28 |       7 |  25% |        21 |                                                              |
| Service hooks (`hooks`)                                    |       22 |       4 |  18% |        18 |                                                              |
| Погодження й перевірки (`approvalsAndChecks`)              |       15 |       3 |  20% |        12 |                                                              |
| Середовища (`environments`)                                |       17 |       5 |  29% |        12 |                                                              |
| Обране (`favorite`)                                        |        9 |       0 |   0% |         9 |                                                              |
| Сповіщення (`notification`)                                |       17 |       8 |  47% |         9 |                                                              |
| Artifacts: фіди (`artifacts`)                              |       37 |      29 |  78% |         8 |                                                              |
| Service connections (`serviceEndpoint`)                    |       14 |       6 |  43% |         8 |                                                              |
| Аудит (`audit`)                                            |        9 |       2 |  22% |         7 |                                                              |
| Ліцензії (`memberEntitlementManagement`)                   |       21 |      14 |  67% |         7 |                                                              |
| Дошки й спринти (`work`)                                   |       59 |      52 |  88% |         7 |                                                              |
| Проєкти й команди (`core`)                                 |       19 |      13 |  68% |         6 |                                                              |
| Дашборди (`dashboard`)                                     |       16 |      11 |  69% |         5 |                                                              |
| Імпорт/експорт процесів (`processadmin`)                   |        5 |       0 |   0% |         5 |                                                              |
| Wiki (`wiki`)                                              |       15 |      10 |  67% |         5 |                                                              |
| Звіти про права (`permissionsReport`)                      |        4 |       0 |   0% |         4 |                                                              |
| YAML-пайплайни (`pipelines`)                               |       10 |       6 |  60% |         4 |                                                              |
| Кастомізація процесів (`processes`)                        |       57 |      53 |  93% |         4 |                                                              |
| Пошук (`search`)                                           |        6 |       3 |  50% |         3 |                                                              |
| Розширення (`extensionManagement`)                         |        5 |       4 |  80% |         1 |                                                              |
| Профіль (`profile`)                                        |        1 |       0 |   0% |         1 |                                                              |
| Права доступу (`security`)                                 |        9 |       8 |  89% |         1 |                                                              |
| Ролі на ресурсах (`securityRoles`)                         |        7 |       6 |  86% |         1 |                                                              |
| Асинхронні операції (`operations`)                         |        1 |       1 | 100% |         0 |                                                              |
| Політики гілок (`policy`)                                  |       12 |      12 | 100% |         0 |                                                              |
| processDefinitions (`processDefinitions`)                  |       45 |       0 |    — |        45 | XML-процеси (лише 4.1) — замінені успадкованими процесами    |
| test (`test`)                                              |       40 |      13 |    — |        27 | старий Test API — перекритий testPlan і testResults          |
| release (`release`)                                        |       32 |       9 |    — |        23 | класичні релізи — застарілий механізм, свідомо відкладено    |
| tfvc (`tfvc`)                                              |       19 |       0 |    — |        19 | TFVC — застаріла система контролю версій, свідомо відкладено |
| symbol (`symbol`)                                          |       13 |       0 |    — |        13 | сервер символів налагодження                                 |
| tokens (`tokens`)                                          |        5 |       0 |    — |         5 | керування PAT — не для асистента                             |
| tokenAdmin (`tokenAdmin`)                                  |        3 |       0 |    — |         3 | адміністрування PAT — не для асистента                       |
| tokenAdministration (`tokenAdministration`)                |        3 |       0 |    — |         3 | адміністрування PAT — не для асистента                       |
| delegatedAuth (`delegatedAuth`)                            |        2 |       0 |    — |         2 | службове: делегована авторизація                             |
| resourceUsage (`resourceUsage`)                            |        2 |       0 |    — |         2 | службове: ліміти ресурсів                                    |
| account (`account`)                                        |        1 |       0 |    — |         1 | службове: список організацій облікового запису               |
| status (`status`)                                          |        1 |       0 |    — |         1 | стан сервісу Azure DevOps — не про організацію               |
| ims (`ims`)                                                |        1 |       1 |    — |         0 | службове: Identity Management                                |

## Непокриті операції

Лише потрібні області. Шлях — частина маршруту після `_apis/`.

<details>
<summary>Результати тестів — 85 з 97</summary>

| Група                      | Метод  | Шлях                                                                             | Що робить                                                                                                      |
| -------------------------- | ------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Attachments                | POST   | `testresults/runs/{runId}/attachments`                                           |                                                                                                                |
| Attachments                | DELETE | `testresults/runs/{runId}/attachments/{attachmentId}`                            |                                                                                                                |
| Attachments                | POST   | `testresults/runs/{runId}/results/{testCaseResultId}/attachments`                |                                                                                                                |
| Attachments                | GET    | `testresults/runs/{runId}/results/{testCaseResultId}/attachments`                | Returns attachment references for test sub result.                                                             |
| Attachments                | POST   | `testresults/runs/{runId}/results/{testCaseResultId}/attachments`                |                                                                                                                |
| Attachments                | POST   | `testresults/runs/{runId}/results/{testCaseResultId}/attachments`                |                                                                                                                |
| Attachments                | DELETE | `testresults/runs/{runId}/results/{testCaseResultId}/attachments/{attachmentId}` |                                                                                                                |
| Attachments                | GET    | `testresults/runs/{runId}/results/{testCaseResultId}/attachments/{attachmentId}` | Returns a test sub result attachment                                                                           |
| Attachments                | GET    | `testresults/runs/{runId}/results/{testCaseResultId}/attachments/{attachmentId}` | Returns a test iteration attachment                                                                            |
| Bugs                       | GET    | `testresults/runs/{runId}/results/{testCaseResultId}/bugs`                       |                                                                                                                |
| Codecoverage               | POST   | `testresults/codecoverage`                                                       | http://(tfsserver):8080/tfs/DefaultCollection/_apis/test/CodeCoverage?buildId=10 Request: Json of code covera… |
| Codecoverage               | GET    | `testresults/codecoverage/sourceview`                                            |                                                                                                                |
| Extensionfields            | GET    | `testresults/extensionfields`                                                    | Returns List of custom test fields for the given custom test field scope.                                      |
| Extensionfields            | POST   | `testresults/extensionfields`                                                    | Creates custom test fields based on the data provided.                                                         |
| Extensionfields            | PATCH  | `testresults/extensionfields`                                                    | Returns details of the custom test field which is updated.                                                     |
| Extensionfields            | DELETE | `testresults/extensionfields/{testExtensionFieldId}`                             | Returns details of the custom test field for the specified testExtensionFieldId.                               |
| Filecoverage               | POST   | `testresults/codecoverage/filecoverage`                                          | Get file coverage for the specified file                                                                       |
| History                    | POST   | `testresults/results/history`                                                    |                                                                                                                |
| Message Logs               | GET    | `testresults/runs/{runId}/messagelogs`                                           | Get test run message logs                                                                                      |
| Metrics                    | GET    | `testresults/metrics`                                                            | Get summary of test results.                                                                                   |
| Result Document            | POST   | `testresults/runs/{runId}/resultdocument`                                        |                                                                                                                |
| Result Meta Data           | POST   | `testresults/results/resultmetadata`                                             | Get list of test Result meta data details for corresponding testcasereferenceId                                |
| Result Meta Data           | PATCH  | `testresults/results/resultmetadata/{testCaseReferenceId}`                       | Update properties of test result meta data                                                                     |
| Result Trend By Build      | POST   | `testresults/resulttrendbybuild`                                                 |                                                                                                                |
| Result Trend By Release    | POST   | `testresults/resulttrendbyrelease`                                               |                                                                                                                |
| Resultdetailsbyrelease     | GET    | `testresults/resultdetailsbyrelease`                                             |                                                                                                                |
| Resultgroupsbybuild        | GET    | `testresults/resultgroupsbybuild`                                                |                                                                                                                |
| Resultgroupsbyrelease      | GET    | `testresults/resultgroupsbyrelease`                                              |                                                                                                                |
| Results                    | POST   | `testresults/results`                                                            |                                                                                                                |
| Results                    | POST   | `testresults/results/query`                                                      |                                                                                                                |
| Results                    | POST   | `testresults/runs/{runId}/results`                                               |                                                                                                                |
| Results                    | PATCH  | `testresults/runs/{runId}/results`                                               |                                                                                                                |
| Resultsbybuild             | GET    | `testresults/resultsbybuild`                                                     |                                                                                                                |
| Resultsbypipeline          | GET    | `testresults/resultsbypipeline`                                                  | Get a list of results.                                                                                         |
| Resultsbyrelease           | GET    | `testresults/resultsbyrelease`                                                   |                                                                                                                |
| Resultsgroup Details       | GET    | `testresults/resultsgroupdetails`                                                | Get all the available groups details and for these groups get failed and aborted results.                      |
| Resultsummarybybuild       | GET    | `testresults/resultsummarybybuild`                                               |                                                                                                                |
| Resultsummarybypipeline    | GET    | `testresults/resultsummarybypipeline`                                            | Get summary of test results.                                                                                   |
| Resultsummarybyrelease     | GET    | `testresults/resultsummarybyrelease`                                             |                                                                                                                |
| Resultsummarybyrelease     | POST   | `testresults/resultsummarybyrelease`                                             |                                                                                                                |
| Resultsummarybyrequirement | POST   | `testresults/resultsummarybyrequirement`                                         |                                                                                                                |
| Runs                       | POST   | `testresults/runs`                                                               |                                                                                                                |
| Runs                       | GET    | `testresults/runs`                                                               | Query Test Runs based on filters. Mandatory fields are minLastUpdatedDate and maxLastUpdatedDate.              |
| Runs                       | PATCH  | `testresults/runs/{runId}`                                                       |                                                                                                                |
| Runs                       | DELETE | `testresults/runs/{runId}`                                                       |                                                                                                                |
| Runsummary                 | GET    | `testresults/runs/{runId}/runsummary`                                            | Get test run summary, used when we want to get summary of a run by outcome. Test run should be in completed s… |
| Settings                   | GET    | `testresults/settings`                                                           | Get TestResultsSettings data                                                                                   |
| Settings                   | PATCH  | `testresults/settings`                                                           | Update project settings of test results                                                                        |
| Similar Test Results       | GET    | `testresults/runs/{runId}/results/{testResultId}/similartestresults`             | Gets the list of results whose failure matches with the provided one.                                          |
| Statistics                 | GET    | `testresults/runs/{runId}/statistics`                                            | Get test run statistics , used when we want to get summary of a run by outcome.                                |
| Status                     | GET    | `testresults/codecoverage/status/{definition}`                                   | <p>Gets the coverage status for the last successful build of a definition, optionally scoped to a specific br… |
| Tags                       | PATCH  | `testresults/runs/{runId}/tags`                                                  | Update tags of a run, Tags can be Added and Deleted                                                            |
| Tags                       | GET    | `testresults/tags`                                                               | Get all the tags in a build.                                                                                   |
| Tags                       | GET    | `testresults/tags`                                                               | Get all the tags in a release.                                                                                 |
| Tagsummary                 | GET    | `testresults/tagsummary`                                                         | Get all the tags in a build.                                                                                   |
| Tagsummary                 | GET    | `testresults/tagsummary`                                                         | Get all the tags in a release.                                                                                 |
| Test History               | POST   | `testresults/results/testhistory`                                                | Get history of a test method using TestHistoryQuery                                                            |
| Testai                     | GET    | `testresults/testai/completegithubauth`                                          | OAuth callback endpoint. GitHub redirects here after user authorizes. Exchanges the authorization code for to… |
| Testattachments            | GET    | `testresults/runs/{runId}/testattachments`                                       | Returns a list of attachments for the specified runId from the LogStore.                                       |
| Testattachments            | POST   | `testresults/runs/{runId}/testattachments`                                       | Creates an attachment in the LogStore for the specified runId.                                                 |
| Testattachments            | DELETE | `testresults/runs/{runId}/testattachments`                                       | Deletes the attachment with the specified filename for the specified runId from the LogStore.                  |
| Testattachments            | GET    | `testresults/runs/{runId}/testattachments`                                       | Returns the attachment with the specified filename for the specified runId from the LogStore.                  |
| Testattachments            | POST   | `testresults/uploadbuildattachments/{buildId}`                                   | Creates an attachment in the LogStore for the specified buildId.                                               |
| Testfailuretype            | GET    | `testresults/testfailuretype`                                                    | Returns the list of test failure types.                                                                        |
| Testfailuretype            | POST   | `testresults/testfailuretype`                                                    | Creates a new test failure type                                                                                |
| Testfailuretype            | DELETE | `testresults/testfailuretype/{failureTypeId}`                                    | Deletes a test failure type with specified failureTypeId                                                       |
| Testlog                    | GET    | `testresults/runs/{runId}/results/{resultId}/testlog`                            | Get list of test result attachments reference                                                                  |
| Testlog                    | GET    | `testresults/runs/{runId}/results/{resultId}/testlog`                            | Get list of test subresult attachments reference                                                               |
| Testlog                    | GET    | `testresults/runs/{runId}/testlog`                                               | Get list of test run attachments reference                                                                     |
| Testlog                    | GET    | `testresults/testlog`                                                            | Get list of build attachments reference                                                                        |
| Testlogstoreendpoint       | GET    | `testresults/runs/{runId}/results/{resultId}/testlogstoreendpoint`               | Get SAS Uri of a test results attachment                                                                       |
| Testlogstoreendpoint       | POST   | `testresults/runs/{runId}/results/{resultId}/testlogstoreendpoint`               | Create empty file for a result and Get Sas uri for the file                                                    |
| Testlogstoreendpoint       | GET    | `testresults/runs/{runId}/results/{resultId}/testlogstoreendpoint`               | Get SAS Uri of a test subresults attachment                                                                    |
| Testlogstoreendpoint       | GET    | `testresults/runs/{runId}/testlogstoreendpoint`                                  | Get SAS Uri of a test run attachment                                                                           |
| Testlogstoreendpoint       | POST   | `testresults/runs/{runId}/testlogstoreendpoint`                                  | Create empty file for a run and Get Sas uri for the file                                                       |
| Testlogstoreendpoint       | GET    | `testresults/testlogstoreendpoint`                                               | Get SAS Uri of a build attachment                                                                              |
| Testlogstoreendpoint       | POST   | `testresults/testlogstoreendpoint`                                               | Create and Get sas uri of the build container                                                                  |
| Testsettings               | GET    | `testresults/testsettings`                                                       |                                                                                                                |
| Testsettings               | POST   | `testresults/testsettings`                                                       |                                                                                                                |
| Testsettings               | DELETE | `testresults/testsettings`                                                       |                                                                                                                |
| Workitems                  | GET    | `testresults/results/workitems`                                                  | Query Test Result WorkItems based on filter                                                                    |
| Workitems                  | GET    | `testresults/runs/{runId}/results/{testCaseResultId}/workitems`                  |                                                                                                                |
| Workitems                  | POST   | `testresults/testmethods/workitems`                                              |                                                                                                                |
| Workitems                  | DELETE | `testresults/testmethods/workitems`                                              |                                                                                                                |
| Workitems                  | POST   | `testresults/testmethods/workitems`                                              |                                                                                                                |

</details>

<details>
<summary>Агенти, змінні, task groups — 55 з 72</summary>

| Група            | Метод  | Шлях                                                                           | Що робить                                                                                                      |
| ---------------- | ------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Agentclouds      | GET    | `distributedtask/agentclouds`                                                  |                                                                                                                |
| Agentclouds      | POST   | `distributedtask/agentclouds`                                                  |                                                                                                                |
| Agentclouds      | GET    | `distributedtask/agentclouds/{agentCloudId}`                                   |                                                                                                                |
| Agentclouds      | PATCH  | `distributedtask/agentclouds/{agentCloudId}`                                   |                                                                                                                |
| Agentclouds      | DELETE | `distributedtask/agentclouds/{agentCloudId}`                                   |                                                                                                                |
| Agentcloudtypes  | GET    | `distributedtask/agentcloudtypes`                                              | Get agent cloud types.                                                                                         |
| Agents           | POST   | `distributedtask/pools/{poolId}/agents`                                        | Adds an agent to a pool. You probably don't want to call this endpoint directly. Instead, [configure an agen…  |
| Agents           | PUT    | `distributedtask/pools/{poolId}/agents/{agentId}`                              | Replace an agent. You probably don't want to call this endpoint directly. Instead, [use the agent configurat…  |
| Agents           | PATCH  | `distributedtask/pools/{poolId}/agents/{agentId}`                              | Update agent details.                                                                                          |
| Deploymentgroups | GET    | `distributedtask/deploymentgroups`                                             | Get a list of deployment groups by name or IDs.                                                                |
| Deploymentgroups | POST   | `distributedtask/deploymentgroups`                                             | Create a deployment group.                                                                                     |
| Deploymentgroups | GET    | `distributedtask/deploymentgroups/{deploymentGroupId}`                         | Get a deployment group by its ID.                                                                              |
| Deploymentgroups | PATCH  | `distributedtask/deploymentgroups/{deploymentGroupId}`                         | Update a deployment group.                                                                                     |
| Deploymentgroups | DELETE | `distributedtask/deploymentgroups/{deploymentGroupId}`                         | Delete a deployment group.                                                                                     |
| Elasticpoollogs  | GET    | `distributedtask/elasticpools/{poolId}/logs`                                   | Get elastic pool diagnostics logs for a specified Elastic Pool.                                                |
| Elasticpools     | GET    | `distributedtask/elasticpools`                                                 | Get a list of all Elastic Pools.                                                                               |
| Elasticpools     | POST   | `distributedtask/elasticpools`                                                 | Create a new elastic pool. This will create a new TaskAgentPool at the organization level. If a project id is… |
| Elasticpools     | GET    | `distributedtask/elasticpools/{poolId}`                                        | Returns the Elastic Pool with the specified Pool Id.                                                           |
| Elasticpools     | PATCH  | `distributedtask/elasticpools/{poolId}`                                        | Update settings on a specified Elastic Pool.                                                                   |
| Events           | POST   | `distributedtask/hubs/{hubName}/plans/{planId}/events`                         | Send a pipeline job event to be processed by the execution plan.                                               |
| Logs             | POST   | `distributedtask/hubs/{hubName}/plans/{planId}/logs`                           | Create a log and connect it to a pipeline run's execution plan.                                                |
| Logs             | POST   | `distributedtask/hubs/{hubName}/plans/{planId}/logs`                           | Adds an issue (error or warning) to a timeline record of a pipeline run's execution plan so it surfaces in th… |
| Logs             | POST   | `distributedtask/hubs/{hubName}/plans/{planId}/logs/{logId}`                   | Append a log to a task's log. The log should be sent in the body of the request as a TaskLog object stream.    |
| Nodes            | GET    | `distributedtask/elasticpools/{poolId}/nodes`                                  | Get a list of ElasticNodes currently in the ElasticPool                                                        |
| Nodes            | PATCH  | `distributedtask/elasticpools/{poolId}/nodes/{elasticNodeId}`                  | Update properties on a specified ElasticNode                                                                   |
| Oidctoken        | POST   | `distributedtask/hubs/{hubName}/plans/{planId}/jobs/{jobId}/oidctoken`         |                                                                                                                |
| Poolpermissions  | GET    | `distributedtask/pools/{poolId}/permissions/{permissions}`                     | Checks if current identity has passed permissions on a pool.                                                   |
| Pools            | GET    | `distributedtask/pools`                                                        | Get a list of agent pools.                                                                                     |
| Pools            | POST   | `distributedtask/pools`                                                        | Create an agent pool.                                                                                          |
| Pools            | GET    | `distributedtask/pools/{poolId}`                                               | Get information about an agent pool.                                                                           |
| Pools            | PATCH  | `distributedtask/pools/{poolId}`                                               | Update properties on an agent pool                                                                             |
| Pools            | DELETE | `distributedtask/pools/{poolId}`                                               | Delete an agent pool.                                                                                          |
| Queues           | GET    | `distributedtask/queues`                                                       | Get a list of agent queues by pool ids                                                                         |
| Queues           | POST   | `distributedtask/queues`                                                       | Create a new agent queue to connect a project to an agent pool.                                                |
| Queues           | GET    | `distributedtask/queues`                                                       | Get a list of agent queues by their names                                                                      |
| Queues           | GET    | `distributedtask/queues`                                                       | Get a list of agent queues by their IDs                                                                        |
| Queues           | GET    | `distributedtask/queues/{queueId}`                                             | Get information about an agent queue.                                                                          |
| Queues           | DELETE | `distributedtask/queues/{queueId}`                                             | Removes an agent queue from a project.                                                                         |
| Records          | PATCH  | `distributedtask/hubs/{hubName}/plans/{planId}/timelines/{timelineId}/records` | Update timeline records if they already exist, otherwise create new ones for the same timeline.                |
| Requests         | GET    | `distributedtask/agentclouds/{agentCloudId}/requests`                          |                                                                                                                |
| Securefiles      | GET    | `distributedtask/securefiles`                                                  | Get secure files                                                                                               |
| Securefiles      | POST   | `distributedtask/securefiles`                                                  | Query secure files using a name pattern and a condition on file properties.                                    |
| Securefiles      | PATCH  | `distributedtask/securefiles`                                                  | Update properties and/or names of a set of secure files. Files are identified by their IDs. Properties provid… |
| Securefiles      | POST   | `distributedtask/securefiles`                                                  | Upload a secure file, include the file stream in the request body                                              |
| Securefiles      | GET    | `distributedtask/securefiles`                                                  | Get secure files                                                                                               |
| Securefiles      | GET    | `distributedtask/securefiles/{secureFileId}`                                   | Download a secure file by Id                                                                                   |
| Targets          | GET    | `distributedtask/deploymentgroups/{deploymentGroupId}/targets`                 | Get a list of deployment targets in a deployment group.                                                        |
| Targets          | PATCH  | `distributedtask/deploymentgroups/{deploymentGroupId}/targets`                 | Update tags of a list of deployment targets in a deployment group.                                             |
| Targets          | GET    | `distributedtask/deploymentgroups/{deploymentGroupId}/targets/{targetId}`      | Get a deployment target by its ID in a deployment group                                                        |
| Targets          | DELETE | `distributedtask/deploymentgroups/{deploymentGroupId}/targets/{targetId}`      | Delete a deployment target in a deployment group. This deletes the agent from associated deployment pool too.  |
| Taskgroups       | POST   | `distributedtask/taskgroups`                                                   | Create a task group.                                                                                           |
| Taskgroups       | PUT    | `distributedtask/taskgroups/{taskGroupId}`                                     | Update a task group.                                                                                           |
| Variablegroups   | GET    | `distributedtask/variablegroups`                                               | Get variable groups by ids.                                                                                    |
| Webhooks         | POST   | `public/distributedtask/webhooks/{webHookId}`                                  | Triggers a pipeline run of pipelines which have a webhook resource defined with specified WebHook Name proper… |
| Yamlschema       | GET    | `distributedtask/yamlschema`                                                   | GET the Yaml schema used for Yaml file validation.                                                             |

</details>

<details>
<summary>Збірки — 44 з 93</summary>

| Група               | Метод  | Шлях                                                                       | Що робить                                                                                                      |
| ------------------- | ------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Artifacts           | POST   | `build/builds/{buildId}/artifacts`                                         | Associates an artifact with a build.                                                                           |
| Artifacts           | GET    | `build/builds/{buildId}/artifacts`                                         | Gets a file from the build.                                                                                    |
| Attachments         | GET    | `build/builds/{buildId}/{timelineId}/{recordId}/attachments/{type}/{name}` | Gets a specific attachment.                                                                                    |
| Attachments         | GET    | `build/builds/{buildId}/attachments/{type}`                                | Gets the list of attachments of a specific type that are associated with a build.                              |
| Authorizedresources | GET    | `build/authorizedresources`                                                |                                                                                                                |
| Authorizedresources | PATCH  | `build/authorizedresources`                                                |                                                                                                                |
| Badge               | GET    | `build/repos/{repoType}/badge`                                             | Gets a badge that indicates the status of the most recent build for the specified branch.                      |
| Badge               | GET    | `public/build/definitions/{project}/{definitionId}/badge`                  | This endpoint is deprecated. Please see the Build Status REST endpoint.                                        |
| Builds              | PATCH  | `build/builds`                                                             | Updates multiple builds.                                                                                       |
| Builds              | POST   | `build/builds/{buildId}/workitems`                                         | Gets the work items associated with a build, filtered to specific commits.                                     |
| Controllers         | GET    | `build/controllers`                                                        | Gets controller, optionally filtered by name                                                                   |
| Controllers         | GET    | `build/controllers/{controllerId}`                                         | Gets a controller                                                                                              |
| History             | GET    | `build/retention/history`                                                  | Returns the retention history for the project collection. This includes pipelines that have custom retention…  |
| Leases              | GET    | `build/retention/leases`                                                   | Returns any leases matching the specified MinimalRetentionLeases                                               |
| Leases              | GET    | `build/retention/leases`                                                   | Returns any leases owned by the specified user, optionally scoped to a single pipeline definition and run.     |
| Leases              | GET    | `build/retention/leases/{leaseId}`                                         | Returns the details of the retention lease given a lease id.                                                   |
| Options             | GET    | `build/options`                                                            | Gets all build definition options supported by the system.                                                     |
| Properties          | GET    | `build/builds/{buildId}/properties`                                        | Gets properties for a build.                                                                                   |
| Properties          | PATCH  | `build/builds/{buildId}/properties`                                        | Updates properties for a build.                                                                                |
| Properties          | GET    | `build/definitions/{definitionId}/properties`                              | Gets properties for a definition.                                                                              |
| Properties          | PATCH  | `build/definitions/{definitionId}/properties`                              | Updates properties for a definition.                                                                           |
| Resource Usage      | GET    | `build/resourceusage`                                                      | Gets information about build resources in the system.                                                          |
| Settings            | GET    | `build/settings`                                                           | Gets the build settings.                                                                                       |
| Settings            | PATCH  | `build/settings`                                                           | Updates the build settings.                                                                                    |
| Source Providers    | GET    | `sourceproviders`                                                          | Get a list of source providers and their capabilities.                                                         |
| Source Providers    | GET    | `sourceProviders/{providerName}/branches`                                  | Gets a list of branches for the given source code repository.                                                  |
| Source Providers    | GET    | `sourceProviders/{providerName}/filecontents`                              | Gets the contents of a file in the given source code repository.                                               |
| Source Providers    | GET    | `sourceProviders/{providerName}/pathcontents`                              | Gets the contents of a directory in the given source code repository.                                          |
| Source Providers    | GET    | `sourceProviders/{providerName}/pullrequests/{pullRequestId}`              | Gets a pull request object from source provider.                                                               |
| Source Providers    | GET    | `sourceProviders/{providerName}/repositories`                              | Gets a list of source code repositories.                                                                       |
| Source Providers    | GET    | `sourceProviders/{providerName}/webhooks`                                  | Gets a list of webhooks installed in the given source code repository.                                         |
| Source Providers    | POST   | `sourceProviders/{providerName}/webhooks`                                  | Recreates the webhooks for the specified triggers in the given source code repository.                         |
| Stage Timeline      | GET    | `build/builds/{buildId}/Timeline/{timelineId}/stages/{stageName}`          | Gets the timeline for a build filtered to a specific stage.                                                    |
| Stage Timeline      | GET    | `build/builds/{buildId}/Timeline/stages/{stageName}`                       | Gets the latest timeline for a build filtered to a specific stage.                                             |
| Status              | GET    | `build/status/{definition}`                                                | <p>Gets the build status for a definition, optionally scoped to a specific branch, stage, job, and configurat… |
| Tags                | POST   | `build/builds/{buildId}/tags`                                              | Adds tags to a build.                                                                                          |
| Tags                | PATCH  | `build/builds/{buildId}/tags`                                              | Adds/Removes tags from a build.                                                                                |
| Tags                | PATCH  | `build/definitions/{DefinitionId}/tags`                                    | Adds/Removes tags from a definition.                                                                           |
| Tags                | PUT    | `build/definitions/{DefinitionId}/tags/{tag}`                              | Adds a tag to a definition                                                                                     |
| Tags                | DELETE | `build/tags/{tag}`                                                         | Removes a tag from builds, definitions, and from the tag store                                                 |
| Templates           | GET    | `build/definitions/templates`                                              | Gets all definition templates.                                                                                 |
| Templates           | GET    | `build/definitions/templates/{templateId}`                                 | Gets a specific build definition template.                                                                     |
| Templates           | PUT    | `build/definitions/templates/{templateId}`                                 | Updates an existing build definition template.                                                                 |
| Templates           | DELETE | `build/definitions/templates/{templateId}`                                 | Deletes a build definition template.                                                                           |

</details>

<details>
<summary>Git — 40 з 112</summary>

| Група                           | Метод  | Шлях                                                                                                        | Що робить                                                                                                      |
| ------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Blobs                           | POST   | `git/repositories/{repositoryId}/blobs`                                                                     | Gets one or more blobs in a zip file download.                                                                 |
| Blobs                           | GET    | `git/repositories/{repositoryId}/blobs/{sha1}`                                                              | Get a single blob.                                                                                             |
| Cherry Picks                    | GET    | `git/repositories/{repositoryId}/cherryPicks`                                                               | Retrieve information about a cherry pick operation for a specific branch. This operation is expensive due to…  |
| Commits                         | GET    | `git/repositories/{repositoryId}/commits`                                                                   | Retrieve a list of commits associated with a particular push.                                                  |
| Commits                         | POST   | `git/repositories/{repositoryId}/commitsbatch`                                                              | Retrieve git commits for a project matching the search criteria                                                |
| Items                           | POST   | `git/repositories/{repositoryId}/itemsbatch`                                                                | Retrieves a batch of items in a repo / project for a given list of paths or a long path                        |
| Merges                          | POST   | `git/repositories/{repositoryNameOrId}/merges`                                                              | Request a git merge operation. Currently we support merging only 2 commits.                                    |
| Merges                          | GET    | `git/repositories/{repositoryNameOrId}/merges/{mergeOperationId}`                                           | Get a specific merge operation's details.                                                                      |
| Policy Configurations           | GET    | `git/policy/configurations`                                                                                 | Retrieve a list of policy configurations by a given set of scope/filtering criteria.                           |
| Pull Request Attachments        | GET    | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/attachments`                                  | Get a list of files attached to a given pull request.                                                          |
| Pull Request Attachments        | GET    | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/attachments/{fileName}`                       | Get the file content of a pull request attachment.                                                             |
| Pull Request Attachments        | POST   | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/attachments/{fileName}`                       | Attach a new file to a pull request.                                                                           |
| Pull Request Attachments        | DELETE | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/attachments/{fileName}`                       | Delete a pull request attachment.                                                                              |
| Pull Request Iteration Statuses | POST   | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/iterations/{iterationId}/statuses`            | Create a pull request status on the iteration. This operation will have the same result as Create status on p… |
| Pull Request Iteration Statuses | PATCH  | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/iterations/{iterationId}/statuses`            | Update pull request iteration statuses collection. The only supported operation type is `remove`.              |
| Pull Request Iteration Statuses | GET    | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/iterations/{iterationId}/statuses/{statusId}` | Get the specific pull request iteration status by ID. The status ID is unique within the pull request across…  |
| Pull Request Iteration Statuses | DELETE | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/iterations/{iterationId}/statuses/{statusId}` | Delete pull request iteration status.                                                                          |
| Pull Request Labels             | GET    | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/labels/{labelIdOrName}`                       | Retrieves a single label (tag) that has been assigned to a pull request.                                       |
| Pull Request Properties         | GET    | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/properties`                                   | Get external properties of the pull request.                                                                   |
| Pull Request Properties         | PATCH  | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/properties`                                   | Create or update pull request external properties. The patch operation can be `add`, `replace` or `remove`. F… |
| Pull Request Reviewers          | GET    | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/reviewers`                                    | Retrieve the reviewers for a pull request                                                                      |
| Pull Request Reviewers          | PUT    | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/reviewers`                                    | Add an unmaterialized identity to the reviewers of a pull request.                                             |
| Pull Request Reviewers          | PATCH  | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/reviewers`                                    | Reset the votes of multiple reviewers on a pull request. NOTE: This endpoint only supports updating votes, b…  |
| Pull Request Reviewers          | PATCH  | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/reviewers/{reviewerId}`                       | Edit a reviewer entry. These fields are patchable: isFlagged, hasDeclined                                      |
| Pull Request Share              | POST   | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/share`                                        | Sends an e-mail notification about a specific pull request to a set of recipients                              |
| Pull Request Statuses           | PATCH  | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/statuses`                                     | Update pull request statuses collection. The only supported operation type is `remove`.                        |
| Pull Request Statuses           | GET    | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/statuses/{statusId}`                          | Get the specific pull request status by ID. The status ID is unique within the pull request across all iterat… |
| Pull Request Thread Comments    | GET    | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/threads/{threadId}/comments/{commentId}`      | Retrieve a comment associated with a specific thread in a pull request.                                        |
| Pull Request Threads            | GET    | `git/repositories/{repositoryId}/pullRequests/{pullRequestId}/threads/{threadId}`                           | Retrieve a thread in a pull request.                                                                           |
| Pull Requests                   | GET    | `git/pullrequests/{pullRequestId}`                                                                          | Retrieve a pull request.                                                                                       |
| Refs Favorites                  | GET    | `git/favorites/refs`                                                                                        | Gets the refs favorites for a repo and an identity.                                                            |
| Refs Favorites                  | POST   | `git/favorites/refs`                                                                                        | Creates a ref favorite                                                                                         |
| Refs Favorites                  | GET    | `git/favorites/refs/{favoriteId}`                                                                           | Gets the refs favorite for a favorite Id.                                                                      |
| Refs Favorites                  | DELETE | `git/favorites/refs/{favoriteId}`                                                                           | Deletes the refs favorite specified                                                                            |
| Refs Favorites For Project      | GET    | `git/favorites/refsForProject`                                                                              |                                                                                                                |
| Repositories                    | GET    | `git/deletedrepositories`                                                                                   | Retrieve deleted git repositories.                                                                             |
| Repositories                    | GET    | `git/repositories/{repositoryId}`                                                                           | Retrieve a git repository.                                                                                     |
| Repositories                    | GET    | `git/repositories/{repositoryId}`                                                                           | Retrieve a git repository.                                                                                     |
| Reverts                         | GET    | `git/repositories/{repositoryId}/reverts`                                                                   | Retrieve information about a revert operation for a specific branch.                                           |
| Trees                           | GET    | `git/repositories/{repositoryId}/trees/{sha1}`                                                              | The Tree endpoint returns the collection of objects underneath the specified tree. Trees are folders in a Git… |

</details>

<details>
<summary>Тест-плани — 32 з 44</summary>

| Група                             | Метод  | Шлях                                                             | Що робить                                                                                                      |
| --------------------------------- | ------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Configurations                    | GET    | `testplan/configurations`                                        | Get a list of test configurations.                                                                             |
| Configurations                    | POST   | `testplan/configurations`                                        | Create a test configuration.                                                                                   |
| Configurations                    | PATCH  | `testplan/configurations`                                        | Update a test configuration by its ID.                                                                         |
| Configurations                    | DELETE | `testplan/configurations`                                        | Delete a test configuration by its ID.                                                                         |
| Configurations                    | GET    | `testplan/configurations/{testConfigurationId}`                  | Get a test configuration                                                                                       |
| Suite Test Case                   | GET    | `testplan/Plans/{planId}/Suites/{suiteId}/TestCase/{testCaseId}` | Get a particular Test Case from a Suite.                                                                       |
| Test Plan Recycle Bin             | GET    | `testplan/recycleBin/testplan`                                   | Get a list of deleted test plans                                                                               |
| Test Plan Recycle Bin             | PATCH  | `testplan/recycleBin/testplan/{planId}`                          | Restores the deleted test plan                                                                                 |
| Test Plans                        | GET    | `testplan/plans/{planId}`                                        | Get a test plan by Id.                                                                                         |
| Test Plans                        | PATCH  | `testplan/plans/{planId}`                                        | Update a test plan.                                                                                            |
| Test Plans                        | DELETE | `testplan/plans/{planId}`                                        | Delete a test plan.                                                                                            |
| Test Suite Entry                  | GET    | `testplan/suiteentry/{suiteId}`                                  | Get a list of test suite entries in the test suite.                                                            |
| Test Suite Entry                  | PATCH  | `testplan/suiteentry/{suiteId}`                                  | Reorder test suite entries in the test suite.                                                                  |
| Test Suite Recycle Bin Operations | GET    | `testplan/recycleBin/TestPlan/{planId}/testsuite`                | Get Deleted Test Suites for a Test Plan.                                                                       |
| Test Suite Recycle Bin Operations | GET    | `testplan/recycleBin/testsuite`                                  | Get Deleted Test Suites within a Project.                                                                      |
| Test Suite Recycle Bin Operations | PATCH  | `testplan/recycleBin/testsuite/{suiteId}`                        | Restores the deleted test suite                                                                                |
| Test Suites                       | GET    | `testplan/Plans/{planId}/suites/{suiteId}`                       | Get test suite by suite id.                                                                                    |
| Test Suites                       | PATCH  | `testplan/Plans/{planId}/suites/{suiteId}`                       | Update test suite.                                                                                             |
| Test Suites                       | DELETE | `testplan/Plans/{planId}/suites/{suiteId}`                       | Delete test suite.                                                                                             |
| Test Suites                       | GET    | `testplan/suites`                                                | Find the list of all test suites in which a given test case is present. This is helpful if you need to find o… |
| Test Case Clone                   | POST   | `testplan/TestCases/CloneTestCaseOperation`                      |                                                                                                                |
| Test Case Clone                   | GET    | `testplan/TestCases/CloneTestCaseOperation/{cloneOperationId}`   | Get clone information.                                                                                         |
| Test Cases                        | DELETE | `testplan/testcases/{testCaseId}`                                | Delete a test case.                                                                                            |
| Test Plan Clone                   | POST   | `testplan/Plans/CloneOperation`                                  | Clone test plan                                                                                                |
| Test Plan Clone                   | GET    | `testplan/Plans/CloneOperation/{cloneOperationId}`               | Get clone information.                                                                                         |
| Test Suite Clone                  | POST   | `testplan/Suites/CloneOperation`                                 | Clone test suite                                                                                               |
| Test Suite Clone                  | GET    | `testplan/Suites/CloneOperation/{cloneOperationId}`              | Get clone information.                                                                                         |
| Variables                         | GET    | `testplan/variables`                                             | Get a list of test variables.                                                                                  |
| Variables                         | POST   | `testplan/variables`                                             | Create a test variable.                                                                                        |
| Variables                         | GET    | `testplan/variables/{testVariableId}`                            | Get a test variable by its ID.                                                                                 |
| Variables                         | PATCH  | `testplan/variables/{testVariableId}`                            | Update a test variable by its ID.                                                                              |
| Variables                         | DELETE | `testplan/variables/{testVariableId}`                            | Delete a test variable by its ID.                                                                              |

</details>

<details>
<summary>Advanced Security — 27 з 29</summary>

| Група                        | Метод  | Шлях                                                               | Що робить                                                                                                      |
| ---------------------------- | ------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Alerts                       | PATCH  | `alert/repositories/{repository}/alerts/{alertId}`                 | Update the status of an alert                                                                                  |
| Alerts Batch                 | POST   | `alert/repositories/{repository}/AlertsBatch`                      | Get alerts by alert IDs Currently supports fetching secret alerts only.                                        |
| Alerts Query                 | POST   | `alert/repositories/{repository}/alertsquery`                      | Query alerts for a repository by metadata type linkage.                                                        |
| Analysis                     | GET    | `alert/repositories/{repository}/filters/branches`                 | Returns the branches for which analysis results were submitted.                                                |
| Filters Settings             | GET    | `reporting/filtersSettings/alertsbatch`                            | Gets all advanced filters for the organization.                                                                |
| Filters Settings             | POST   | `reporting/filtersSettings/alertsbatch`                            | Creates a new advanced filter for the organization.                                                            |
| Filters Settings             | GET    | `reporting/filtersSettings/alertsbatch/{filterId}`                 | Gets a specific advanced filter by its ID.                                                                     |
| Filters Settings             | PATCH  | `reporting/filtersSettings/alertsbatch/{filterId}`                 | Updates an advanced filter. Only the name can be updated.                                                      |
| Filters Settings             | DELETE | `reporting/filtersSettings/alertsbatch/{filterId}`                 | Deletes an advanced filter.                                                                                    |
| Instances                    | GET    | `alert/repositories/{repository}/alerts/{alertId}/instances`       | Get instances of an alert on a branch specified with @ref. If @ref is not provided, return instances of an al… |
| Metadata Batch               | POST   | `alert/repositories/{repository}/alerts/metadatabatch`             | Get alerts metadata.                                                                                           |
| Metadata2                    | GET    | `alert/repositories/{repository}/alerts/{alertId}/metadata`        | Get an alert metadata.                                                                                         |
| Meter Usage                  | GET    | `management/meterusage/default`                                    | Get commiters used when calculating billing information.                                                       |
| Org Enablement               | GET    | `management/enablement`                                            | Get the current status of Advanced Security for the organization                                               |
| Org Enablement               | PATCH  | `management/enablement`                                            | Update the status of Advanced Security for the organization                                                    |
| Org Meter Usage Estimate     | GET    | `management/meterUsageEstimate/default`                            | Estimate the pushers that would be added to the customer's usage if Advanced Security was enabled for this or… |
| Pipeline Analyses            | DELETE | `alert/repositories/{repository}/pipelineAnalyses`                 | Soft-deletes analysis data for all pipelines in a repository, cleaning up the associated Advanced Security al… |
| Pipeline Analysis            | DELETE | `alert/repositories/{repository}/pipelineAnalysis/{adoPipelineId}` | Soft-deletes analysis data for a specific pipeline, cleaning up the associated Advanced Security alerts.       |
| Project Enablement           | GET    | `management/enablement`                                            | Get the current status of Advanced Security for a project                                                      |
| Project Enablement           | PATCH  | `management/enablement`                                            | Update the status of Advanced Security for the project                                                         |
| Project Meter Usage Estimate | GET    | `management/meterUsageEstimate/default`                            | Estimate the pushers that would be added to the customer's usage if Advanced Security was enabled for this pr… |
| Repo Enablement              | GET    | `management/repositories/{repository}/enablement`                  | Determines if Code Security, Secret Protection, and their features are enabled for the repository.             |
| Repo Enablement              | PATCH  | `management/repositories/{repository}/enablement`                  | Update the enablement status of Code Security and Secret Protection, along with their respective features, fo… |
| Repo Meter Usage Estimate    | GET    | `management/repositories/{repository}/meterUsageEstimate/default`  | Estimate the pushers that would be added to the customer's usage if Advanced Security was enabled for this re… |
| Summary Dashboard            | GET    | `reporting/summary/alerts`                                         | Get Alert summary by severity for the org                                                                      |
| Summary Dashboard            | GET    | `reporting/summary/alertsbatch`                                    | Get Combined Alerts for the org                                                                                |
| Summary Dashboard            | GET    | `reporting/summary/enablement`                                     | Get Enablement summary for the org                                                                             |

</details>

<details>
<summary>Artifacts: пакети за протоколами — 27 з 73</summary>

| Група     | Метод  | Шлях                                                                                                               | Що робить                                                                                                      |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Cargo     | POST   | `packaging/feeds/{feedId}/cargo/RecycleBin/packagesBatch`                                                          | Delete or restore several package versions from the recycle bin.                                               |
| Maven     | POST   | `packaging/feeds/{feed}/maven/RecycleBin/packagesBatch`                                                            | Delete or restore several package versions from the recycle bin.                                               |
| Maven     | GET    | `packaging/feeds/{feedId}/maven/{groupId}/{artifactId}/{version}/{fileName}/content`                               | Fulfills Maven package file download requests by either returning the URL of the requested package file or, i… |
| Maven     | POST   | `packaging/feeds/{feedId}/maven/packagesbatch`                                                                     | Update several packages from a single feed in a single request. The updates to the packages do not happen ato… |
| Npm       | GET    | `packaging/feeds/{feedId}/npm/@{packageScope}/{unscopedPackageName}/versions/{packageVersion}`                     | Get information about a scoped package version (such as @scope/name).                                          |
| Npm       | PATCH  | `packaging/feeds/{feedId}/npm/@{packageScope}/{unscopedPackageName}/versions/{packageVersion}`                     | Update state for an npm scoped package version.                                                                |
| Npm       | DELETE | `packaging/feeds/{feedId}/npm/@{packageScope}/{unscopedPackageName}/versions/{packageVersion}`                     | Unpublish a scoped package version (such as @scope/name).                                                      |
| Npm       | GET    | `packaging/feeds/{feedId}/npm/packages/{packageName}/versions/{packageVersion}/content`                            | Get an unscoped npm package.                                                                                   |
| Npm       | GET    | `packaging/feeds/{feedId}/npm/packages/{packageName}/versions/{packageVersion}/readme`                             | Get the Readme for a package version that has no npm scope.                                                    |
| Npm       | GET    | `packaging/feeds/{feedId}/npm/packages/@{packageScope}/{unscopedPackageName}/upstreaming`                          | Get the upstreaming behavior of the (scoped) package within the context of a feed                              |
| Npm       | PATCH  | `packaging/feeds/{feedId}/npm/packages/@{packageScope}/{unscopedPackageName}/upstreaming`                          | Set the upstreaming behavior of a (scoped) package within the context of a feed                                |
| Npm       | GET    | `packaging/feeds/{feedId}/npm/packages/@{packageScope}/{unscopedPackageName}/versions/{packageVersion}/content`    | Get scoped npm package.                                                                                        |
| Npm       | GET    | `packaging/feeds/{feedId}/npm/packages/@{packageScope}/{unscopedPackageName}/versions/{packageVersion}/readme`     | Get the Readme for a package version with an npm scope.                                                        |
| Npm       | POST   | `packaging/feeds/{feedId}/npm/packagesbatch`                                                                       | Update several packages from a single feed in a single request. The updates to the packages do not happen ato… |
| Npm       | GET    | `packaging/feeds/{feedId}/npm/RecycleBin/packages/@{packageScope}/{unscopedPackageName}/versions/{packageVersion}` | Get information about a scoped package version in the recycle bin.                                             |
| Npm       | PATCH  | `packaging/feeds/{feedId}/npm/RecycleBin/packages/@{packageScope}/{unscopedPackageName}/versions/{packageVersion}` | Restore a package version with an npm scope from the recycle bin to its feed.                                  |
| Npm       | DELETE | `packaging/feeds/{feedId}/npm/RecycleBin/packages/@{packageScope}/{unscopedPackageName}/versions/{packageVersion}` | Delete a package version with an npm scope from the recycle bin.                                               |
| Npm       | POST   | `packaging/feeds/{feedId}/npm/RecycleBin/PackagesBatch`                                                            | Delete or restore several package versions from the recycle bin.                                               |
| Npm       | POST   | `packaging/npm/validateupstream`                                                                                   | Validates whether the given upstream is valid to add as a custom upstream using the given package name.        |
| NuGet     | GET    | `packaging/feeds/{feedId}/nuget/packages/{packageName}/versions/{packageVersion}/content`                          | Download a package version directly.                                                                           |
| NuGet     | POST   | `packaging/feeds/{feedId}/nuget/packagesbatch`                                                                     | Update several packages from a single feed in a single request. The updates to the packages do not happen ato… |
| NuGet     | POST   | `packaging/feeds/{feedId}/nuget/RecycleBin/packagesBatch`                                                          | Delete or restore several package versions from the recycle bin.                                               |
| Python    | GET    | `packaging/feeds/{feedId}/pypi/packages/{packageName}/versions/{packageVersion}/{fileName}/content`                | Download a python package file directly. This API is intended for manual UI download options, not for program… |
| Python    | POST   | `packaging/feeds/{feedId}/pypi/packagesbatch`                                                                      | Update several packages from a single feed in a single request. The updates to the packages do not happen ato… |
| Python    | POST   | `packaging/feeds/{feedId}/pypi/RecycleBin/packagesBatch`                                                           | Delete or restore several package versions from the recycle bin.                                               |
| Universal | POST   | `packaging/feeds/{feedId}/upack/packagesbatch`                                                                     | Update several packages from a single feed in a single request. The updates to the packages do not happen ato… |
| Universal | POST   | `packaging/feeds/{feedId}/upack/RecycleBin/packagesBatch`                                                          | Delete or restore several package versions from the recycle bin.                                               |

</details>

<details>
<summary>Робочі елементи — 26 з 89</summary>

| Група                           | Метод  | Шлях                                              | Що робить                                                                                                      |
| ------------------------------- | ------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Account My Work Recent Activity | GET    | `work/accountmyworkrecentactivity`                | Gets recent work item activities                                                                               |
| Artifact Link Types             | GET    | `wit/artifactlinktypes`                           | Get the list of work item tracking outbound artifact link types.                                               |
| Attachments                     | PUT    | `wit/attachments/{id}`                            | Uploads an attachment chunk.                                                                                   |
| Classification Nodes            | GET    | `wit/classificationnodes`                         | Gets root classification nodes under the project.                                                              |
| Classification Nodes            | GET    | `wit/classificationnodes/{structureGroup}/{path}` | Gets the classification node for a given node path.                                                            |
| Comments                        | GET    | `wit/workItems/{workItemId}/comments`             | Returns a list of work item comments by ids.                                                                   |
| Comments                        | GET    | `wit/workItems/{workItemId}/comments/{commentId}` | Returns a work item comment.                                                                                   |
| Fields                          | PATCH  | `wit/fields/{fieldNameOrRefName}`                 | Update a field.                                                                                                |
| Fields                          | DELETE | `wit/fields/{fieldNameOrRefName}`                 | Deletes the field. To undelete a filed, see "Update Field" API.                                                |
| Github Connections              | GET    | `githubconnections`                               | Gets a list of github connections                                                                              |
| Github Connections              | GET    | `githubconnections/{connectionId}/repos`          | Gets a list of repos within specified github connection.                                                       |
| Github Connections              | POST   | `githubconnections/{connectionId}/reposBatch`     | Add/remove list of repos within specified github connection.                                                   |
| Queries                         | POST   | `wit/queriesbatch`                                | Gets a list of queries by ids (Maximum 1000)                                                                   |
| Recyclebin                      | GET    | `wit/recyclebin/{id}`                             | Gets a deleted work item from Recycle Bin.                                                                     |
| Reporting Work Item Links       | GET    | `wit/reporting/workitemlinks`                     | Get a batch of work item links                                                                                 |
| Reporting Work Item Revisions   | GET    | `wit/reporting/workitemrevisions`                 | Get a batch of work item revisions with the option of including deleted items                                  |
| Reporting Work Item Revisions   | POST   | `wit/reporting/workitemrevisions`                 | Get a batch of work item revisions. This request may be used if your list of fields is large enough that it m… |
| Send Mail                       | POST   | `wit/sendmail`                                    | RESTful method to send mail for selected/queried work items.                                                   |
| Temp Queries                    | POST   | `wit/tempqueries`                                 | Creates a temporary query                                                                                      |
| Work Item Icons                 | GET    | `wit/workitemicons`                               | Get a list of all work item icons.                                                                             |
| Work Item Icons                 | GET    | `wit/workitemicons/{icon}`                        | Get a work item icon given the friendly name and icon color.                                                   |
| Work Item Relation Types        | GET    | `wit/workitemrelationtypes/{relation}`            | Gets the work item relation type definition.                                                                   |
| Work Item Revisions Discussions | GET    | `wit/reporting/workItemRevisions/discussions`     |                                                                                                                |
| Work Item Transitions           | GET    | `wit/workitemtransitions`                         | Returns the next state on the given work item IDs.                                                             |
| Work Items                      | GET    | `wit/workitems`                                   | Returns a list of work items (Maximum 200)                                                                     |
| Work Items                      | GET    | `wit/workitems/${type}`                           | Returns a single work item from a template.                                                                    |

</details>

<details>
<summary>Користувачі й групи — 21 з 28</summary>

| Група              | Метод  | Шлях                                                          | Що робить                                                                                                      |
| ------------------ | ------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Avatars            | GET    | `graph/Subjects/{subjectDescriptor}/avatars`                  |                                                                                                                |
| Avatars            | PUT    | `graph/Subjects/{subjectDescriptor}/avatars`                  |                                                                                                                |
| Avatars            | DELETE | `graph/Subjects/{subjectDescriptor}/avatars`                  |                                                                                                                |
| Descriptors        | GET    | `graph/descriptors/{storageKey}`                              | Resolve a storage key to a descriptor                                                                          |
| Groups             | POST   | `graph/groups`                                                | Create a new Azure DevOps group or materialize an existing AAD group.                                          |
| Groups             | PATCH  | `graph/groups/{groupDescriptor}`                              | Update the properties of an Azure DevOps group.                                                                |
| Groups             | DELETE | `graph/groups/{groupDescriptor}`                              | Removes an Azure DevOps group from all of its parent groups.                                                   |
| Membership States  | GET    | `graph/membershipstates/{subjectDescriptor}`                  | Check whether a subject is active or inactive.                                                                 |
| Memberships        | GET    | `graph/memberships/{subjectDescriptor}/{containerDescriptor}` | Get a membership relationship between a container and subject.                                                 |
| Provider Info      | GET    | `graph/Users/{userDescriptor}/providerinfo`                   |                                                                                                                |
| Request Access     | POST   | `graph/requestaccess`                                         |                                                                                                                |
| Service Principals | GET    | `graph/serviceprincipals`                                     | Get a list of all service principals in a given scope.                                                         |
| Service Principals | POST   | `graph/serviceprincipals`                                     | Materialize an existing AAD service principal into the ADO account.                                            |
| Service Principals | GET    | `graph/serviceprincipals/{servicePrincipalDescriptor}`        | Get a service principal by its descriptor.                                                                     |
| Service Principals | DELETE | `graph/serviceprincipals/{servicePrincipalDescriptor}`        | Disables a service principal.                                                                                  |
| Storage Keys       | GET    | `graph/storagekeys/{subjectDescriptor}`                       | Resolve a descriptor to a storage key.                                                                         |
| Subject Lookup     | POST   | `graph/subjectlookup`                                         | Resolve descriptors to users, groups or scopes (Subjects) in a batch.                                          |
| Subject Query      | POST   | `graph/subjectquery`                                          | Search for Azure Devops users, or/and groups. Results will be returned in a batch with no more than 100 graph… |
| Users              | POST   | `graph/users`                                                 | Materialize an existing AAD or MSA user into the ADO account.                                                  |
| Users              | PATCH  | `graph/users/{userDescriptor}`                                | Map an existing user to a different user.                                                                      |
| Users              | DELETE | `graph/users/{userDescriptor}`                                | Disables a user.                                                                                               |

</details>

<details>
<summary>Service hooks — 18 з 22</summary>

| Група         | Метод | Шлях                                                                  | Що робить                                                                                                      |
| ------------- | ----- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Consumers     | GET   | `hooks/consumers`                                                     | Get a list of available service hook consumer services. Optionally filter by consumers that support at least…  |
| Consumers     | GET   | `hooks/consumers/{consumerId}`                                        | Get a specific consumer service. Optionally filter out consumer actions that do not support any event types f… |
| Consumers     | GET   | `hooks/consumers/{consumerId}/actions`                                | Get a list of consumer actions for a specific consumer.                                                        |
| Consumers     | GET   | `hooks/consumers/{consumerId}/actions/{consumerActionId}`             | Get details about a specific consumer action.                                                                  |
| Diagnostics   | GET   | `hooks/subscriptions/{subscriptionId}/diagnostics`                    |                                                                                                                |
| Diagnostics   | PUT   | `hooks/subscriptions/{subscriptionId}/diagnostics`                    |                                                                                                                |
| Notifications | POST  | `hooks/notificationsquery`                                            | Query for notifications. A notification includes details about the event, the request to and the response fro… |
| Notifications | GET   | `hooks/subscriptions/{subscriptionId}/notifications`                  | Get a list of notifications for a specific subscription. A notification includes details about the event, the… |
| Notifications | GET   | `hooks/subscriptions/{subscriptionId}/notifications/{notificationId}` | Get a specific notification for a subscription.                                                                |
| Notifications | POST  | `hooks/testnotifications`                                             | Sends a test notification. This is useful for verifying the configuration of an updated or new service hooks…  |
| Publishers    | GET   | `hooks/publishers`                                                    | Get a list of publishers.                                                                                      |
| Publishers    | GET   | `hooks/publishers/{publisherId}`                                      | Get a specific service hooks publisher.                                                                        |
| Publishers    | GET   | `hooks/publishers/{publisherId}/eventtypes`                           | Get the event types for a specific publisher.                                                                  |
| Publishers    | GET   | `hooks/publishers/{publisherId}/eventtypes/{eventTypeId}`             | Get a specific event type.                                                                                     |
| Publishers    | POST  | `hooks/publishers/{publisherId}/inputValuesQuery`                     |                                                                                                                |
| Publishers    | POST  | `hooks/publishersquery`                                               | Query for service hook publishers.                                                                             |
| Subscriptions | PUT   | `hooks/subscriptions/{subscriptionId}`                                | Update a subscription. <param name="subscriptionId">ID for a subscription that you wish to update.</param>     |
| Subscriptions | POST  | `hooks/subscriptionsquery`                                            | Query for service hook subscriptions.                                                                          |

</details>

<details>
<summary>Погодження й перевірки — 12 з 15</summary>

| Група                | Метод  | Шлях                                                        | Що робить                                                                              |
| -------------------- | ------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Check Configurations | GET    | `pipelines/checks/configurations`                           | Get Check configuration by resource type and id                                        |
| Check Configurations | POST   | `pipelines/checks/configurations`                           | Add a check configuration                                                              |
| Check Configurations | GET    | `pipelines/checks/configurations/{id}`                      | Get Check configuration by Id                                                          |
| Check Configurations | PATCH  | `pipelines/checks/configurations/{id}`                      | Update check configuration                                                             |
| Check Configurations | DELETE | `pipelines/checks/configurations/{id}`                      | Delete check configuration by id                                                       |
| Check Configurations | POST   | `pipelines/checks/queryconfigurations`                      | Get check configurations for multiple resources by resource type and id.               |
| Check Evaluations    | POST   | `pipelines/checks/runs`                                     | Initiate an evaluation for a check in a pipeline                                       |
| Check Evaluations    | GET    | `pipelines/checks/runs/{checkSuiteId}`                      | Get details for a specific check evaluation                                            |
| Check Evaluations    | PATCH  | `pipelines/checks/runs/{checkSuiteId}`                      | Update a check run of a check suite                                                    |
| Pipeline Permissions | PATCH  | `pipelines/pipelinepermissions`                             | Batch API to authorize/unauthorize a list of definitions for a multiple resources.     |
| Pipeline Permissions | GET    | `pipelines/pipelinepermissions/{resourceType}/{resourceId}` | Given a ResourceType and ResourceId, returns authorized definitions for that resource. |
| Pipeline Permissions | PATCH  | `pipelines/pipelinepermissions/{resourceType}/{resourceId}` | Authorizes/Unauthorizes a list of definitions for a given resource.                    |

</details>

<details>
<summary>Середовища — 12 з 17</summary>

| Група                        | Метод  | Шлях                                                                            | Що робить                                                                       |
| ---------------------------- | ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Environmentaccesstoken       | POST   | `pipelines/environments/environmentaccesstoken/{environmentId}`                 | GET a PAT token for creating and deleting deployment targets in an environment. |
| Environmentdeploymentrecords | GET    | `pipelines/environments/{environmentId}/environmentdeploymentrecords`           | Get environment deployment execution history                                    |
| Kubernetes                   | POST   | `pipelines/environments/{environmentId}/providers/kubernetes`                   |                                                                                 |
| Kubernetes                   | PATCH  | `pipelines/environments/{environmentId}/providers/kubernetes`                   |                                                                                 |
| Kubernetes                   | GET    | `pipelines/environments/{environmentId}/providers/kubernetes/{resourceId}`      |                                                                                 |
| Kubernetes                   | DELETE | `pipelines/environments/{environmentId}/providers/kubernetes/{resourceId}`      |                                                                                 |
| Pool                         | GET    | `pipelines/environments/{environmentId}/providers/virtualmachines/pool`         |                                                                                 |
| Vmresource                   | GET    | `pipelines/environments/{environmentId}/providers/virtualmachines`              | Get Virtual Machine Resources                                                   |
| Vmresource                   | POST   | `pipelines/environments/{environmentId}/providers/virtualmachines`              | Add Virtual Machine Resource                                                    |
| Vmresource                   | PUT    | `pipelines/environments/{environmentId}/providers/virtualmachines`              | Replace Virtual Machine Resource                                                |
| Vmresource                   | PATCH  | `pipelines/environments/{environmentId}/providers/virtualmachines`              | Update Virtual Machine Resource                                                 |
| Vmresource                   | DELETE | `pipelines/environments/{environmentId}/providers/virtualmachines/{resourceId}` | Delete Virtual Machine Resource                                                 |

</details>

<details>
<summary>Обране — 9 з 9</summary>

| Група     | Метод  | Шлях                              | Що робить |
| --------- | ------ | --------------------------------- | --------- |
| Favorites | GET    | `favorite/favorites`              |           |
| Favorites | POST   | `favorite/favorites`              |           |
| Favorites | GET    | `favorite/favorites`              |           |
| Favorites | POST   | `favorite/favorites`              |           |
| Favorites | GET    | `favorite/favorites`              |           |
| Favorites | GET    | `favorite/favorites/{favoriteId}` |           |
| Favorites | DELETE | `favorite/favorites/{favoriteId}` |           |
| Favorites | DELETE | `favorite/favorites/{favoriteId}` |           |
| Favorites | GET    | `favorite/favorites/{favoriteId}` |           |

</details>

<details>
<summary>Сповіщення — 9 з 17</summary>

| Група           | Метод | Шлях                                                                | Що робить                                                                                                     |
| --------------- | ----- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Diagnostic Logs | GET   | `notification/diagnosticlogs/{source}/entries/{entryId}`            | Get a list of diagnostic logs for this service.                                                               |
| Diagnostics     | GET   | `notification/subscriptions/{subscriptionId}/diagnostics`           | Get the diagnostics settings for a subscription.                                                              |
| Diagnostics     | PUT   | `notification/subscriptions/{subscriptionId}/diagnostics`           | Update the diagnostics settings for a subscription.                                                           |
| Settings        | GET   | `notification/settings`                                             |                                                                                                               |
| Settings        | PATCH | `notification/settings`                                             |                                                                                                               |
| Subscribers     | GET   | `notification/subscribers/{subscriberId}`                           | Get delivery preferences of a notifications subscriber.                                                       |
| Subscribers     | PATCH | `notification/subscribers/{subscriberId}`                           | Update delivery preferences of a notifications subscriber.                                                    |
| Subscriptions   | POST  | `notification/subscriptionquery`                                    | Query for subscriptions. A subscription is returned if it matches one or more of the specified conditions.    |
| Subscriptions   | PUT   | `notification/Subscriptions/{subscriptionId}/usersettings/{userId}` | Update the specified user's settings for the specified subscription. This API is typically used to opt in or… |

</details>

<details>
<summary>Artifacts: фіди — 8 з 37</summary>

| Група            | Метод  | Шлях                                                                                   | Що робить                                                                                                      |
| ---------------- | ------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Artifact Details | GET    | `public/packaging/Feeds/{feedId}/Packages/{packageId}/badge`                           | Generate a SVG badge for the latest version of a package. The generated SVG is typically used as the image i…  |
| Change Tracking  | GET    | `packaging/feedchanges`                                                                | Query to determine which feeds have changed since the last call, tracked through the provided continuationTok… |
| Change Tracking  | GET    | `packaging/feedchanges/{feedId}`                                                       | Query a feed to determine its current state.                                                                   |
| Feed Management  | GET    | `packaging/Feeds/{feedId}/views/{viewId}`                                              | Get a view by Id.                                                                                              |
| Provenance       | POST   | `provenance/session/{protocol}`                                                        | Creates a session, a wrapper around a feed that can store additional metadata on the packages published to it. |
| Recycle Bin      | DELETE | `packaging/Feeds/{feedId}/RecycleBin/Packages`                                         | Queues a job to remove all package versions from a feed's recycle bin                                          |
| Recycle Bin      | GET    | `packaging/Feeds/{feedId}/RecycleBin/Packages/{packageId}`                             | Get information about a package and all its versions within the recycle bin.                                   |
| Recycle Bin      | GET    | `packaging/Feeds/{feedId}/RecycleBin/Packages/{packageId}/Versions/{packageVersionId}` | Get information about a package version within the recycle bin.                                                |

</details>

<details>
<summary>Service connections — 8 з 14</summary>

| Група            | Метод | Шлях                                            | Що робить                                              |
| ---------------- | ----- | ----------------------------------------------- | ------------------------------------------------------ |
| Endpointproxy    | POST  | `serviceendpoint/endpointproxy`                 | Use ExecuteServiceEndpointRequest API Instead          |
| Endpointproxy    | POST  | `serviceendpoint/endpointproxy`                 | Proxy for a GET request defined by a service endpoint. |
| Endpoints        | PUT   | `serviceendpoint/endpoints`                     | Update the service endpoints.                          |
| Endpoints        | PUT   | `serviceendpoint/endpoints/{endpointId}`        | Update the service endpoint                            |
| Endpoints        | PATCH | `serviceendpoint/endpoints/{endpointId}`        | Share service endpoint across projects                 |
| Executionhistory | GET   | `serviceendpoint/{endpointId}/executionhistory` | Get service endpoint execution records.                |
| Types            | GET   | `serviceendpoint/types`                         | Get service endpoint types.                            |
| Types            | POST  | `serviceendpoint/types`                         | Get service endpoint types with passed types filter.   |

</details>

<details>
<summary>Аудит — 7 з 9</summary>

| Група        | Метод  | Шлях                       | Що робить                                                             |
| ------------ | ------ | -------------------------- | --------------------------------------------------------------------- |
| Download Log | GET    | `audit/downloadlog`        | Downloads audit log entries.                                          |
| Streams      | GET    | `audit/streams`            | Return all Audit Streams scoped to an organization                    |
| Streams      | POST   | `audit/streams`            | Create new Audit Stream                                               |
| Streams      | PUT    | `audit/streams`            | Update existing Audit Stream                                          |
| Streams      | GET    | `audit/streams/{streamId}` | Return Audit Stream with id of streamId if one exists otherwise throw |
| Streams      | PUT    | `audit/streams/{streamId}` | Update existing Audit Stream status                                   |
| Streams      | DELETE | `audit/streams/{streamId}` | Delete Audit Stream                                                   |

</details>

<details>
<summary>Ліцензії — 7 з 21</summary>

| Група                          | Метод  | Шлях                                                | Що робить                                                                                                      |
| ------------------------------ | ------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Member Entitlements            | GET    | `memberentitlements`                                |                                                                                                                |
| Service Principal Entitlements | POST   | `serviceprincipalentitlements`                      | Add a service principal, assign license and extensions and make them a member of a project group in an accoun… |
| Service Principal Entitlements | PATCH  | `serviceprincipalentitlements`                      | Edit the entitlements (License, Extensions, Projects, Teams etc) for one or more service principals.           |
| Service Principal Entitlements | GET    | `serviceprincipalentitlements/{servicePrincipalId}` | Get Service principal Entitlement for a service principal.                                                     |
| Service Principal Entitlements | PATCH  | `serviceprincipalentitlements/{servicePrincipalId}` | Edit the entitlements (License, Extensions, Projects, Teams etc) for a service principal.                      |
| Service Principal Entitlements | DELETE | `serviceprincipalentitlements/{servicePrincipalId}` | Delete a service principal from the account.                                                                   |
| User Entitlements              | PATCH  | `userentitlements`                                  | Edit the entitlements (License, Extensions, Projects, Teams etc) for one or more users.                        |

</details>

<details>
<summary>Дошки й спринти — 7 з 59</summary>

| Група             | Метод | Шлях                                               | Що робить                                   |
| ----------------- | ----- | -------------------------------------------------- | ------------------------------------------- |
| Boards            | PUT   | `work/boards/{id}`                                 | Update board options                        |
| Boardusersettings | PATCH | `work/boards/{board}/boardusersettings`            | Update board user settings for the board id |
| Chartimages       | GET   | `work/boards/{board}/chartimages/{name}`           | Get a board chart image.                    |
| Chartimages       | GET   | `work/iterations/{iterationId}/chartimages/{name}` | Get an iteration chart image.               |
| Chartimages       | GET   | `work/iterations/chartimages/{name}`               | Get an iterations chart image.              |
| Iterations        | GET   | `work/teamsettings/iterations/{id}`                | Get team's iteration by iterationId         |
| Teamsettings      | PATCH | `work/teamsettings`                                | Update a team's settings                    |

</details>

<details>
<summary>Проєкти й команди — 6 з 19</summary>

| Група             | Метод  | Шлях                                     | Що робить                                                                                                |
| ----------------- | ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Avatar            | PUT    | `projects/{projectId}/avatar`            | Sets the avatar for the project.                                                                         |
| Avatar            | DELETE | `projects/{projectId}/avatar`            | Removes the avatar for the project.                                                                      |
| Categorized Teams | GET    | `projects/{projectId}/categorizedteams/` | Gets list of user readable teams in a project and teams user is member of (excluded from readable list). |
| Processes         | GET    | `process/processes/{processId}`          | Get a process by ID.                                                                                     |
| Teams             | GET    | `projects/{projectId}/teams/{teamId}`    | Get a specific team.                                                                                     |
| Teams             | GET    | `teams`                                  | Get a list of all teams.                                                                                 |

</details>

<details>
<summary>Дашборди — 5 з 16</summary>

| Група      | Метод | Шлях                                                    | Що робить                                                                                                      |
| ---------- | ----- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Dashboards | PUT   | `dashboard/dashboards`                                  | Update the name and position of dashboards in the supplied group, and remove omitted dashboards. Does not mod… |
| Widgets    | GET   | `dashboard/dashboards/{dashboardId}/widgets`            | Get widgets contained on the specified dashboard.                                                              |
| Widgets    | PUT   | `dashboard/dashboards/{dashboardId}/widgets`            | Replace the widgets on specified dashboard with the supplied widgets.                                          |
| Widgets    | PATCH | `dashboard/dashboards/{dashboardId}/widgets`            | Update the supplied widgets on the dashboard using supplied state. State of existing Widgets not passed in th… |
| Widgets    | PUT   | `dashboard/dashboards/{dashboardId}/widgets/{widgetId}` | Override the state of the specified widget.                                                                    |

</details>

<details>
<summary>Імпорт/експорт процесів — 5 з 5</summary>

| Група     | Метод | Шлях                                      | Що робить                                                             |
| --------- | ----- | ----------------------------------------- | --------------------------------------------------------------------- |
| Behaviors | GET   | `work/processadmin/{processId}/behaviors` | Returns a list of behaviors for the process.                          |
| Behaviors | GET   | `work/processadmin/{processId}/behaviors` | Returns a behavior for the process.                                   |
| Processes | GET   | `work/processadmin/processes/export/{id}` | Returns requested process template.                                   |
| Processes | POST  | `work/processadmin/processes/import`      | Imports a process from zip file.                                      |
| Processes | GET   | `work/processadmin/processes/status/{id}` | Tells whether promote has completed for the specified promote job ID. |

</details>

<details>
<summary>Wiki — 5 з 15</summary>

| Група       | Метод  | Шлях                                               | Що робить                                                                                                |
| ----------- | ------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Attachments | PUT    | `wiki/wikis/{wikiIdentifier}/attachments`          | Creates an attachment in the wiki.                                                                       |
| Page Moves  | POST   | `wiki/wikis/{wikiIdentifier}/pagemoves`            | Creates a page move operation that updates the path and order of the page as provided in the parameters. |
| Page Stats  | GET    | `wiki/wikis/{wikiIdentifier}/pages/{pageId}/stats` | Returns page detail corresponding to Page ID.                                                            |
| Wikis       | PATCH  | `wiki/wikis/{wikiIdentifier}`                      | Updates the wiki corresponding to the wiki ID or wiki name provided using the update parameters.         |
| Wikis       | DELETE | `wiki/wikis/{wikiIdentifier}`                      | Deletes the wiki corresponding to the wiki ID or wiki name provided.                                     |

</details>

<details>
<summary>Звіти про права — 4 з 4</summary>

| Група                       | Метод | Шлях                              | Що робить                                                |
| --------------------------- | ----- | --------------------------------- | -------------------------------------------------------- |
| Permissions Report          | GET   | `permissionsreport`               | Get a list of permissions reports                        |
| Permissions Report          | POST  | `permissionsreport`               | Request a permissions report to be created asyncronously |
| Permissions Report          | GET   | `permissionsreport/{id}`          | Get a specific permissions report                        |
| Permissions Report Download | GET   | `permissionsreport/{id}/download` | Download the json results of a permissions report        |

</details>

<details>
<summary>YAML-пайплайни — 4 з 10</summary>

| Група     | Метод | Шлях                                               | Що робить                                                                         |
| --------- | ----- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| Logs      | GET   | `pipelines/{pipelineId}/runs/{runId}/logs`         | Get a list of logs from a pipeline run.                                           |
| Logs      | GET   | `pipelines/{pipelineId}/runs/{runId}/logs/{logId}` | Get a specific log from a pipeline run                                            |
| Pipelines | GET   | `pipelines`                                        | Get a list of pipelines.                                                          |
| Preview   | POST  | `pipelines/{pipelineId}/preview`                   | Queues a dry run of the pipeline and returns an object containing the final yaml. |

</details>

<details>
<summary>Кастомізація процесів — 4 з 57</summary>

| Група                     | Метод | Шлях                                                                                                     | Що робить                                                              |
| ------------------------- | ----- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Fields                    | GET   | `work/processes/{processId}/workItemTypes/{witRefName}/fields/{fieldRefName}`                            | Returns a field in a work item type.                                   |
| Work Item Types Behaviors | GET   | `work/processes/{processId}/workitemtypesbehaviors/{witRefNameForBehaviors}/behaviors`                   | Returns a list of all behaviors for the work item type of the process. |
| Work Item Types Behaviors | PATCH | `work/processes/{processId}/workitemtypesbehaviors/{witRefNameForBehaviors}/behaviors`                   | Updates a behavior for the work item type of the process.              |
| Work Item Types Behaviors | GET   | `work/processes/{processId}/workitemtypesbehaviors/{witRefNameForBehaviors}/behaviors/{behaviorRefName}` | Returns a behavior for the work item type of the process.              |

</details>

<details>
<summary>Пошук — 3 з 6</summary>

| Група                  | Метод | Шлях                                      | Що робить                                      |
| ---------------------- | ----- | ----------------------------------------- | ---------------------------------------------- |
| Package Search Results | POST  | `search/packagesearchresults`             | Provides a set of results for the search text. |
| Repositories           | GET   | `search/status/repositories/{repository}` | Provides status of Repository.                 |
| Tfvc                   | GET   | `search/status/tfvc`                      | Provides status of TFVC Repository.            |

</details>

<details>
<summary>Розширення — 1 з 5</summary>

| Група                | Метод | Шлях                                                                                      | Що робить                                                              |
| -------------------- | ----- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Installed Extensions | POST  | `extensionmanagement/installedextensionsbyname/{publisherName}/{extensionName}/{version}` | Install the specified extension into the account / project collection. |

</details>

<details>
<summary>Профіль — 1 з 1</summary>

| Група    | Метод | Шлях                    | Що робить            |
| -------- | ----- | ----------------------- | -------------------- |
| Profiles | GET   | `profile/profiles/{id}` | Gets a user profile. |

</details>

<details>
<summary>Права доступу — 1 з 9</summary>

| Група       | Метод | Шлях                                 | Що робить                                                                                                     |
| ----------- | ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Permissions | POST  | `security/permissionevaluationbatch` | Evaluates multiple permissions for the calling user. Note: This method does not aggregate the results, nor d… |

</details>

<details>
<summary>Ролі на ресурсах — 1 з 7</summary>

| Група           | Метод | Шлях                                                                    | Що робить |
| --------------- | ----- | ----------------------------------------------------------------------- | --------- |
| Roleassignments | PATCH | `securityroles/scopes/{scopeId}/roleassignments/resources/{resourceId}` |           |

</details>

## Нерозпізнане

Виклики в коді, які генератор не зміг прив'язати до операції специфікації. Це або API поза специфікацією (Analytics OData, Project Analysis, `connectionData`), або прогалина в евристиці — тоді її варто виправити в скрипті.

- `connectionData` (auth.ts)
- `featuremanagement/featurestates/{}/{}` (feature-management.ts)
- `featuremanagement/featurestatesforscope/{}/{}/{}/{}` (feature-management.ts)
- `wit/$batch` (work-items.ts)

- Методи `azure-devops-node-api` без відповідної операції: `deleteField`, `getAgentRequestsForAgent`, `getFileDiffs`, `getGitRepositoriesActivityMetrics`, `getProjectActivityMetrics`, `getProjectCollections`, `getProjectLanguageAnalytics`, `getRepositoryActivityMetrics`, `undeleteTaskGroup`, `updateAutomationRule`.

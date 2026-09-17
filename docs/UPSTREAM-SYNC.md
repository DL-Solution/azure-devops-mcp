# Upstream sync log

This fork does not merge `microsoft/azure-devops-mcp` wholesale. In July 2026 upstream consolidated its tools — around 90 fine-grained tools became about 30 dispatch tools that take an `action` parameter (`wit_work_item`, `repo_pull_request`, `pipelines_write`, …). The fork keeps its fine-grained tools: its presets, `instructions`, name-based annotations, generated `TOOLSET.md` and every production tool name depend on them. Upstream fixes are therefore **ported by intent** into the fork's tools rather than cherry-picked.

To review the next batch, list what upstream added after the last reviewed commit:

```bash
git remote add upstream https://github.com/microsoft/azure-devops-mcp.git   # once
git fetch upstream
git log --reverse --format='%h %cs %s' <last reviewed>..upstream/main
```

Then record a decision for each commit below and move the marker. You rarely need to run that by hand: the weekly `Upstream watch` workflow keeps an `upstream-sync` issue with exactly this list, and closes it once the marker catches up. While Issues are disabled for the repository, the list lands in the workflow run's summary instead, and the run fails whenever there is something to review.

## Last reviewed

`e24cc98` — 2026-09-16, _Add tool annotations and configure tools accordingly (#1607)_. Reviewed 2026-09-17: 92 upstream commits since the merge base `1cd5d89`.

## Decisions

**Ported** — the behaviour is in the fork, adapted to its tools.

| Upstream                         | Change                                                             | Where in the fork                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| #1557                            | PAT sent only to Azure DevOps hosts over https                     | `installPatFetchInterceptor` in `src/auth.ts`, extended to the fork's `*.dev.azure.com` sibling hosts             |
| #1570, #1553, #1563              | Every tool response spotlighted as untrusted content               | `configureToolsWithContentSafety` in `src/tools.ts`, `wrapExternalToolResponse` in `src/shared/content-safety.ts` |
| #1570                            | Bypassing PR policies needs an explicit `bypassPolicy`             | `repo_update_pull_request`                                                                                        |
| #1369                            | Wiki URL must belong to the connected organization                 | `wiki_get_page_content`, `getOrgFromUrl` in `src/utils.ts`                                                        |
| #1552                            | Text work item attachments spotlighted                             | `wit_get_work_item_attachment`                                                                                    |
| #1516                            | Explicit `--tenant` wins over the looked-up tenant                 | `src/index.ts`                                                                                                    |
| #1542                            | CLI args without yargs `hideBin` (Electron hosts); `open` declared | `getCliArgs` in `src/utils.ts`, `package.json`                                                                    |
| #1420                            | `advsec_get_alerts` no longer loses secret alerts                  | cherry-picked                                                                                                     |
| #1370                            | `commentType` on PR comments and threads                           | cherry-picked                                                                                                     |
| #1270                            | Clearer offsets in `repo_create_pull_request_thread`               | cherry-picked                                                                                                     |
| #1402, #1411                     | Markdown in test case steps, lowercase HTML tags                   | cherry-picked / ported                                                                                            |
| #1415                            | Wiki page links on work items                                      | cherry-picked into `wit_add_artifact_link`                                                                        |
| #1446                            | `multilineFieldsFormat` for Markdown fields of any length          | `wit_create_work_item`, `wit_update_work_items_batch`                                                             |
| #1469                            | `hyperlink` links                                                  | `wit_work_items_link`, `wit_work_item_unlink`                                                                     |
| #1495                            | `@<email>` mentions in comments                                    | `wit_add_work_item_comment`, `wit_update_work_item_comment`                                                       |
| #1523                            | A Bug child's description goes to Repro Steps only                 | `wit_add_child_work_items`                                                                                        |
| #1526                            | JSON Patch `test` on `/rev`, 409/412 named in errors               | `wit_update_work_item`                                                                                            |
| #1513                            | Iteration context for PR threads                                   | `repo_create_pull_request_thread`, `repo_get_pull_request_by_id`                                                  |
| #1568                            | Editing a comment in a PR thread                                   | new tool `repo_update_pull_request_comment`                                                                       |
| #1548 and other dependency bumps | SDK 1.30, identity, msal, prettier                                 | `package.json`                                                                                                    |

**Not taken**, with the reason.

| Upstream                                                             | Change                                                       | Why not                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1423, #1428, #1431, #1432, #1435, #1443, #1529, #1534, #1589, #1418 | Tool consolidation and refactors built on it                 | Would rename or remove most production tool names; see the top of this page                                                                                                                                                                                    |
| #1607                                                                | Annotations for consolidated tools                           | The fork already derives annotations from tool names (`src/shared/tool-registration.ts`)                                                                                                                                                                       |
| #1476, #1463, #1518, #1455, #1324                                    | README/TOOLSET wording for the consolidated tool set         | Docs describe tools the fork does not have                                                                                                                                                                                                                     |
| #1498                                                                | Reorder backlog work items                                   | The fork already has `work_reorder_backlog_work_items`                                                                                                                                                                                                         |
| #1360                                                                | `repo_search_commits` moved to the Search API                | Checked on dl-sol (2026-09-17): the Search API answers `count: 0, infoCode: 6` for commits and code alike, while the Git API returns the same commits. The port would turn a working tool into one that finds nothing wherever the search index is unavailable |
| #1538, #1565                                                         | MSAL auth broker (`@azure/msal-node-extensions`, keytar)     | Windows/macOS broker for local interactive sign-in; the fork runs on Linux and ACA                                                                                                                                                                             |
| #1439                                                                | `server.json` remotes                                        | Registry entry for Microsoft's hosted server                                                                                                                                                                                                                   |
| #1566, #1383, #1468, #1588, #1422, #1514, #1467                      | Release, version and CI housekeeping for upstream's pipeline | The fork has its own release and CI                                                                                                                                                                                                                            |
| #1567                                                                | Extra tests for upstream's search module                     | Tests upstream code paths; the fork's search tests cover its own                                                                                                                                                                                               |

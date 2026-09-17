#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation.
# Licensed under the MIT License.

# Reports upstream commits that nobody has reviewed yet.
#
# The fork ports upstream changes by intent (see docs/UPSTREAM-SYNC.md), and
# that document records the last upstream commit reviewed. Left alone, the gap
# grows silently — it reached 92 commits once. This lists every upstream commit
# after the recorded one and keeps a single GitHub issue in step with it:
# opened or refreshed while the list is non-empty, closed once it is empty.
#
# Usage:  scripts/upstream-watch.sh            (needs gh and GH_TOKEN)
#         DRY_RUN=1 scripts/upstream-watch.sh  (print the issue body, touch nothing)

set -euo pipefail

UPSTREAM_REPO="microsoft/azure-devops-mcp"
SYNC_DOC="docs/UPSTREAM-SYNC.md"
ISSUE_TITLE="Upstream sync: unreviewed commits in ${UPSTREAM_REPO}"
LABEL="upstream-sync"

# The marker is the first backticked SHA after the "## Last reviewed" heading.
last_reviewed=$(awk '/^## Last reviewed/{found=1; next} found && match($0, /`[0-9a-f]{7,40}`/){print substr($0, RSTART+1, RLENGTH-2); exit}' "$SYNC_DOC")
if [[ -z "$last_reviewed" ]]; then
  echo "No last reviewed commit found under '## Last reviewed' in $SYNC_DOC" >&2
  exit 1
fi

# Commit history only, no file contents, so the fetch stays small.
git fetch --quiet --filter=blob:none "https://github.com/${UPSTREAM_REPO}.git" main
upstream_head=$(git rev-parse FETCH_HEAD)

if ! git merge-base --is-ancestor "$last_reviewed" "$upstream_head" 2>/dev/null; then
  echo "Last reviewed commit $last_reviewed is not in upstream main — fix the marker in $SYNC_DOC" >&2
  exit 1
fi

mapfile -t commits < <(git log --reverse --format='%H%x09%cs%x09%s' "${last_reviewed}..${upstream_head}")
dependency_pattern='^\[dependencies\]|^chore\(deps\)|^Bump |^\[dependencies\]:'

existing_issue=""
if [[ -z "${DRY_RUN:-}" ]]; then
  existing_issue=$(gh issue list --state open --label "$LABEL" --search "\"$ISSUE_TITLE\" in:title" --json number --jq '.[0].number // empty')
fi

if [[ ${#commits[@]} -eq 0 ]]; then
  echo "Up to date with ${UPSTREAM_REPO} at ${upstream_head:0:7}."
  if [[ -n "$existing_issue" ]]; then
    gh issue close "$existing_issue" --comment "Nothing left to review: ${SYNC_DOC} is at upstream ${upstream_head:0:7}."
  fi
  exit 0
fi

features=0
dependencies=0
rows=""
for line in "${commits[@]}"; do
  IFS=$'\t' read -r sha date subject <<<"$line"
  if [[ "$subject" =~ $dependency_pattern ]]; then
    kind="dependencies"
    dependencies=$((dependencies + 1))
  else
    kind="**review**"
    features=$((features + 1))
  fi
  # Pipes would break the Markdown table.
  rows+="| [\`${sha:0:7}\`](https://github.com/${UPSTREAM_REPO}/commit/${sha}) | ${date} | ${kind} | ${subject//|/\\|} |"$'\n'
done

body=$(
  cat <<EOF
Upstream has **${#commits[@]}** commits after the last reviewed one (\`${last_reviewed:0:7}\`): **${features}** to review, ${dependencies} dependency bumps.

The fork ports upstream changes by intent rather than merging them. For each commit, record in [\`${SYNC_DOC}\`](../blob/main/${SYNC_DOC}) whether it was ported (and where) or not taken (and why), then move the **Last reviewed** marker to \`${upstream_head:0:7}\`. This issue refreshes every week and closes itself once the marker catches up.

| Commit | Date | Kind | Subject |
| --- | --- | --- | --- |
${rows}
EOF
)

if [[ -n "${DRY_RUN:-}" ]]; then
  echo "$body"
  exit 0
fi

gh label create "$LABEL" --description "Upstream commits awaiting review" --color "0E8A16" --force >/dev/null
if [[ -n "$existing_issue" ]]; then
  gh issue edit "$existing_issue" --body "$body" >/dev/null
  echo "Refreshed issue #${existing_issue}: ${#commits[@]} commits (${features} to review)."
else
  gh issue create --title "$ISSUE_TITLE" --label "$LABEL" --body "$body"
fi

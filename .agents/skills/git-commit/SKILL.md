---
name: git-commit
description: Create focused Git commits and write or improve commit messages using Conventional Commits. Use when asked to commit staged or unstaged changes, suggest a commit message, split work into meaningful commits, or improve an existing message.
---

# Git Commit

Use Conventional Commits unless the user explicitly requests another format. Follow repository conventions for scopes, capitalization, issue references, body formatting, and commit granularity within that format.

## Understand and select the changes

For repository work, inspect `git status`, `git diff`, `git diff --staged`, and recent history such as `git log -10 --oneline`. Inspect relevant untracked files before including them; ordinary diffs do not show their contents. Determine intent and observable effect from the actual changes, not filenames alone. For message-only requests with a supplied diff, use that evidence without requiring repository access.

Prefer one logical change per commit. Separate unrelated changes when they can stand independently without invalid or misleading intermediate states. Related implementation, tests, and documentation can belong in one commit.

Honor the requested selection, including requests to commit only staged changes. Do not silently include unrelated user work or disturb unrelated staged changes. Stage specific paths or hunks when needed; avoid blanket staging when unrelated work exists. If the requested selection cannot be determined from context, ask a focused question before committing.

A request only to suggest or improve a message does not authorize staging, committing, or amending history. Do not rewrite published history unless explicitly requested, use destructive Git commands to manufacture a clean state, or push merely because a commit was requested.

## Write the message

```text
<type>[optional scope][optional !]: <description>

[optional body]

[optional footer(s)]
```

Choose the most precise type according to intent:

| Type | Use |
| --- | --- |
| `feat` | New user-facing or developer-facing capability |
| `fix` | Correction of incorrect behavior |
| `docs` | Documentation-only changes |
| `style` | Formatting or other code style changes without behavioral effects; not UI or CSS features or fixes |
| `refactor` | Code restructuring without new functionality or an observable bug fix |
| `perf` | Performance improvements |
| `test` | Test changes without production behavior changes |
| `build` | Build systems or dependencies |
| `ci` | CI/CD configuration and automation |
| `chore` | Maintenance that fits no more precise type |
| `revert` | Reverting previous commits; reference verified reverted hashes in the body or a `Refs:` footer |

Use a short scope naming the affected component when it adds context, following existing scope conventions. Enclose it in parentheses: `fix(parser): handle empty input`.

The description follows the colon and space, describes the concrete change, and preferably uses imperative wording. Avoid vague descriptions such as “update stuff” and a terminal period unless repository convention uses one.

Add a body only when useful to explain motivation, before/after behavior, tradeoffs, or migration. Separate it from the subject with a blank line; do not merely repeat the subject.

Separate footers with a blank line from the preceding body or subject. Use trailer-style tokens such as `Refs: #123` or `Reviewed-by: Name`; issue-reference syntax such as `Refs #123` is also valid. Tokens use hyphens instead of spaces, except `BREAKING CHANGE`. Never invent issue IDs, reviewers, co-authors, ticket references, or breaking-change details.

### Breaking changes and release impact

Mark breaking changes with `!` immediately before the colon, an uppercase `BREAKING CHANGE:` footer, or both. `BREAKING-CHANGE:` is an equivalent footer token. When using only `!`, ensure the description communicates the break; add migration context when known and useful.

```text
feat(api)!: remove legacy authentication endpoint

BREAKING CHANGE: clients must use the /v2/auth endpoint.
```

Any type can carry a breaking change. The Conventional Commits release mapping is `fix` → PATCH, `feat` → MINOR, breaking change → MAJOR; other types have no implicit SemVer effect. Do not promise that a release will occur or change versions unless requested; actual release automation controls that behavior. Apart from uppercase breaking-change tokens, Conventional Commit elements are case-insensitive; prefer repository casing, normally lowercase types.

## Create and verify the commit

Before committing, review the final staged diff and message together: selected changes only, accurate type and scope, concrete description, supported metadata, and explicit breaking changes where applicable.

For a simple subject, use `git commit -m "fix(auth): prevent token refresh loop"`. For complex messages, use a temporary message file with `git commit -F <file>` or the configured editor; preserve literal text and blank lines and avoid shell expansion of message content.

If a hook or commit command fails, inspect the failure and repository state before retrying. Do not bypass hooks or broaden the change just to force a commit through. If hooks modify files, review the changes before staging them. Stop and report a blocker when resolving it requires work outside the authorized scope.

After a successful commit, verify the resulting commit and remaining working tree, for example with `git show --stat --oneline HEAD` and `git status --short`. Report the commit hash and subject, with any material remaining changes or verification limitations. Do not claim tests passed unless they were run successfully.

For message-only requests, return only the suggested message, including a body or footers when warranted. If evidence is insufficient to write an accurate message, request the missing diff or change summary rather than fabricate one.

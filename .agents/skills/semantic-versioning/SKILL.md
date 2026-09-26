---
name: semantic-versioning
description: Apply Semantic Versioning 2.0.0 when choosing or updating release versions, assessing public API compatibility for a version bump, validating version strings, or comparing version precedence. Use for versioning tasks, not automatically for every code change.
---

# Semantic Versioning

Determine version impact from the declared public API and consumer compatibility. Commit labels, diff size, implementation complexity, and branch names are evidence neither of compatibility nor of the required bump.

## Choose a release version

Establish the current version, intended release baseline, relevant changes, and project release policy before calculating a bump. Identify the public contract from both code and documentation: exports, endpoints, CLI behavior, configuration, schemas, events, protocols, and promised environment compatibility can all be public API.

Compare the old and new contract from an existing consumer's perspective. An internal rewrite is not inherently breaking; a documented behavior or configuration change can be breaking even with unchanged function signatures. Do not silently invent a public API or compatibility guarantee. When evidence is incomplete, state the assumption that determines the version, or ask for the missing information if necessary to apply a change.

For stable releases at or after `1.0.0`, choose the highest required impact:

| Change | Required increment | Example from `3.7.4` |
| --- | --- | --- |
| Backward-incompatible public API change | MAJOR; reset MINOR and PATCH | `4.0.0` |
| Backward-compatible public functionality or public API deprecation | MINOR; reset PATCH | `3.8.0` |
| Backward-compatible bug fix | PATCH | `3.7.5` |

A major release may include features and fixes; a minor release may include fixes. Deprecation means the old functionality remains compatible; removing it is normally breaking. Calling a change a bug fix does not justify PATCH if it changes the public contract incompatibly.

For internal, documentation-only, or build changes without these impacts, follow the project's release policy; do not invent a mandatory bump. SemVer permits a minor increment for substantial private-code improvements. Distinguish a permitted project choice from a SemVer requirement.

### Initial development and prereleases

- `0.y.z` denotes initial development with an unstable API. Check the project's pre-1.0 policy before choosing the bump. A breaking change does not automatically require `1.0.0`; absent a policy, label any proposed convention as an assumption.
- `1.0.0` declares the public API stable. Treat that transition as a stability decision.
- A prerelease is unstable and may not satisfy the guarantees of its associated normal release. Determine the intended target release and project channel convention before advancing it. Promoting `3.0.0-rc.1` to the normal release yields `3.0.0`; do not automatically bump again.
- Names such as `alpha`, `beta`, and `rc` are conventions, not special SemVer phases.

## Validate syntax

A strict SemVer string has the form `MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`.

- MAJOR, MINOR, and PATCH are non-negative ASCII integers without leading zeroes, except the number `0` itself.
- Prerelease and build sections contain one or more nonempty dot-separated identifiers. Each identifier uses only ASCII letters, digits, and hyphens.
- Numeric prerelease identifiers must not have leading zeroes. Numeric build identifiers may have leading zeroes.
- The prerelease section follows `-`; build metadata follows `+` and comes last.
- `v1.2.3` is a possible tag convention, not a strict SemVer string. Distinguish a tag prefix from the underlying version. Likewise, version ranges and ecosystem-specific version syntax are not strict SemVer strings.

Valid: `0.1.0`, `1.2.3-alpha.1`, `1.2.3+001`, `1.2.3-rc.2+sha.abc123`.

Invalid: `1`, `1.2`, `1.2.3.4`, `01.2.3`, `1.02.3`, `1.2.03`, `1.2.3-`, `1.2.3-alpha..1`, `1.2.3-alpha.01`.

Use strict SemVer behavior when selecting a validator; some package-manager parsers accept loose syntax or implement different version standards.

## Compare precedence

Validate inputs first. Compare MAJOR, MINOR, and PATCH numerically, in that order. For equal core versions:

1. A normal release has higher precedence than a prerelease.
2. Compare prerelease identifiers from left to right until one differs.
3. Compare two numeric identifiers numerically; a numeric identifier is lower than a nonnumeric identifier.
4. Compare nonnumeric identifiers lexically using ASCII ordering, case sensitively.
5. If all shared identifiers match, the longer identifier list has higher precedence.

Ignore build metadata entirely for precedence. `1.4.2+build.100` and `1.4.2+build.200` have equal precedence, though they are different version strings.

```text
1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta
< 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11
< 1.0.0-rc.1 < 1.0.0
```

Do not use string comparison for numeric components (`1.10.0 > 1.9.0`) or infer ordering from the perceived maturity of channel names.

## Apply a requested version update

Identify the authoritative version source and required synchronized files, including generated files and lockfiles. Respect independent package versions in multi-package repositories. Use the repository's existing versioning tooling where appropriate; avoid manually editing generated files unless required by its workflow.

Change versions only when requested. A request to recommend or validate a version does not imply updating files or publishing a release. Avoid global replacement: old versions may legitimately appear in changelogs, migration guides, examples, and fixtures.

Released contents are immutable. Never replace a published release's contents under the same version; modifications require a new version. Build metadata is not a substitute for the required compatibility bump. A local version update does not itself authorize tagging or publishing.

After editing, validate the resulting syntax, lower-component resets, and required version consistency. Inspect the diff for unrelated replacements and run relevant repository version checks if available.

Report the resulting version and the decisive compatibility evidence concisely. State material assumptions, especially an uncertain public contract or pre-1.0 policy. For applied changes, summarize the files updated and validation performed.

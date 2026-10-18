---
name: verify
description: Prove a Mercury app, API, database, authentication, CLI, or template change in the real product. Route app changes to the Cloudflare Worker, Neon, and Neon Auth driver, and template changes to the packed create-mercury terminal driver. Require both when a change ships in the starter.
---

# Verify

Read the selected driver's skill and feature map before running it.

| Change                                                                 | Driver                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/web`, `apps/api`, `packages/ui`, migrations, auth, or deployment | [verify-mercury](../verify-mercury/SKILL.md).               |
| `cli`, installed skills, root scripts, or template configuration       | [verify-create-mercury](../verify-create-mercury/SKILL.md). |
| An app change that also ships in generated projects                    | Both drivers.                                               |

Start app verification with `.agents/skills/verify-mercury/scripts/run.sh --public`. It checks the built Worker's public routes, headers, asset caching, and anonymous authorization without credentials. Run the helper without a flag for real Neon Postgres and Neon Auth sessions. Use `--deployed` for an owned workers.dev HTTPS Worker, Hyperdrive, restricted SQL runtime role, UI writes, and deletion readbacks. Read [verify-mercury](../verify-mercury/SKILL.md) for the required Neon and Cloudflare configuration and manual real-inbox checks. Missing prerequisites or incomplete checks leave proof missing.

For Cloudflare Vite plugin, Miniflare, or preview transport changes, run `node --test scripts/preview-transport.test.mjs`, then `pnpm build` and `pnpm test:preview-transport`. The exact-version Miniflare patch mitigates the local transport defect. Passing those checks does not establish that the upstream issue is fixed.

Pack the CLI with `.agents/skills/verify-create-mercury/scripts/pack.sh`, then use its terminal driver. Mark new template files with `git add -N` before packing. Only git-tracked template files ship. Repository-only `.audit`, `docs`, CLI source, and verification skills stay out of the template.

Prove browser behavior through UI actions, capture states before and after, inspect HTTP responses and actual Neon rows, and retain cleanup evidence. Check email delivery manually with actual codes from a real inbox. Keep passwords, tokens, message bodies, and OTP values out of evidence. A workers.dev pass does not prove custom-domain DNS or TLS. Live `PASS` markers require successful behavior and owned-resource cleanup.

Prove CLI behavior from the final packed tarball, generated files, installed dependencies, and Git history. Repack and rerun the terminal driver after the last template change. Never treat compile success or a skipped live test as an end-to-end pass.

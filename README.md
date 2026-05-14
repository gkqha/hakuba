# Hakuba

个人学习积分计划本。SvelteKit 前端部署在 Cloudflare Pages，主库使用 Cloudflare D1，本地 IndexedDB 作为缓存和离线兜底。

## Local

```sh
bun install
cp .dev.vars.example .dev.vars
bun run dev
```

## D1

创建数据库：

```sh
bunx wrangler d1 create hakuba
```

把 Cloudflare 返回的 D1 database id 写入 `wrangler.jsonc`。binding name 必须是 `DB`。如果仓库里只有 `wrangler.example.jsonc`，先复制一份：

```sh
cp wrangler.example.jsonc wrangler.jsonc
```

应用 schema：

```sh
bun run db:migrate:remote
```

本地 Pages Functions 调试：

```sh
bun run db:migrate:local
bun run pages:dev
```

本地调试口令是 `local-dev-passcode`。本地 Pages dev 会连本地 D1，不会直接写远端 D1。

## Cloudflare Pages

Build command:

```sh
bun run build
```

Build output directory:

```sh
.svelte-kit/cloudflare
```

Deploy command:

```sh
bun run deploy
```

Set `CLOUDFLARE_PAGES_PROJECT_NAME` to the exact Pages project name from Cloudflare. The deploy script uses branch `main` by default so it reads the Production variables shown in Cloudflare. If the Pages production branch is different, set `CLOUDFLARE_PAGES_BRANCH` to that branch name.

Do not set the deploy command to `npx wrangler deploy`. That command starts Wrangler's Workers auto-configuration flow, which rewrites the build step in CI and expects a generated `worker-configuration.d.ts` file. This project builds Pages output, so the deploy step must use `wrangler pages deploy .svelte-kit/cloudflare --project-name <pages-project-name> --branch <production-branch>`.

The `CLOUDFLARE_API_TOKEN` used by this command must include account-level Cloudflare Pages edit/write permission. A token that only has Workers permissions can log in but will fail on `/pages/projects/hakuba` with `Authentication error [code: 10000]`.

环境变量和绑定：

- `APP_PASSCODE`: 私人口令，作为单人使用的轻量保护。
- `DB`: D1 database binding，指向 `hakuba` 数据库。

## Backup

页面里可以导出 `.xlsx` 做阅读归档，也可以导出 `.json` 做完整恢复备份。JSON 才是可导入恢复格式。

## Verification

```sh
bun run check:ref
bun run lint
bun run check
bun run build
```

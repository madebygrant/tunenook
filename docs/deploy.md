# TuneNook: Cloudflare publishing via GitHub

As of 2026-10-20.

## Overview

Use Cloudflare Workers Builds: connect the GitHub repo once in the Cloudflare dashboard, and every push to `main` builds and deploys TuneNook with no tokens or workflow files in the repo. A GitHub Actions workflow (Option B) is the fallback if you want tests to gate each deploy inside GitHub.

TuneNook deploys as a Worker with static assets only. `wrangler.jsonc` names the Worker `tunenook`, serves `./dist`, and falls back to `index.html` for unknown paths (`single-page-application`). There is no Worker script, because music never leaves the device.

Either way, each deploy does the same three things:

1. Install dependencies with pnpm from `pnpm-lock.yaml`.
2. Build with `pnpm run build` (`tsc -b && vite build`), which writes `dist/` including `sw.js` and `_headers`.
3. Upload `dist/` with `wrangler deploy`.

## Before you start

The repo already has everything a deploy needs except a pinned pnpm version. Check these first:

- [ ] Cloudflare account with access to Workers & Pages.
- [ ] Repo pushed to GitHub at `madebygrant/tunenook`, with `main` as the branch you deploy from.
- [ ] `pnpm run deploy` works from your machine (needs `wrangler login` once). If a local deploy fails, fix that first; CI runs the same commands.
- [ ] Note your local versions: pnpm 11.1.2 and Node 24, with lockfile format 9.0.

| Tool | Local | Cloudflare build image default | Action |
| --- | --- | --- | --- |
| pnpm | 11.1.2 | 10.11.1 | Set `PNPM_VERSION=11.1.2` (Option A) or pin it in the workflow (Option B) |
| Node | 24.15 | 24.18.0 | None needed |

Pin pnpm because `pnpm-workspace.yaml` uses `allowBuilds` to let `esbuild` and `workerd` run their install scripts, and pnpm 10.11 may not read that setting.

Already in the repo, no changes needed:

- `wrangler.jsonc`: Worker `tunenook`, assets from `./dist`, single-page fallback.
- `public/_headers`: CSP, plus `no-cache` on `sw.js`, `workbox-*.js`, the manifest and `/`, and long-lived caching on `/assets/*`.
- `package.json`: `build` and `deploy` scripts.

## Option A: Workers Builds (recommended)

Cloudflare watches `main`, builds in its own image, and deploys; nothing is added to the repo. Setup takes about 10 minutes.

1. Open the Cloudflare dashboard and go to **Workers & Pages**.
2. Pick the path that matches your account:
   - **`tunenook` already exists** (you've run `pnpm run deploy` before): select it, then **Settings** > **Builds** > **Connect**.
   - **No Worker yet**: select **Create application**, then **GitHub**.
3. Authorize the Cloudflare GitHub app when prompted. Grant it access to `madebygrant/tunenook` only, not all repositories.
4. Select the `tunenook` repository.
5. Fill in the build settings from the table below, then select **Save and Deploy** (new Worker) or save (existing Worker).
6. Push a commit to `main`, or retry the first build, and watch the log under the Worker's **Deployments** tab.

| Field | Value |
| --- | --- |
| Project / Worker name | `tunenook` (must match `name` in `wrangler.jsonc`, or the build fails) |
| Git branch | `main` |
| Build command | `pnpm test && pnpm run build` |
| Deploy command | `npx wrangler deploy` (the default) |
| Preview command | Leave the default |
| Root directory | Leave empty (repo root) |
| API token | Leave the auto-generated one |
| Build variables | `PNPM_VERSION` = `11.1.2` |

The build command runs the 242 tests before building, so a failing test stops the deploy. Drop `pnpm test &&` if you want faster deploys.

Pushes to other branches create preview versions instead of replacing the live site. Their URLs appear in the Worker's **Previews** section.

## Option B: GitHub Actions

Use this if you want the build, tests and deploy log in GitHub, or you plan to add other CI steps. It needs a Cloudflare API token and one workflow file. Don't set up both options, or each push deploys twice.

1. In Cloudflare, go to **Manage account** > **Account API tokens** > **Create token**, and start from the **Edit Cloudflare Workers** template. Scope it to your account only.
2. Copy your account ID from the Workers & Pages overview page.
3. In GitHub, open the repo's **Settings** > **Secrets and variables** > **Actions** and add two repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Add the workflow below as `.github/workflows/deploy.yml` and push it to `main`.
5. Watch the run under the repo's **Actions** tab.

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with:
          version: 11.1.2
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm test
      - run: pnpm run build
      - uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

The build step runs before the deploy, so `dist/` already exists when Wrangler uploads it. Wrangler is a dev dependency, so the action uses the installed copy. `workflow_dispatch` adds a **Run workflow** button for redeploying without a commit.

## Custom domain and headers

The site works at `tunenook.<your-subdomain>.workers.dev` as soon as the first deploy finishes. A custom domain is optional.

To add one, the domain's DNS must already be on Cloudflare:

1. Open the `tunenook` Worker, then **Settings** > **Domains & Routes** > **Add** > **Custom domain**.
2. Enter the hostname, for example `music.example.com`. Cloudflare creates the DNS record and certificate.
3. Optional: turn off the `workers.dev` route on the same screen so the app has one address. An installed iPhone PWA is tied to the address it was installed from, so pick the final domain before installing.

`public/_headers` is copied into `dist/` by Vite and applied by Cloudflare on every deploy, with no dashboard settings. Check it took effect after the first deploy:

```sh
curl -sI https://<your-domain>/ | grep -iE 'content-security|cache-control'
curl -sI https://<your-domain>/sw.js | grep -i cache-control
```

Both should show `Cache-Control: no-cache`, and `/` should also show the `Content-Security-Policy` line.

## Verify the deploy

A deploy is good when the live site serves the new build and an installed copy picks it up. Run through this after the first automated deploy:

- [ ] The build log ends with a successful `wrangler deploy` and lists the uploaded assets.
- [ ] The site loads, and the browser console shows no CSP errors.
- [ ] DevTools > Application > Service workers shows `sw.js` active, and the page works offline after one load.
- [ ] With music paused and no import running, the app shows "TuneNook has an update." after the next deploy. **Reload** loads the new version.
- [ ] On the iPhone home-screen app: open it, wait a few seconds, then close and reopen it. The new version should load. If it doesn't, check `Cache-Control: no-cache` on `sw.js` (see Custom domain and headers).

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Build fails: Worker name doesn't match | Dashboard Worker isn't named `tunenook` | Connect the existing `tunenook` Worker, or rename `name` in `wrangler.jsonc` to match |
| `ERR_PNPM_LOCKFILE_*` or install warnings about `allowBuilds` | Build image uses pnpm 10.11.1 | Set `PNPM_VERSION=11.1.2` (A) or `version: 11.1.2` (B) |
| `Cannot find module` during build | Dependencies weren't installed before the build command | Option A: prefix the build command with `pnpm install --frozen-lockfile &&` |
| Wrangler: `Authentication error [code: 10000]` | Token is missing Workers edit rights or is scoped to the wrong account | Recreate it from the **Edit Cloudflare Workers** template and update the secret |
| Deploy succeeds, but the site is blank or 404 | `dist/` wasn't built before deploy | Make sure the build runs before `wrangler deploy` |
| Each push deploys twice | Both options are set up | Disconnect Builds (**Settings** > **Builds** > **Disconnect**) or delete the workflow |
| Installed app stays on the old version | `sw.js` cached, or music was playing | Check `sw.js` headers; pause playback so the pending reload can run |

## Sources

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Workers Builds build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [GitHub Actions for Workers](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [cloudflare/wrangler-action](https://github.com/cloudflare/wrangler-action)

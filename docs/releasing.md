# Publishing and releases

Repository: `verisoftCZ/developer-power-tools`. Marketplace publisher: `verisoftcz`.
The extension id is **verisoftcz.developer-power-tools**. GitHub organization names and Marketplace publisher ids are separate identities; do not change the publisher to match capitalization in the GitHub URL.

## First GitHub push

Create an empty **public** repository named `developer-power-tools` under `verisoftCZ` (do not initialize another README or license). From this repository root:

```sh
git remote -v
git push -u origin main
```

The local `origin` is prepared as `https://github.com/verisoftCZ/developer-power-tools.git`. Change it with `git remote set-url origin ...` if you choose another location, and update package.json, documentation links and the release metadata checker consistently. GitHub authentication is managed by your Git client; do not commit tokens.

Enable Actions, Dependabot alerts/security updates and private vulnerability reporting in repository settings. Protect `main` using a ruleset requiring pull-request review and the CI checks after their first run. Configure a GitHub environment named **marketplace** with required reviewers and restrict it to version tags. The review requirement must be configured in GitHub; the YAML file alone does not create it. Review the MIT license, support policy and third-party notices before making the repository public.

## Build an uploadable VSIX

```sh
npm ci
npm run verify
npx playwright install chromium
npm run test:e2e
npm run test:integration
npm run package
node scripts/checksums.mjs
```

On headless Linux run integration tests with `xvfb-run -a`. Upload `developer-power-tools-<version>.vsix` through the `verisoftcz` publisher's [Marketplace management page](https://marketplace.visualstudio.com/manage/publishers/verisoftcz). The manifest's publisher must be `verisoftcz`, which `npm run release:check` enforces. Packaging does not require Marketplace credentials.

Changing from the old local prototype publisher creates a different extension identity. Uninstall the old prototype before installing the Marketplace version to avoid duplicate commands. VS Code global recipe storage is scoped to that identity: export user recipes before uninstalling, then import them into the new extension. Workspace recipe files are independent of the publisher.

## Versioned GitHub releases

1. Update CHANGELOG.md and run `npm version patch --no-git-tag-version` (or explicitly select the version).
2. Run verification, commit the version and push `main`.
3. Create and push the matching tag, e.g. `git tag v0.1.5` and `git push origin v0.1.5`.
4. `release.yml` reruns CI, packages the tested source and creates a **draft** GitHub release with the VSIX and SHA256SUMS. Review notes and publish the draft when ready.

Tags must exactly match `v<package.json version>`. The release script checks the publisher, URLs, lockfile version, changelog and icon. CI artifacts retain the package for 14 days. Draft releases retain their uploaded assets independently of the temporary Actions artifacts. Do not overwrite a published version/tag; release a new version for fixes.

## Optional Marketplace trusted publishing

The manual `publish.yml` workflow tests the requested version tag and publishes the **same tested artifact**, after verifying its SHA-256. Configure a Trusted Publishing policy on the `verisoftcz` Marketplace publisher:

| Field        | Value                   |
| ------------ | ----------------------- |
| GitHub owner | `verisoftCZ`            |
| Repository   | `developer-power-tools` |
| Workflow     | `publish.yml`           |
| Environment  | `marketplace`           |

Follow [VS Code's trusted publishing instructions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing). The workflow requests an OIDC token and uses `vsce publish --oidc`; no publishing secret is stored in the repository. Setup of this policy and the environment is required before the workflow can publish. Workflow YAML has been reviewed locally; remote Actions and Marketplace authentication can only be verified after repository/publisher setup.

To publish, choose **Actions → Publish to VS Code Marketplace → Run workflow**, using the default branch and an existing matching version tag. A tag push alone does not publish to Marketplace.

# Web UI

- **Fast checks:** the stack's linter, type checker and unit runner, chained in one package script, for example `"check": "eslint . && tsc --noEmit && vitest run"` (Ruff, mypy and pytest for Python). Components and logic, no browser.
- **End-to-end:** Playwright Test (`npm init playwright@latest`). One spec file per user flow under `e2e/`, named after the flow (`checkout.spec.ts`). Run one spec with `npx playwright test e2e/checkout.spec.ts --reporter=line` (all browsers), or add `--project=chromium` for a quick run while writing it.
- **Browsers:** define `chromium`, `firefox` and `webkit` projects in `playwright.config`. A finished feature's specs run on all three. Tests run headless (Playwright's default); never set `headless: false` in the config.
- **Start the app from the config:** set `webServer` in `playwright.config` to the dev or preview server command and its URL, so every run tests a freshly started app.
- **Accessibility:** add `@axe-core/playwright` (by Deque, the makers of axe). In each flow spec, scan every page the flow visits and fail on serious and critical issues:
  ```ts
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter(v => ['serious', 'critical'].includes(v.impact!))).toEqual([]);
  ```
  A known issue the user decides to fix later goes in `.exclude()` or `.disableRules()` with a comment naming it, never by dropping the scan.
- **Stable specs:**
  - find elements by role, label or text (`getByRole('button', { name: 'Pay' })`), never by CSS classes or DOM paths
  - use Playwright's auto-waiting assertions (`await expect(locator).toBeVisible()`); never `waitForTimeout`, except inside the one helper the KB conventions name for a human tap's rhythm
  - each test creates the data it needs and depends on no other test
  - keep `retries: 0`, so a flaky test shows up instead of hiding
  - set `trace: 'retain-on-failure'`, so a failure leaves a trace to read instead of a re-run
- **Screenshot tests (opt-in):** `await expect(page).toHaveScreenshot()`. Baseline images are committed and named per browser and OS, and CI runs Linux, so the committed baselines are the Linux ones: generate them in CI or in Playwright's Docker image (Docker is an install, so it needs the user's yes). After an intended UI change, show the user the diff image from `test-results/`, and run `npx playwright test --update-snapshots` only on their yes.

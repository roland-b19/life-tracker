# Look at the running app

Read this only when the user asks Claude to look at the running app.

- **Web:** the desktop app's built-in browser. Read pages as text (`read_page`, `get_page_text`) and take a screenshot only for layout or visual questions. Use Claude in Chrome only when the user asks for it or the check needs their signed-in Chrome.
- **iOS (native or React Native):** the iOS Simulator tool, after the app is built.
- **API or CLI:** call it with `curl` or run the command; no browser needed.

If the look found a bug, capture it as a committed test (verify step 2) before fixing it, so it can't come back.

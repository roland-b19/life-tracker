# CLI, script or library

- **Fast checks:** the stack's linter and type checker, plus unit tests for the functions, chained in one command.
- **End-to-end (CLI or script):** run the real command as a subprocess in a temporary folder and check its exit code, stdout, stderr and the files it writes. One test file per command, named after it. Cover the error paths too: bad arguments, a missing file, no permission.
- **End-to-end (library):** a test that uses only the public API, the way a user's code would, from a fresh import.
- **Stable tests:** fixed inputs in the test's own temporary folder; no dependence on the machine's home folder, locale, time zone or the current time.

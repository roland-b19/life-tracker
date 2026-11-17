# HTTP API or backend

- **Fast checks:** the stack's linter and type checker, plus unit tests for the logic, chained in one command. No network, no database.
- **End-to-end:** start the real server on a free port with a throwaway database, send real HTTP requests, and check status codes, response bodies and the resulting data. This covers routing, auth, validation and the database layer together. One test file per endpoint group or flow, named after it.
- **Contract tests:** when the API has an OpenAPI spec, the spec is the contract. In the end-to-end tests, validate every response against it with the stack's OpenAPI validator, so the code and the spec can't drift apart. Without a spec, the end-to-end tests are the contract. Optional extras, each only on the user's yes:
  - Schemathesis generates requests from the spec and finds inputs that crash the server.
  - Pact, only when services of other teams consume this API and need consumer-driven contracts.
- **Throwaway database:** a temporary SQLite file or an in-memory database when the code supports it; otherwise a separate test database created and dropped by the test setup. Never point tests at a shared or production database.
- **Stable tests:** each test creates its own data; nothing depends on test order or on the clock (pass time in, or freeze it); external services the project doesn't own are replaced by a local fake server, never called for real.

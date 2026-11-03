if (!process.env.CI) {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_TEST ??
    "postgresql://life_tracker_app:dev-app-password@127.0.0.1:5432/life_tracker_test";
  process.env.DATABASE_URL_MIGRATE =
    "postgresql://postgres:dev-postgres-password@127.0.0.1:5432/life_tracker_test";
} else {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/life_tracker";
  process.env.DATABASE_URL_MIGRATE ??= "postgresql://postgres:postgres@127.0.0.1:5432/life_tracker";
}

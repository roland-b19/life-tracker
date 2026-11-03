process.env.DATABASE_URL ??= "postgresql://life_tracker_app:dev-app-password@127.0.0.1:5432/life_tracker";
process.env.DATABASE_URL_MIGRATE ??=
  "postgresql://postgres:dev-postgres-password@127.0.0.1:5432/life_tracker";

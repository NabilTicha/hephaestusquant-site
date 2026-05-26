interface Env {
  FORECAST_DB: D1Database;
  MS_CLIENT_ID: string;
  MS_CLIENT_SECRET: string;
  MS_TENANT_ID: string;
  MS_REDIRECT_URI: string;
  JWT_SECRET: string;
  SITE_URL: string;
}

type CFPagesFunction = PagesFunction<Env>;

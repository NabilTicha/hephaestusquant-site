interface Env {
  FORECAST_DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  JWT_SECRET: string;
  SITE_URL: string;
}

type CFPagesFunction = PagesFunction<Env>;

export type Bindings = Pick<
  Cloudflare.Env,
  "NEON_AUTH_BASE_URL" | "NEON_AUTH_COOKIE_SECRET" | "APP_ORIGIN"
> & {
  HYPERDRIVE: Pick<Cloudflare.Env["HYPERDRIVE"], "connectionString">
}

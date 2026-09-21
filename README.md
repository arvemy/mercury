# shadcn/ui monorepo template

This is a Vite monorepo template with shadcn/ui.

## Adding components

To add components to your app, run the following command at the root of your `web` app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This will place the ui components in the `packages/ui/src/components` directory.

## Using components

To use the components in your app, import them from the `ui` package.

```tsx
import { Button } from "@workspace/ui/components/button"
```

## Backend (Hono)

The API lives in `apps/api` (`@workspace/api`). `pnpm dev` starts it alongside the web app; Vite proxies `/api` to it. Set `PORT` to change its port (default `3000`).

The web app calls it through a typed client:

```ts
import { api } from "@/lib/api"

const res = await api.api.health.$get()
```

`src/lib/api.ts` builds that client from `AppType`, exported by `apps/api/src/app.ts`.

Routing is file-based under `apps/web/src/routes` (TanStack Router). The Vite plugin generates `src/routeTree.gen.ts` from those files; keep it committed. Data fetching goes through TanStack Query, with `queryOptions` definitions in `src/lib/queries.ts` shared by route loaders and components. The Hono `hc` client keeps request and response types end-to-end.

### Database

The API uses Drizzle ORM on PostgreSQL. To run it locally:

```sh
docker compose up -d db
cp apps/api/.env.example apps/api/.env
pnpm db:migrate
pnpm db:studio
```

The schema lives in `apps/api/src/db/schema.ts`. After changing it, run `pnpm db:generate` to write a migration, then `pnpm db:migrate` to apply it.

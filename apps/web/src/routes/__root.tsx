import type { QueryClient } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import {
  Link,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { Anchor, Box, Group, Stack } from "@mantine/core"
import classes from "./layout.module.css"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  { component: RootLayout }
)

const showDevtools = import.meta.env.DEV

function RootLayout() {
  return (
    <Box component="main" mih="100svh" p="lg">
      <Stack maw={448} w="100%" gap="md">
        <Group component="nav" gap="md">
          <Anchor
            className={classes.navLink}
            renderRoot={(props) => <Link {...props} to="/" />}
          >
            Home
          </Anchor>
          <Anchor
            className={classes.navLink}
            renderRoot={(props) => <Link {...props} to="/todos" />}
          >
            Todos
          </Anchor>
        </Group>
        <Outlet />
      </Stack>
      {showDevtools && (
        <>
          <TanStackRouterDevtools />
          <ReactQueryDevtools />
        </>
      )}
    </Box>
  )
}

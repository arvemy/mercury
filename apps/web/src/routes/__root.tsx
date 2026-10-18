import { useAppAuth } from "@/lib/auth-context"
import type { AuthState } from "@/lib/auth"
import type { QueryClient } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import {
  Link,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { Anchor, Box, Button, Group, Stack } from "@mantine/core"
import classes from "./layout.module.css"

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
  auth: AuthState
}>()({ component: RootLayout })

const showDevtools = import.meta.env.DEV

function RootLayout() {
  const { auth } = Route.useRouteContext()
  const { signOut } = useAppAuth()
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
          {auth.status === "authenticated" ? (
            <Button variant="subtle" onClick={() => void signOut()}>
              Sign out
            </Button>
          ) : (
            <Anchor
              renderRoot={(props) => (
                <Link
                  {...props}
                  to="/sign-in"
                  search={{ redirect: "/todos" }}
                />
              )}
            >
              Sign in
            </Anchor>
          )}
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

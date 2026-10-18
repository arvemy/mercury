import { Button, Stack, Text } from "@mantine/core"
import { useAppAuth } from "@/lib/auth-context"

export function AuthUnavailable() {
  const { auth, refresh, signOut } = useAppAuth()
  return (
    <Stack>
      <Text role="alert">
        {auth.status === "unavailable"
          ? auth.message
          : "Authentication is unavailable."}
      </Text>
      <Button onClick={() => void refresh()}>Retry authentication</Button>
      <Button variant="default" onClick={() => void signOut()}>
        Retry sign out
      </Button>
    </Stack>
  )
}

import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Button, Stack, Text, Title } from "@mantine/core"
import { healthQuery } from "@/lib/queries"

export const Route = createFileRoute("/")({ component: Home })

function Home() {
  const health = useQuery(healthQuery)
  const apiStatus = health.isError
    ? "unreachable"
    : health.isPending
      ? "..."
      : health.data.status

  return (
    <>
      <Stack gap="xs">
        <Title order={1}>Project ready!</Title>
        <Text>You may now add components and start building.</Text>
        <Text>Mantine components are ready to use.</Text>
        <Button w="fit-content">Button</Button>
      </Stack>
      <Text c="dimmed">API: {apiStatus}</Text>
    </>
  )
}

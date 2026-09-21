import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
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
      <div>
        <h1 className="font-medium">Project ready!</h1>
        <p>You may now add components and start building.</p>
        <p>We&apos;ve already added the button component for you.</p>
        <Button className="mt-2">Button</Button>
      </div>
      <p className="text-muted-foreground">API: {apiStatus}</p>
    </>
  )
}

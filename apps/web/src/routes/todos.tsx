import { useState } from "react"
import { useAppAuth } from "@/lib/auth-context"
import { AuthUnavailable } from "@/components/auth-status"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import {
  createFileRoute,
  redirect,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import {
  Button,
  Group,
  List,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core"
import { IconPlus } from "@tabler/icons-react"
import { api } from "@/lib/api"
import { todosQuery, checkResponse, SessionExpiredError } from "@/lib/queries"
import { safeReturnTo } from "@/lib/auth"

export const Route = createFileRoute("/todos")({
  beforeLoad: ({ context, location }) => {
    if (context.auth.status === "unavailable")
      throw new Error(context.auth.message)
    if (context.auth.status !== "authenticated") {
      throw redirect({
        to: "/sign-in",
        search: { redirect: safeReturnTo(location.href) },
      })
    }
    return { userId: context.auth.userId, sessionId: context.auth.sessionId }
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      todosQuery(context.userId, context.sessionId)
    ),
  errorComponent: TodosError,
  component: Todos,
})

function Todos() {
  const { userId, sessionId } = Route.useRouteContext()
  const { signOut } = useAppAuth()
  const query = todosQuery(userId, sessionId)
  const { data: todos } = useSuspenseQuery(query)
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")

  const addTodo = useMutation({
    mutationFn: async (title: string) => {
      const res = await api.api.todos.$post({ json: { title } })
      checkResponse(res)
    },
    onSuccess: async () => {
      setTitle("")
      await queryClient.invalidateQueries({ queryKey: query.queryKey })
    },
  })

  return (
    <Stack gap="md">
      <Title order={1}>Todos</Title>
      {todos.length === 0 ? (
        <Text c="dimmed">No todos yet.</Text>
      ) : (
        <List spacing="xs">
          {todos.map((todo) => (
            <List.Item key={todo.id}>
              <Group gap="xs">
                <Text span>{todo.title}</Text>
                {todo.completed && (
                  <Text span c="dimmed">
                    done
                  </Text>
                )}
              </Group>
            </List.Item>
          ))}
        </List>
      )}
      <Group
        component="form"
        wrap="nowrap"
        gap="xs"
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim()) addTodo.mutate(title.trim())
        }}
      >
        <TextInput
          flex={1}
          miw={0}
          aria-label="New todo"
          placeholder="What needs doing?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button
          type="submit"
          disabled={addTodo.isPending}
          leftSection={<IconPlus size={16} aria-hidden />}
        >
          Add
        </Button>
      </Group>
      {addTodo.isError && (
        <Text role="alert" c="red">
          {addTodo.error instanceof SessionExpiredError
            ? addTodo.error.message
            : "Couldn't add the todo. Try again."}
        </Text>
      )}
      {addTodo.error instanceof SessionExpiredError && (
        <Button onClick={() => void signOut()}>Sign in again</Button>
      )}
    </Stack>
  )
}

function TodosError({ error, reset }: ErrorComponentProps) {
  const { auth, signOut } = useAppAuth()
  if (auth.status === "unavailable") return <AuthUnavailable />
  return (
    <Stack>
      <Text role="alert">
        {error instanceof SessionExpiredError
          ? error.message
          : "Couldn't load your todos. Try again."}
      </Text>
      {error instanceof SessionExpiredError ? (
        <Button onClick={() => void signOut()}>Sign in again</Button>
      ) : (
        <Button onClick={reset}>Retry todos</Button>
      )}
    </Stack>
  )
}

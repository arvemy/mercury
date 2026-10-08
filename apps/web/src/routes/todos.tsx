import { useState } from "react"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  Button,
  Group,
  List,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core"
import { api } from "@/lib/api"
import { todosQuery } from "@/lib/queries"

export const Route = createFileRoute("/todos")({
  loader: ({ context }) => context.queryClient.ensureQueryData(todosQuery),
  component: Todos,
})

function Todos() {
  const { data: todos } = useSuspenseQuery(todosQuery)
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")

  const addTodo = useMutation({
    mutationFn: async (title: string) => {
      const res = await api.api.todos.$post({ json: { title } })
      if (!res.ok) throw new Error(`POST /api/todos failed with ${res.status}`)
    },
    onSuccess: async () => {
      setTitle("")
      await queryClient.invalidateQueries({ queryKey: ["todos"] })
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
        <Button type="submit" disabled={addTodo.isPending}>
          Add
        </Button>
      </Group>
      {addTodo.isError && (
        <Text role="alert" c="red">
          Couldn't add the todo. Try again.
        </Text>
      )}
    </Stack>
  )
}

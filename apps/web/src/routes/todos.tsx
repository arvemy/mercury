import { useState } from "react"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
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
    <div className="flex flex-col gap-4">
      <h1 className="font-medium">Todos</h1>
      {todos.length === 0 ? (
        <p className="text-muted-foreground">No todos yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {todos.map((todo) => (
            <li key={todo.id} className="flex gap-2">
              <span>{todo.title}</span>
              {todo.completed && (
                <span className="text-muted-foreground">done</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim()) addTodo.mutate(title.trim())
        }}
      >
        <Input
          aria-label="New todo"
          placeholder="What needs doing?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button type="submit" disabled={addTodo.isPending}>
          Add
        </Button>
      </form>
      {addTodo.isError && (
        <p role="alert" className="text-destructive">
          Couldn't add the todo. Try again.
        </p>
      )}
    </div>
  )
}

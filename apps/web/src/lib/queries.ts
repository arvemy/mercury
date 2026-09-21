import { queryOptions } from "@tanstack/react-query"
import { api } from "@/lib/api"

export const healthQuery = queryOptions({
  queryKey: ["health"],
  queryFn: async () => (await api.api.health.$get()).json(),
})

export const todosQuery = queryOptions({
  queryKey: ["todos"],
  queryFn: async () => (await api.api.todos.$get()).json(),
})

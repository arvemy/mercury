import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"

export class SessionExpiredError extends Error {
  constructor() {
    super("Your session expired. Sign in again to continue.")
  }
}

export function checkResponse(response: Response) {
  if (response.status === 401) throw new SessionExpiredError()
  if (!response.ok) throw new Error(`Request failed with ${response.status}`)
}

export const healthQuery = queryOptions({
  queryKey: ["health"],
  queryFn: async ({ signal }) => {
    const response = await api.api.health.$get({}, { init: { signal } })
    checkResponse(response)
    return response.json()
  },
})

export function todosQuery(userId: string, sessionId: string) {
  return queryOptions({
    queryKey: ["private", userId, sessionId, "todos"],
    queryFn: async ({ signal }) => {
      const response = await api.api.todos.$get({}, { init: { signal } })
      checkResponse(response)
      if (response.status !== 200) throw new Error("Couldn't load todos")
      return response.json()
    },
    retry: (count, error) =>
      !(error instanceof SessionExpiredError) && count < 2,
  })
}

export async function clearPrivateCache(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: ["private"] })
  queryClient.removeQueries({ queryKey: ["private"] })
  queryClient.getMutationCache().clear()
}

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MantineProvider } from "@mantine/core"
import { theme } from "@workspace/ui/theme"
import { NeonAuthRouter } from "./lib/auth-router"
import { AuthProvider } from "./lib/auth-provider"
import "@mantine/core/styles.css"

const queryClient = new QueryClient()
const root = document.getElementById("root")
if (!root) throw new Error("Missing root element")

createRoot(root).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <QueryClientProvider client={queryClient}>
        <AuthProvider queryClient={queryClient}>
          <NeonAuthRouter queryClient={queryClient} />
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>
)

import { createFileRoute, redirect } from "@tanstack/react-router"
import { safeReturnTo } from "@/lib/auth"
import { AuthForm } from "@/components/auth-form"

export const Route = createFileRoute("/sign-up")({
  validateSearch: (search) => ({ redirect: safeReturnTo(search.redirect) }),
  beforeLoad: ({ context, search }) => {
    if (context.auth.status === "authenticated") {
      throw redirect({ href: search.redirect })
    }
  },
  component: SignUpPage,
})

function SignUpPage() {
  const { redirect } = Route.useSearch()
  return <AuthForm mode="sign-up" redirect={redirect} />
}

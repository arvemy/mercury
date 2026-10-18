import { createFileRoute } from "@tanstack/react-router"
import { safeReturnTo } from "@/lib/auth"
import { ResetPasswordForm } from "@/components/reset-password-form"

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search) => ({ redirect: safeReturnTo(search.redirect) }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { redirect } = Route.useSearch()
  return <ResetPasswordForm redirect={redirect} />
}

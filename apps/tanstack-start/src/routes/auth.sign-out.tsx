import * as React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'
import { Loader2 } from 'lucide-react'

export const Route = createFileRoute('/auth/sign-out')({
  component: SignOutPage,
})

function SignOutPage() {
  const navigate = useNavigate()

  React.useEffect(() => {
    const signOut = async () => {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            void navigate({ to: '/' })
          },
        },
      })
    }
    void signOut()
  }, [navigate])

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-muted-foreground text-sm">Signing out...</p>
    </div>
  )
}

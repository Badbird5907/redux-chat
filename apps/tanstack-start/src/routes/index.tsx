import { createFileRoute, redirect } from '@tanstack/react-router'
import { getToken } from '@/lib/auth-server'

export const Route = createFileRoute('/')({
  loader: async () => {
    const token = await getToken();
    if (token) {
      // Redirect to app if authenticated
      return redirect('/app');
    }
    // Redirect to sign in if not authenticated
    return redirect('/auth/sign-in');
  },
})

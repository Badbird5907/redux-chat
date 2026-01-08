import { ReactNode } from 'react'
import { useRouteContext } from '@tanstack/react-router'

export function Authenticated({ children }: { children: ReactNode }) {
  const context = useRouteContext({ from: '/app' });
  
  if (!context?.isAuthenticated) {
    return <div>Unauthorized</div>;
  }
  
  return <>{children}</>;
}
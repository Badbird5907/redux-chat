import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/whoami')({
  component: RouteComponent,
  
})

function RouteComponent() {
  
  return <div>Hello "/whoami"!</div>
}

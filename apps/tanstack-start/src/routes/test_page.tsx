import { createFileRoute } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router';

export const Route = createFileRoute('/test_page')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <div>Hello "/test_page"!</div>
      <Link to={`/chat/${123}`}>Chat</Link>
    </div>
  )
}

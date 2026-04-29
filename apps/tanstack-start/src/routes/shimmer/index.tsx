import { Shimmer } from '@/components/ai/shimmer'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/shimmer/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>
    <Shimmer as="span" className="text-sm" duration={1.8}>
      Hello World
    </Shimmer>
  </div>
}

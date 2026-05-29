import {
  BrainHighIcon,
  BrainLowIcon,
  BrainMediumIcon,
} from "@/components/chat/input/brain-level-icons";

export function ReasoningRouteComponent() {
  return (
    <div className="container mx-auto space-y-8 py-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Reasoning brain icons
        </h1>
        <p className="text-muted-foreground">
          Low, medium, and high variants shown side by side.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-center gap-12 md:justify-start">
        <figure className="flex flex-col items-center gap-3">
          <BrainLowIcon className="text-foreground size-16" aria-hidden />
          <figcaption className="text-muted-foreground text-sm font-medium">
            Low
          </figcaption>
        </figure>
        <figure className="flex flex-col items-center gap-3">
          <BrainMediumIcon className="text-foreground size-16" aria-hidden />
          <figcaption className="text-muted-foreground text-sm font-medium">
            Medium
          </figcaption>
        </figure>
        <figure className="flex flex-col items-center gap-3">
          <BrainHighIcon className="text-foreground size-16" aria-hidden />
          <figcaption className="text-muted-foreground text-sm font-medium">
            High
          </figcaption>
        </figure>
        <figure className="flex flex-col items-center gap-3">
          <svg
            className="text-foreground size-16"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12,4.69c0-1.66-1.33-3-2.99-3.01-1.66,0-3,1.33-3.01,2.99,0,.05,0,.1,0,.14-2.14,.55-3.43,2.73-2.88,4.87,.08,.31,.2,.62,.35,.9-1.71,1.39-1.98,3.91-.58,5.63,.32,.39,.7,.71,1.14,.96-.28,2.19,1.26,4.2,3.45,4.48,2.19,.28,4.2-1.26,4.48-3.45,.02-.17,.03-.34,.03-.51V4.69Z"></path>
            <path d="M6,4.81c.02,.48,.32,2.19,2.42,2.76"></path>
            <path d="M3.48,10.58c.93-.61,1.8-.83,2.88-.7"></path>
            <path d="M7.85,17.43c-1.49,.47-3.22,.08-3.82-.26"></path>
            <path d="M12,17.69c0,.17,.01,.34,.03,.51,.28,2.19,2.29,3.74,4.48,3.45,2.19-.28,3.74-2.29,3.45-4.48,.44-.25,.82-.57,1.14-.96,1.39-1.71,1.13-4.23-.58-5.63,.15-.28,.27-.59,.35-.9,.55-2.14-.74-4.32-2.88-4.87,0-.05,0-.1,0-.14,0-1.66-1.35-3-3.01-2.99-1.66,0-3,1.35-2.99,3.01v13Z"></path>
            <path d="M15.58,7.57c2.1-.57,2.4-2.28,2.42-2.76"></path>
            <path d="M17.64,9.88c1.08-.13,1.95,.1,2.88,.7"></path>
            <path d="M19.97,17.17c-.6,.34-2.33,.73-3.82,.26"></path>
            <path d="M17.22,13.44c-3.72,1.79-5.31-1.79-5.21-4.66"></path>
            <path d="M11.94,8.78c.1,2.87-1.49,6.45-5.21,4.66"></path>
          </svg>
          <figcaption className="text-muted-foreground text-sm font-medium">
            T3Chat High
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

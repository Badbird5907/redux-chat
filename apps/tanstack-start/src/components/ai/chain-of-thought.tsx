"use client";

import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, use, useEffect, useMemo, useRef } from "react";
import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { ChevronDownIcon, DotIcon } from "lucide-react";
import { AnimatePresence, m } from "motion/react";

import { Badge } from "@redux/ui/components/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@redux/ui/components/collapsible";
import { cn } from "@redux/ui/lib/utils";

import { Shimmer } from "@/components/ai/shimmer";

interface ChainOfThoughtContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
  null,
);

const useChainOfThought = () => {
  const context = use(ChainOfThoughtContext);
  if (!context) {
    throw new Error(
      "ChainOfThought components must be used within ChainOfThought",
    );
  }
  return context;
};

function ShimmerableLabel({
  label,
  shimmer,
}: {
  label: ReactNode;
  shimmer: boolean;
}) {
  if (!shimmer) {
    return <>{label}</>;
  }

  if (typeof label === "string" || typeof label === "number") {
    return (
      <Shimmer as="span" className="text-sm" duration={1.8}>
        {String(label)}
      </Shimmer>
    );
  }

  return <>{label}</>;
}

export type ChainOfThoughtProps = ComponentProps<"div"> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const ChainOfThought = memo(
  ({
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    children,
    ...props
  }: ChainOfThoughtProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      defaultProp: defaultOpen,
      onChange: onOpenChange,
      prop: open,
    });
    const previousDefaultOpenRef = useRef(defaultOpen);

    useEffect(() => {
      if (
        open === undefined &&
        defaultOpen &&
        !previousDefaultOpenRef.current
      ) {
        setIsOpen(true);
      }

      previousDefaultOpenRef.current = defaultOpen;
    }, [defaultOpen, open, setIsOpen]);

    const chainOfThoughtContext = useMemo(
      () => ({ isOpen, setIsOpen }),
      [isOpen, setIsOpen],
    );

    return (
      <ChainOfThoughtContext.Provider value={chainOfThoughtContext}>
        <div className={cn("not-prose w-full space-y-4", className)} {...props}>
          {children}
        </div>
      </ChainOfThoughtContext.Provider>
    );
  },
);

export type ChainOfThoughtHeaderProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  icon?: LucideIcon;
  shimmer?: boolean;
  status?: ChainOfThoughtStepProps["status"];
};

export const ChainOfThoughtHeader = memo(
  ({
    className,
    children,
    icon: Icon,
    shimmer = false,
    status = "complete",
    ...props
  }: ChainOfThoughtHeaderProps) => {
    const { isOpen, setIsOpen } = useChainOfThought();

    return (
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger
          className={cn(
            "text-muted-foreground hover:text-foreground flex w-full items-center gap-2 text-sm transition-colors",
            className,
          )}
          {...props}
        >
          {Icon ? (
            <Icon
              className={cn("size-4 shrink-0", headerStatusStyles[status])}
            />
          ) : null}
          <span
            className={cn(
              "text-left",
              (status === "active" || shimmer) && "text-foreground",
              status === "error" && "text-destructive",
            )}
          >
            <ShimmerableLabel
              label={children ?? "Thought Process"}
              shimmer={shimmer}
            />
          </span>
          <ChevronDownIcon
            className={cn(
              "size-4 transition-transform",
              isOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </CollapsibleTrigger>
      </Collapsible>
    );
  },
);

export type ChainOfThoughtStepProps = Omit<
  ComponentProps<typeof m.div>,
  "children"
> & {
  children?: ReactNode;
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  shimmer?: boolean;
  status?: "complete" | "active" | "error" | "pending";
};

const stepStatusStyles = {
  active: "text-foreground",
  complete: "text-muted-foreground",
  error: "text-destructive",
  pending: "text-muted-foreground/50",
};

const headerStatusStyles = {
  active: "text-foreground",
  complete: "text-muted-foreground",
  error: "text-destructive",
  pending: "text-muted-foreground/50",
} as const;

export const ChainOfThoughtStep = memo(
  ({
    className,
    icon: Icon = DotIcon,
    label,
    description,
    shimmer = false,
    status = "complete",
    children,
    ...props
  }: ChainOfThoughtStepProps) => (
    <m.div
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex gap-2 text-sm",
        stepStatusStyles[status],
        "will-change-transform",
        className,
      )}
      exit={{ opacity: 0, y: -6 }}
      initial={{ opacity: 0, y: -6 }}
      layout="position"
      transition={{
        duration: 0.24,
        ease: [0.22, 1, 0.36, 1],
        layout: {
          duration: 0.22,
          ease: [0.22, 1, 0.36, 1],
        },
      }}
      {...props}
    >
      <div className="relative mt-0.5">
        <Icon className="size-4" />
        <div className="bg-border absolute top-7 bottom-0 left-1/2 -mx-px w-px" />
      </div>
      <div className="flex-1 space-y-2 overflow-hidden">
        <div>
          <ShimmerableLabel label={label} shimmer={shimmer} />
        </div>
        {description && (
          <div className="text-muted-foreground text-xs">{description}</div>
        )}
        {children}
      </div>
    </m.div>
  ),
);

export type ChainOfThoughtSearchResultsProps = ComponentProps<"div">;

export const ChainOfThoughtSearchResults = memo(
  ({ className, ...props }: ChainOfThoughtSearchResultsProps) => (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  ),
);

export type ChainOfThoughtSearchResultProps = ComponentProps<typeof Badge> & {
  href: string;
};

export const ChainOfThoughtSearchResult = memo(
  ({
    className,
    children,
    href,
    ...props
  }: ChainOfThoughtSearchResultProps) => (
    <a href={href} target="_blank" rel="noreferrer">
      <Badge
        className={cn("gap-1 px-2 py-0.5 text-xs font-normal", className)}
        variant="secondary"
        {...props}
      >
        {children}
      </Badge>
    </a>
  ),
);

export type ChainOfThoughtContentProps = ComponentProps<
  typeof CollapsibleContent
>;

export const ChainOfThoughtContent = memo(
  ({ className, children, ...props }: ChainOfThoughtContentProps) => {
    const { isOpen } = useChainOfThought();

    return (
      <Collapsible open={isOpen}>
        <CollapsibleContent
          className={cn(
            "mt-2 space-y-3",
            "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground data-[state=closed]:animate-out data-[state=open]:animate-in outline-none",
            className,
          )}
          {...props}
        >
          <AnimatePresence initial={false}>{children}</AnimatePresence>
        </CollapsibleContent>
      </Collapsible>
    );
  },
);

export type ChainOfThoughtImageProps = ComponentProps<"div"> & {
  caption?: string;
};

export const ChainOfThoughtImage = memo(
  ({ className, children, caption, ...props }: ChainOfThoughtImageProps) => (
    <div className={cn("mt-2 space-y-2", className)} {...props}>
      <div className="bg-muted relative flex max-h-[22rem] items-center justify-center overflow-hidden rounded-lg p-3">
        {children}
      </div>
      {caption && <p className="text-muted-foreground text-xs">{caption}</p>}
    </div>
  ),
);

ChainOfThought.displayName = "ChainOfThought";
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";
ChainOfThoughtSearchResults.displayName = "ChainOfThoughtSearchResults";
ChainOfThoughtSearchResult.displayName = "ChainOfThoughtSearchResult";
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";
ChainOfThoughtImage.displayName = "ChainOfThoughtImage";

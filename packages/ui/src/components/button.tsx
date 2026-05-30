import type { VariantProps } from "class-variance-authority";
import { Button as ButtonPrimitive } from "@base-ui/react/button";

import { buttonVariants } from "@redux/ui/components/button-variants";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";
import { cn } from "@redux/ui/lib/utils";

function Button({
  className,
  variant = "default",
  size = "default",
  tooltip,
  render,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    tooltip?: string | React.ReactNode;
  }) {
  const buttonRender: ButtonPrimitive.Props["render"] = tooltip
    ? (buttonProps, buttonState) => {
        if (typeof render === "function") {
          return (
            <TooltipTrigger
              render={(triggerProps) => render(triggerProps, buttonState)}
              {...buttonProps}
            />
          );
        }

        return <TooltipTrigger render={render} {...buttonProps} />;
      }
    : render;

  const button = (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      render={buttonRender}
      {...props}
    />
  );

  if (tooltip) {
    return (
      <Tooltip delay={300}>
        {button}
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

export { Button };

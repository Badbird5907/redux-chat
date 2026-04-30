import type { ComponentProps } from "react";
import type { Components, ExtraProps } from "streamdown";

import { cn } from "@redux/ui/lib/utils";

const EXTERNAL_LINK_PROTOCOL = /^https?:\/\//i;

type MarkdownAnchorProps = ComponentProps<"a"> & ExtraProps;
type MarkdownImageProps = ComponentProps<"img"> & ExtraProps;
type MarkdownInlineCodeProps = ComponentProps<"code"> & ExtraProps;
type MarkdownHrProps = ComponentProps<"hr"> & ExtraProps;

export const streamdownComponents: Components = {
  a({ children, className, href, ...props }: MarkdownAnchorProps) {
    const isExternalLink = href ? EXTERNAL_LINK_PROTOCOL.test(href) : false;

    return (
      <a
        {...props}
        className={cn("chat-markdown__link", className)}
        href={href}
        rel={isExternalLink ? "noreferrer noopener" : props.rel}
        target={isExternalLink ? "_blank" : props.target}
      >
        {children}
      </a>
    );
  },
  img({ alt, className, ...props }: MarkdownImageProps) {
    return (
      <img
        {...props}
        alt={alt}
        className={cn("chat-markdown__image", className)}
        decoding="async"
        loading="lazy"
      />
    );
  },
  inlineCode({ children, className, ...props }: MarkdownInlineCodeProps) {
    return (
      <code
        {...props}
        className={cn("chat-markdown__inline-code", className)}
      >
        {children}
      </code>
    );
  },
  hr({ className, ...props }: MarkdownHrProps) {
    return <hr {...props} className={cn("chat-markdown__hr my-4", className)} />;
  },
};

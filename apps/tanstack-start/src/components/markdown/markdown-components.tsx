import type { ComponentProps, ReactElement, ReactNode } from "react";
import type { Components, ExtraProps, Options } from "react-markdown";
import { Children, cloneElement, isValidElement } from "react";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@redux/ui/components/table";
import { cn } from "@redux/ui/lib/utils";

import { ShikiCodeBlock } from "./shiki-code-block";

const EXTERNAL_LINK_PROTOCOL = /^https?:\/\//i;

export const remarkPlugins: NonNullable<Options["remarkPlugins"]> = [
  remarkGfm,
  [remarkMath, { singleDollarTextMath: false }] as never,
];

export const rehypePlugins: NonNullable<Options["rehypePlugins"]> = [
  rehypeKatex,
];

type MarkdownCodeProps = ComponentProps<"code"> &
  ExtraProps & {
    "data-block-code"?: boolean;
  };

type MarkdownPreProps = ComponentProps<"pre"> & ExtraProps;

interface MarkdownComponentsOptions {
  isStreaming?: boolean;
}

function getCodeTextContent(children: ReactNode) {
  return Children.toArray(children)
    .flatMap((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return [String(child)];
      }

      return [];
    })
    .join("");
}

export function createMarkdownComponents({
  isStreaming = false,
}: MarkdownComponentsOptions = {}): Components {
  return {
    a({ children, className, href, ...props }) {
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
    code({ children, className, ...props }: MarkdownCodeProps) {
      const code = getCodeTextContent(children).replace(/\n$/, "");
      const language = /language-([^\s]+)/.exec(className ?? "")?.[1];

      if (props["data-block-code"]) {
        return (
          <ShikiCodeBlock
            code={code}
            info={language}
            isStreaming={isStreaming}
          />
        );
      }

      return (
        <code
          {...props}
          className={cn("chat-markdown__inline-code", className)}
        >
          {children}
        </code>
      );
    },
    img({ alt, className, ...props }) {
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
    pre({ children }: MarkdownPreProps) {
      const child = Children.toArray(children)[0];

      if (!isValidElement(child)) {
        return <>{children}</>;
      }

      return (
        <>
          {cloneElement(child as ReactElement<Record<string, unknown>>, {
            "data-block-code": true,
          })}
        </>
      );
    },
    table({ children, className, ...props }) {
      return (
        <div className="my-4">
          <Table {...props} className={cn("chat-markdown__table", className)}>
            {children}
          </Table>
        </div>
      );
    },
    thead({ children, className, ...props }) {
      return (
        <TableHeader className={className} {...props}>
          {children}
        </TableHeader>
      );
    },
    tbody({ children, className, ...props }) {
      return (
        <TableBody className={className} {...props}>
          {children}
        </TableBody>
      );
    },
    tfoot({ children, className, ...props }) {
      return (
        <TableFooter className={className} {...props}>
          {children}
        </TableFooter>
      );
    },
    tr({ children, className, ...props }) {
      return (
        <TableRow className={className} {...props}>
          {children}
        </TableRow>
      );
    },
    th({ children, className, ...props }) {
      return (
        <TableHead className={className} {...props}>
          {children}
        </TableHead>
      );
    },
    td({ children, className, ...props }) {
      return (
        <TableCell className={className} {...props}>
          {children}
        </TableCell>
      );
    },
    caption({ children, className, ...props }) {
      return (
        <TableCaption className={className} {...props}>
          {children}
        </TableCaption>
      );
    },
    hr({ children, className, ...props }) {
      return (
        <hr {...props} className={cn("chat-markdown__hr my-4", className)}>
          {children}
        </hr>
      );
    },
  };
}

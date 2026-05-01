import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { Button } from "@redux/ui/components/button";
import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/test/")({
  component: RouteComponent,
});

const MARKDOWN_FIXTURE = `
# Markdown rendering playground

Paragraph with **bold**, *italic*, and \`inline code\`. Here is a [link example](https://example.com).

## Lists

- First unordered item
- Second item
  - Nested bullet
  - Another nested

1. Ordered one
2. Ordered two
   1. Nested ordered

> Blockquote with multiple lines to check spacing and the left border treatment.

---

### Table

| Feature | Status |
| ------- | ------ |
| Headings | OK |
| Code | OK |

### Fenced code

\`\`\`typescript
type Answer = 42;
console.log("syntax highlighting");
\`\`\`

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}!"
\`\`\`

Inline math may render if enabled: $$E = mc^2$$.


$$e^{ix} = \\cos(x) + i\\sin(x)$$

The quadratic formula is $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$ for solving equations.
`.trim();

function RouteComponent() {
  return (
    <div className="bg-background flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="border-border bg-card w-full max-w-3xl rounded-2xl border p-8 shadow-sm">
        <MarkdownRenderer content={MARKDOWN_FIXTURE} mode="static" />
      </div>

      <Button onClick={() => toast.success("Hello")}>Click me</Button>
    </div>
  );
}

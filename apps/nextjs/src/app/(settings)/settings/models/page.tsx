import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";
import { Badge } from "@redux/ui/components/badge";
import { Checkbox } from "@redux/ui/components/checkbox";
import { Label } from "@redux/ui/components/label";

export default function ModelsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">Models</h3>
        <p className="text-muted-foreground">
          Configure available AI models and their parameters.
        </p>
      </div>

      <Card className="rounded-3xl border-none shadow-md">
        <CardHeader>
          <CardTitle>Default Model</CardTitle>
          <CardDescription>
            Choose the default model for new conversations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", active: true },
              { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", active: false },
              { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", active: false },
            ].map((model) => (
              <div
                key={model.id}
                className={`flex flex-col gap-2 rounded-2xl border p-4 cursor-pointer transition-colors ${model.active ? "bg-accent border-accent" : "hover:bg-muted"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{model.name}</span>
                  <Badge variant="outline">{model.provider}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-none shadow-md">
        <CardHeader>
          <CardTitle>Model Capabilities</CardTitle>
          <CardDescription>
            Enable or disable specific model features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
                <Label htmlFor="web-search">Web Search</Label>
                <Checkbox id="web-search" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
                <Label htmlFor="image-gen">Image Generation</Label>
                <Checkbox id="image-gen" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
                <Label htmlFor="code-interpreter">Code Interpreter</Label>
                <Checkbox id="code-interpreter" defaultChecked />
            </div>
        </CardContent>
      </Card>
    </div>
  );
}

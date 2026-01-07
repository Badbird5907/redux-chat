import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";
import { Button } from "@redux/ui/components/button";
import { Badge } from "@redux/ui/components/badge";
import { Checkbox } from "@redux/ui/components/checkbox";
import { Label } from "@redux/ui/components/label";

export default function RAGSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">RAG (Retrieval-Augmented Generation)</h3>
        <p className="text-muted-foreground">
          Configure how the AI accesses and uses your personal or shared knowledge base.
        </p>
      </div>

      <Card className="rounded-3xl border-none shadow-md">
        <CardHeader>
          <CardTitle>Knowledge Bases</CardTitle>
          <CardDescription>
            Connect and manage data sources for context-aware responses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4">
            {[
              { name: "Personal Documents", documents: 12, size: "4.2 MB", status: "Indexed" },
              { name: "Project Wiki", documents: 45, size: "12.8 MB", status: "Syncing" },
            ].map((kb) => (
              <div
                key={kb.name}
                className="flex items-center justify-between rounded-2xl border p-4 hover:bg-muted/50 transition-colors"
              >
                <div>
                  <div className="font-semibold">{kb.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {kb.documents} documents • {kb.size}
                  </div>
                </div>
                <Badge variant={kb.status === "Indexed" ? "default" : "secondary"}>
                  {kb.status}
                </Badge>
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full">Connect New Data Source</Button>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-none shadow-md">
        <CardHeader>
          <CardTitle>Search Settings</CardTitle>
          <CardDescription>
            Fine-tune how the AI searches through your documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
                <Checkbox id="semantic-search" defaultChecked />
                <Label htmlFor="semantic-search">Enable Semantic Search</Label>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox id="hybrid-search" defaultChecked />
                <Label htmlFor="hybrid-search">Enable Hybrid Search (Keyword + Semantic)</Label>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}

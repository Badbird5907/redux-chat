import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";
import { Button } from "@redux/ui/components/button";
import { Checkbox } from "@redux/ui/components/checkbox";
import { Label } from "@redux/ui/components/label";
import { Separator } from "@redux/ui/components/separator";

export const metadata = {
  title: "Notification Settings",
};

export default function NotificationSettingsPage() {
  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Choose what you want to hear about and where we should reach you.
        </p>
      </div>

      <Card className="rounded-4xl">
        <CardHeader>
          <CardTitle>Email notifications</CardTitle>
          <CardDescription>
            Control the emails you receive about your account and product.
          </CardDescription>
        </CardHeader>
        <Separator className="mb-6" />
        <CardContent className="space-y-4">
          {[
            {
              id: "product",
              title: "Product updates",
              description: "News, new features, and improvements.",
              defaultChecked: true,
            },
            {
              id: "security",
              title: "Security alerts",
              description: "Important notifications about your account.",
              defaultChecked: true,
            },
            {
              id: "tips",
              title: "Tips & best practices",
              description: "Learn how to get the most out of Redux Chat.",
              defaultChecked: false,
            },
          ].map((item) => (
            <div
              key={item.id}
              className="bg-muted/30 flex items-start gap-3 rounded-3xl border p-4"
            >
              <Checkbox id={item.id} defaultChecked={item.defaultChecked} />
              <div className="min-w-0">
                <Label htmlFor={item.id} className="text-sm font-medium">
                  {item.title}
                </Label>
                <div className="text-muted-foreground mt-1 text-sm">
                  {item.description}
                </div>
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline">Cancel</Button>
            <Button>Save preferences</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-4xl">
        <CardHeader>
          <CardTitle>In-app notifications</CardTitle>
          <CardDescription>
            Manage alerts that appear inside the application.
          </CardDescription>
        </CardHeader>
        <Separator className="mb-6" />
        <CardContent className="space-y-4">
          {[
            {
              id: "mentions",
              title: "Mentions",
              description: "Notify me when someone mentions me.",
              defaultChecked: true,
            },
            {
              id: "thread",
              title: "Thread activity",
              description: "Notify me when a thread I follow is updated.",
              defaultChecked: true,
            },
            {
              id: "weekly",
              title: "Weekly summary",
              description: "A quick recap every week.",
              defaultChecked: false,
            },
          ].map((item) => (
            <div
              key={item.id}
              className="bg-muted/30 flex items-start gap-3 rounded-3xl border p-4"
            >
              <Checkbox id={item.id} defaultChecked={item.defaultChecked} />
              <div className="min-w-0">
                <Label htmlFor={item.id} className="text-sm font-medium">
                  {item.title}
                </Label>
                <div className="text-muted-foreground mt-1 text-sm">
                  {item.description}
                </div>
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline">Cancel</Button>
            <Button>Save preferences</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

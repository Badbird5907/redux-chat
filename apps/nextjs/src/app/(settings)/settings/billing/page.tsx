import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Separator } from "@redux/ui/components/separator";

export const metadata = {
  title: "Billing Settings",
};

export default function BillingSettingsPage() {
  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage your subscription, payment methods, and billing history.
        </p>
      </div>

      <Card className="rounded-4xl">
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            You are currently subscribed to the Pro plan.
          </CardDescription>
        </CardHeader>
        <Separator className="mb-6" />
        <CardContent className="space-y-4">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl border p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-xl font-bold">Pro Plan</div>
                  <Badge variant="secondary">Active</Badge>
                </div>
                <div className="text-muted-foreground mt-2 text-sm">
                  Enhanced features and priority support.
                </div>
                <div className="mt-4 font-bold text-2xl">
                  $29<span className="text-muted-foreground text-base font-normal">/month</span>
                </div>
              </div>
            </div>
            <div className="mt-6 grid gap-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="bg-primary/20 size-1.5 rounded-full" />
                Unlimited AI messages
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-primary/20 size-1.5 rounded-full" />
                Priority model access
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-primary/20 size-1.5 rounded-full" />
                Advanced analytics
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-primary/20 size-1.5 rounded-full" />
                Team collaboration
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline">Change plan</Button>
            <Button variant="destructive">Cancel subscription</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-4xl">
        <CardHeader>
          <CardTitle>Payment method</CardTitle>
          <CardDescription>
            Manage how you pay for your subscription.
          </CardDescription>
        </CardHeader>
        <Separator className="mb-6" />
        <CardContent className="space-y-4">
          <div className="bg-muted/30 flex items-center justify-between rounded-3xl border px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Visa ending in 4242</div>
              <div className="text-muted-foreground mt-0.5 text-xs">
                Expires 12/2026
              </div>
            </div>
            <Badge>Default</Badge>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline">Update card</Button>
            <Button>Add payment method</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-4xl">
        <CardHeader>
          <CardTitle>Billing history</CardTitle>
          <CardDescription>
            View and download your past invoices.
          </CardDescription>
        </CardHeader>
        <Separator className="mb-6" />
        <CardContent className="space-y-3">
          {[
            { date: "Jan 1, 2025", amount: "$29.00", status: "Paid" },
            { date: "Dec 1, 2024", amount: "$29.00", status: "Paid" },
            { date: "Nov 1, 2024", amount: "$29.00", status: "Paid" },
          ].map((invoice) => (
            <div
              key={invoice.date}
              className="bg-muted/30 flex items-center justify-between rounded-3xl border px-4 py-3"
            >
              <div className="flex items-center gap-6">
                <div className="min-w-[100px]">
                  <div className="text-sm font-medium">{invoice.date}</div>
                </div>
                <div className="text-muted-foreground text-sm">
                  {invoice.amount}
                </div>
                <Badge variant="secondary">{invoice.status}</Badge>
              </div>
              <Button variant="ghost" size="sm">
                Download
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-4xl">
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>
            Track your API usage and remaining quota.
          </CardDescription>
        </CardHeader>
        <Separator className="mb-6" />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>API calls this month</span>
              <span className="font-medium">12,458 / 50,000</span>
            </div>
            <div className="bg-muted h-2 rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: "24.9%" }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Storage used</span>
              <span className="font-medium">3.2 GB / 10 GB</span>
            </div>
            <div className="bg-muted h-2 rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: "32%" }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

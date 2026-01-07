import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";
import { Button } from "@redux/ui/components/button";
import { Badge } from "@redux/ui/components/badge";

export default function BillingSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">Billing</h3>
        <p className="text-muted-foreground">
          Manage your subscription and billing information.
        </p>
      </div>

      <Card className="rounded-3xl border-none shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>
                You are currently on the Free plan.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="px-3 py-1">Free</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Upgrade to Pro for higher rate limits, priority support, and more.
          </p>
          <Button className="w-full sm:w-auto">Upgrade to Pro</Button>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-none shadow-md">
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
          <CardDescription>
            Add or remove payment methods.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">
            No payment methods added yet.
          </p>
          <Button variant="outline" className="mt-4">Add Payment Method</Button>
        </CardContent>
      </Card>
    </div>
  );
}

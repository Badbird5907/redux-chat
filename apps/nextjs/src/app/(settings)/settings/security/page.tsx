import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";
import { Button } from "@redux/ui/components/button";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";
import { Separator } from "@redux/ui/components/separator";

export const metadata = {
  title: "Security Settings",
};

export default function SecuritySettingsPage() {
  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Keep your account secure with strong authentication and session
          controls.
        </p>
      </div>

      <Card className="rounded-4xl">
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your password regularly to protect your account.
          </CardDescription>
        </CardHeader>
        <Separator className="mb-6" />
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline">Cancel</Button>
            <Button>Update password</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-4xl">
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Add an extra layer of security to your account.
          </CardDescription>
        </CardHeader>
        <Separator className="mb-6" />
        <CardContent className="space-y-4">
          <div className="bg-muted/30 rounded-3xl border p-4">
            <div className="text-sm font-medium">Status</div>
            <div className="text-muted-foreground mt-1 text-sm">
              Two-factor authentication is currently <b>disabled</b>.
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline">Learn more</Button>
            <Button>Enable 2FA</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-4xl">
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>
            Review devices currently signed in to your account.
          </CardDescription>
        </CardHeader>
        <Separator className="mb-6" />
        <CardContent className="space-y-3">
          {["Chrome on macOS · New York, US", "Safari on iOS · London, UK"].map(
            (label) => (
              <div
                key={label}
                className="bg-muted/30 flex items-center justify-between rounded-3xl border px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{label}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    Last active: just now
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Sign out
                </Button>
              </div>
            ),
          )}

          <div className="flex justify-end pt-2">
            <Button variant="destructive">Sign out of all sessions</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

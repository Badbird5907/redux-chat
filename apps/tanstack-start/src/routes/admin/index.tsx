import { createFileRoute, Link } from "@tanstack/react-router";
import { Gift, Users } from "lucide-react";

import { Button } from "@redux/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "Admin | Redux Chat" }],
  }),
  component: AdminOverviewPage,
});

function AdminOverviewPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          Admin
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Internal tools for user management.
        </p>
      </div>
      <Card className="border-border/80">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="size-5" />
              Users
            </CardTitle>
            <CardDescription>
              List, search, and inspect accounts
            </CardDescription>
          </div>
          <Button render={<Link to="/admin/users" />}>Open</Button>
        </CardHeader>
      </Card>
      <Card className="border-border/80">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gift className="size-5" />
              Promotions
            </CardTitle>
            <CardDescription>
              Create redeemable codes and review every usage
            </CardDescription>
          </div>
          <Button render={<Link to="/admin/promotions" />}>Open</Button>
        </CardHeader>
      </Card>
    </div>
  );
}

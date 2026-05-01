import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import * as z from "zod";

import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@redux/ui/components/field";
import { Input } from "@redux/ui/components/input";
import { Separator } from "@redux/ui/components/separator";
import { Skeleton } from "@redux/ui/components/skeleton";
import GithubIcon from "@redux/ui/icons/github";

import { authClient } from "@/lib/auth/client";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm the new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const Route = createFileRoute("/settings/security")({
  component: SecurityRouteComponent,
});

function SecurityRouteComponent() {
  const { data: session, isPending } = authClient.useSession();
  const [isLinkingGithub, setIsLinkingGithub] = useState(false);

  const emailForm = useForm({
    defaultValues: {
      email: session?.user.email ?? "",
    },
    validators: {
      onSubmit: emailSchema,
    },
    onSubmit: async ({ value }) => {
      if (!session) {
        return;
      }

      if (value.email === session.user.email) {
        toast.info("Enter a different email address to update your account.");
        return;
      }

      const result = await authClient.changeEmail({
        newEmail: value.email,
        callbackURL: "/settings/security",
      });

      if (result.error) {
        toast.error(result.error.message);
        return;
      }

      toast.success("Check your email to finish changing your address.");
    },
  });

  const passwordForm = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: passwordSchema,
    },
    onSubmit: async ({ value }) => {
      const result = await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: true,
      });

      if (result.error) {
        toast.error(result.error.message);
        return;
      }

      passwordForm.reset();
      toast.success("Password updated. Other sessions were signed out.");
    },
  });

  const handleLinkGithub = async () => {
    setIsLinkingGithub(true);
    const result = await authClient.linkSocial({
      provider: "github",
    });

    if (result.error) {
      toast.error(result.error.message);
      setIsLinkingGithub(false);
      return;
    }

    toast.success("GitHub connection started.");
  };

  if (isPending) {
    return <SecuritySkeleton />;
  }

  if (!session) {
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Sign in to manage security</CardTitle>
            <CardDescription>
              Authentication settings are available once you are signed in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link to="/auth/sign-in" />}>Sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Badge variant="outline" className="w-fit">
          Security
        </Badge>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Security settings
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your email, password, and OAuth sign-in connections.
          </p>
        </div>
      </div>

      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle>Authentication overview</CardTitle>
          <CardDescription>
            A quick look at how this account can sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <SecurityTile
            icon={<Mail className="size-4" />}
            label="Email"
            value={session.user.email}
            status={session.user.emailVerified ? "Verified" : "Pending"}
          />
          <SecurityTile
            icon={<KeyRound className="size-4" />}
            label="Password"
            value="Email and password sign-in"
            status="Enabled"
          />
          <SecurityTile
            icon={<GithubIcon className="size-4" />}
            label="OAuth"
            value="GitHub social sign-in"
            status="Available"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Email address</CardTitle>
            <CardDescription>
              Better Auth will either update your email or start a verification
              flow, depending on server configuration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await emailForm.handleSubmit();
              }}
              className="space-y-4"
            >
              <Field>
                <FieldLabel>Current email</FieldLabel>
                <Input value={session.user.email} disabled />
                <FieldDescription>
                  This is the address currently attached to your account.
                </FieldDescription>
              </Field>

              <emailForm.Field
                name="email"
                children={(field) => (
                  <Field>
                    <FieldLabel>New email</FieldLabel>
                    <Input
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder="you@example.com"
                      type="email"
                    />
                    {field.state.meta.errors.length > 0 ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : null}
                  </Field>
                )}
              />

              <Button type="submit" disabled={emailForm.state.isSubmitting}>
                {emailForm.state.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mail className="size-4" />
                )}
                Update email
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Change your password and revoke other active sessions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await passwordForm.handleSubmit();
              }}
              className="space-y-4"
            >
              <passwordForm.Field
                name="currentPassword"
                children={(field) => (
                  <Field>
                    <FieldLabel>Current password</FieldLabel>
                    <Input
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      type="password"
                    />
                    {field.state.meta.errors.length > 0 ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : null}
                  </Field>
                )}
              />

              <passwordForm.Field
                name="newPassword"
                children={(field) => (
                  <Field>
                    <FieldLabel>New password</FieldLabel>
                    <Input
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      type="password"
                    />
                    {field.state.meta.errors.length > 0 ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : null}
                  </Field>
                )}
              />

              <passwordForm.Field
                name="confirmPassword"
                children={(field) => (
                  <Field>
                    <FieldLabel>Confirm new password</FieldLabel>
                    <Input
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      type="password"
                    />
                    {field.state.meta.errors.length > 0 ? (
                      <FieldError errors={field.state.meta.errors} />
                    ) : null}
                  </Field>
                )}
              />

              <Button type="submit" disabled={passwordForm.state.isSubmitting}>
                {passwordForm.state.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LockKeyhole className="size-4" />
                )}
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle>OAuth connections</CardTitle>
          <CardDescription>
            Link social providers so you can use them as alternate sign-in
            methods.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-border/60 bg-background/50 flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="bg-primary/10 text-primary rounded-lg p-2">
                <GithubIcon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">GitHub</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Connect your GitHub account using Better Auth social linking.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleLinkGithub}
              disabled={isLinkingGithub}
            >
              {isLinkingGithub ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <GithubIcon className="size-4" />
              )}
              Link GitHub
            </Button>
          </div>
          <Separator />
          <p className="text-muted-foreground text-sm">
            Connection removal and detailed provider metadata can be added once
            linked account listing is exposed through the app&apos;s auth API.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityTile({
  icon,
  label,
  value,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: string;
}) {
  return (
    <div className="border-border/60 bg-background/50 rounded-xl border p-4">
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
        {icon}
        {label}
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
      <Badge variant="outline" className="mt-3">
        <ShieldCheck className="size-3" />
        {status}
      </Badge>
    </div>
  );
}

function SecuritySkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </CardContent>
      </Card>
    </div>
  );
}

import { useCallback, useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Loader2, LockKeyhole, Mail, Unlink } from "lucide-react";
import { toast } from "sonner";
import * as z from "zod";

import { api } from "@redux/backend/convex/_generated/api";
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
import { Skeleton } from "@redux/ui/components/skeleton";
import GithubIcon from "@redux/ui/icons/github";
import GoogleIcon from "@redux/ui/icons/google";

import { MobileSidebarTrigger } from "@/components/layout/mobile-sidebar-trigger";
import { authClient } from "@/lib/auth/client";
import { useReducerState } from "@/lib/hooks/use-reducer-state";

const emailSchema = z.object({
  email: z.email("Please enter a valid email address"),
});

const passwordSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm the new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type AuthAccount = {
  id: string;
  providerId: string;
  accountId: string;
  userId: string;
  scopes: string[];
};

function SecurityRouteComponent() {
  const {
    data: session,
    isPending,
    refetch: refetchSession,
  } = authClient.useSession();
  const [accounts, setAccounts] = useReducerState<AuthAccount[] | null>(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useReducerState(false);
  const [isLinkingGithub, setIsLinkingGithub] = useReducerState(false);
  const [isUnlinkingGithub, setIsUnlinkingGithub] = useReducerState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useReducerState(false);
  const [isUnlinkingGoogle, setIsUnlinkingGoogle] = useReducerState(false);
  const setPassword = useMutation(api.functions.user.setPassword);

  const hasLoadedAccounts = accounts !== null;
  const hasPassword =
    accounts?.some((account) => account.providerId === "credential") === true;
  const hasGithub =
    accounts?.some((account) => account.providerId === "github") === true;
  const hasGoogle =
    accounts?.some((account) => account.providerId === "google") === true;
  const canUnlinkGithub = hasGithub && accounts.length > 1;
  const canUnlinkGoogle = hasGoogle && accounts.length > 1;

  const loadAccounts = useCallback(async () => {
    if (!session) {
      setAccounts(null);
      return;
    }

    setIsLoadingAccounts(true);
    const result = await authClient.listAccounts();

    if (result.error) {
      toast.error(result.error.message);
      setIsLoadingAccounts(false);
      return;
    }

    setAccounts(result.data);
    setIsLoadingAccounts(false);
  }, [session, setAccounts, setIsLoadingAccounts]);

  useEffect(() => {
    void Promise.resolve().then(loadAccounts);
  }, [loadAccounts]);

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
      if (hasPassword && value.currentPassword.length === 0) {
        toast.error("Current password is required.");
        return;
      }

      const result = hasPassword
        ? await authClient.changePassword({
            currentPassword: value.currentPassword,
            newPassword: value.newPassword,
            revokeOtherSessions: true,
          })
        : await setPassword({
            newPassword: value.newPassword,
          }).then(
            () => ({ error: null }),
            (error: unknown) => ({
              error: {
                message:
                  error instanceof Error
                    ? error.message
                    : "Unable to set password.",
              },
            }),
          );

      if (result.error) {
        toast.error(result.error.message);
        return;
      }

      passwordForm.reset();
      await loadAccounts();
      toast.success(
        hasPassword
          ? "Password updated. Other sessions were signed out."
          : "Password set. You can now sign in with email and password.",
      );
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

  const handleLinkGoogle = async () => {
    setIsLinkingGoogle(true);
    const result = await authClient.linkSocial({
      provider: "google",
    });

    if (result.error) {
      toast.error(result.error.message);
      setIsLinkingGoogle(false);
      return;
    }

    toast.success("Google connection started.");
  };

  const handleUnlinkGoogle = async () => {
    if (!canUnlinkGoogle) {
      toast.error(
        "Add a password or another sign-in method before disconnecting Google.",
      );
      return;
    }

    const confirmed = window.confirm(
      "Disconnect Google from this account? You will need another sign-in method to get back in.",
    );

    if (!confirmed) {
      return;
    }

    setIsUnlinkingGoogle(true);
    const result = await authClient.unlinkAccount({
      providerId: "google",
    });

    if (result.error) {
      toast.error(result.error.message);
      setIsUnlinkingGoogle(false);
      return;
    }

    await loadAccounts();
    await refetchSession();
    setIsUnlinkingGoogle(false);
    toast.success("Google disconnected.");
  };

  const handleUnlinkGithub = async () => {
    if (!canUnlinkGithub) {
      toast.error(
        "Add a password or another sign-in method before disconnecting GitHub.",
      );
      return;
    }

    const confirmed = window.confirm(
      "Disconnect GitHub from this account? You will need another sign-in method to get back in.",
    );

    if (!confirmed) {
      return;
    }

    setIsUnlinkingGithub(true);
    const result = await authClient.unlinkAccount({
      providerId: "github",
    });

    if (result.error) {
      toast.error(result.error.message);
      setIsUnlinkingGithub(false);
      return;
    }

    await loadAccounts();
    await refetchSession();
    setIsUnlinkingGithub(false);
    toast.success("GitHub disconnected.");
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="border-border border-b pb-6">
        <div className="flex items-start gap-2">
          <MobileSidebarTrigger className="mt-0.5" />
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Security
            </p>
            <h1 className="mt-2 text-xl font-semibold">Security settings</h1>
            <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
              Manage your email, password, and OAuth sign-in connections.
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-card ring-border rounded-lg shadow-none ring-1">
          <CardHeader className="border-border border-b pb-4">
            <CardTitle>Email address</CardTitle>
            <CardDescription>Update your email address.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async () => {
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

              <emailForm.Field name="email">
                {(field) => (
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
              </emailForm.Field>

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

        <Card className="bg-card ring-border rounded-lg shadow-none ring-1">
          <CardHeader className="border-border border-b pb-4">
            <CardTitle>Password</CardTitle>
            <CardDescription>
              {hasPassword
                ? "Change your password and revoke other active sessions."
                : "Add a password so you can sign in without OAuth."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async () => {
                await passwordForm.handleSubmit();
              }}
              className="space-y-4"
            >
              {hasPassword ? (
                <passwordForm.Field name="currentPassword">
                  {(field) => (
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
                </passwordForm.Field>
              ) : (
                <div className="bg-muted/40 border-border rounded-md border px-3 py-2.5 text-sm">
                  <p className="font-medium">No password is set</p>
                  <p className="text-muted-foreground mt-1.5 leading-relaxed">
                    Your account currently signs in with{" "}
                    {[hasGithub && "GitHub", hasGoogle && "Google"]
                      .filter(Boolean)
                      .join(" and ") || "OAuth"}{" "}
                    only. Set a password before removing your last social login.
                  </p>
                </div>
              )}

              <passwordForm.Field name="newPassword">
                {(field) => (
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
              </passwordForm.Field>

              <passwordForm.Field name="confirmPassword">
                {(field) => (
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
              </passwordForm.Field>

              <Button
                type="submit"
                disabled={passwordForm.state.isSubmitting || !hasLoadedAccounts}
              >
                {passwordForm.state.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LockKeyhole className="size-4" />
                )}
                {hasPassword ? "Change password" : "Set password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card ring-border rounded-lg shadow-none ring-1">
        <CardHeader className="border-border border-b pb-4">
          <CardTitle>OAuth connections</CardTitle>
          <CardDescription>
            Link social providers so you can use them as alternate sign-in
            methods.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 px-0 pt-0">
          <div className="divide-border divide-y">
            <div className="flex flex-col gap-3 px-6 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <GithubIcon
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium">GitHub</p>
                  <p className="text-muted-foreground text-sm">
                    {!hasLoadedAccounts
                      ? "Checking connection..."
                      : hasGithub
                        ? "Connected as a sign-in method."
                        : "Not connected."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!hasLoadedAccounts ? (
                  <Button variant="outline" disabled>
                    <Loader2 className="size-4 animate-spin" />
                    Checking
                  </Button>
                ) : hasGithub ? (
                  <Button
                    variant="destructive"
                    onClick={handleUnlinkGithub}
                    disabled={
                      isLoadingAccounts || isUnlinkingGithub || !canUnlinkGithub
                    }
                    tooltip={
                      canUnlinkGithub
                        ? undefined
                        : "Add a password or another social login before disconnecting."
                    }
                  >
                    {isUnlinkingGithub ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Unlink className="size-4" />
                    )}
                    Disconnect
                  </Button>
                ) : (
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
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 px-6 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <GoogleIcon
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium">Google</p>
                  <p className="text-muted-foreground text-sm">
                    {!hasLoadedAccounts
                      ? "Checking connection..."
                      : hasGoogle
                        ? "Connected as a sign-in method."
                        : "Not connected."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!hasLoadedAccounts ? (
                  <Button variant="outline" disabled>
                    <Loader2 className="size-4 animate-spin" />
                    Checking
                  </Button>
                ) : hasGoogle ? (
                  <Button
                    variant="destructive"
                    onClick={handleUnlinkGoogle}
                    disabled={
                      isLoadingAccounts || isUnlinkingGoogle || !canUnlinkGoogle
                    }
                    tooltip={
                      canUnlinkGoogle
                        ? undefined
                        : "Add a password or another social login before disconnecting."
                    }
                  >
                    {isUnlinkingGoogle ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Unlink className="size-4" />
                    )}
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleLinkGoogle}
                    disabled={isLinkingGoogle}
                  >
                    {isLinkingGoogle ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <GoogleIcon className="size-4" />
                    )}
                    Link Google
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecuritySkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="border-border space-y-3 border-b pb-6">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="ring-border rounded-lg shadow-none ring-1">
          <CardHeader className="border-border border-b pb-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-9 w-28" />
          </CardContent>
        </Card>
        <Card className="ring-border rounded-lg shadow-none ring-1">
          <CardHeader className="border-border border-b pb-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-9 w-32" />
          </CardContent>
        </Card>
      </div>
      <Card className="ring-border rounded-lg shadow-none ring-1">
        <CardHeader className="border-border border-b pb-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 max-w-md" />
        </CardHeader>
        <CardContent className="divide-border divide-y border-t px-0 pt-0">
          <div className="flex justify-between gap-4 px-6 py-4">
            <Skeleton className="h-12 flex-1" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="flex justify-between gap-4 px-6 py-4">
            <Skeleton className="h-12 flex-1" />
            <Skeleton className="h-9 w-24" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/settings/security")({
  component: SecurityRouteComponent,
});

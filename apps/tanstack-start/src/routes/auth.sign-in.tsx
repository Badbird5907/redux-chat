import { useForm } from "@tanstack/react-form";
import {
  createFileRoute,
  Link,
  redirect,
  useSearch,
} from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { toast } from "sonner";
import * as z from "zod";

import { Button } from "@redux/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";
import { Field, FieldError, FieldLabel } from "@redux/ui/components/field";
import { Input } from "@redux/ui/components/input";

import { ReduxChatBrand } from "@/components/auth/redux-chat-brand";
import { SocialOAuthSection } from "@/components/auth/social-oauth-section";
import { authClient } from "@/lib/auth/client";
import { sanitizeAuthRedirect } from "@/lib/auth/redirect";

const signInSchema = z.object({
  email: z.email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

function SignInPage() {
  const { next } = useSearch({ from: "/auth/sign-in" });
  const redirectTo = sanitizeAuthRedirect(next);
  const posthog = usePostHog();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: signInSchema,
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email({
        email: value.email,
        password: value.password,
        fetchOptions: {
          onSuccess: () => {
            posthog.identify(value.email, { email: value.email });
            posthog.capture("user_signed_in", { method: "email" });
            localStorage.setItem("last-used-provider", "email");
            window.location.assign(redirectTo);
          },
          onError: (ctx) => {
            toast.error(ctx.error.message);
          },
        },
      });
    },
  });

  return (
    <>
      <ReduxChatBrand />
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>
            Welcome back! Please sign in to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SocialOAuthSection
            googleButtonLabel="Sign in with Google"
            githubButtonLabel="Sign in with GitHub"
            callbackURL={redirectTo}
          />

          <form
            action={async () => {
              await form.handleSubmit();
            }}
            className="space-y-4"
          >
            <form.Field name="email">
              {(field) => (
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="hello@example.com"
                  />
                  {field.state.meta.errors.length > 0 && (
                    <FieldError errors={field.state.meta.errors} />
                  )}
                </Field>
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel>Password</FieldLabel>
                    <Link
                      to="/auth/forgot-password"
                      className="text-muted-foreground text-sm hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    type="password"
                    placeholder="••••••••"
                  />
                  {field.state.meta.errors.length > 0 && (
                    <FieldError errors={field.state.meta.errors} />
                  )}
                </Field>
              )}
            </form.Field>
            <Button
              className="w-full"
              type="submit"
              disabled={form.state.isSubmitting}
            >
              {form.state.isSubmitting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Sign In
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <div className="text-muted-foreground text-sm">
            Don&apos;t have an account?{" "}
            <Link
              to="/auth/sign-up"
              search={{ next: redirectTo }}
              className="text-primary hover:underline"
            >
              Sign up
            </Link>
          </div>
        </CardFooter>
      </Card>
    </>
  );
}

export const Route = createFileRoute("/auth/sign-in")({
  validateSearch: (search): { next?: string } => {
    if (typeof search.next !== "string") {
      return {};
    }
    return { next: sanitizeAuthRedirect(search.next) };
  },
  beforeLoad: ({ context, search }) => {
    if (context.isAuthenticated) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: sanitizeAuthRedirect(search.next) });
    }
  },
  component: SignInPage,
});

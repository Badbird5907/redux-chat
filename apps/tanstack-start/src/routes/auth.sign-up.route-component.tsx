import { useForm } from "@tanstack/react-form";
import { Link, useSearch } from "@tanstack/react-router";
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

const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export function SignUpPage() {
  const { next } = useSearch({ from: "/auth/sign-up" });
  const redirectTo = sanitizeAuthRedirect(next);
  const posthog = usePostHog();

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    validators: {
      onSubmit: signUpSchema,
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email({
        email: value.email,
        password: value.password,
        name: value.name,
        fetchOptions: {
          onSuccess: () => {
            posthog.identify(value.email, {
              email: value.email,
              name: value.name,
            });
            posthog.capture("user_signed_up", { method: "email" });
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
          <CardTitle>Sign Up</CardTitle>
          <CardDescription>Create an account to get started.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SocialOAuthSection
            googleButtonLabel="Sign up with Google"
            githubButtonLabel="Sign up with GitHub"
            callbackURL={redirectTo}
          />

          <form
            action={async () => {
              await form.handleSubmit();
            }}
            className="space-y-4"
          >
            <form.Field name="name">
              {(field) => (
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="John Doe"
                  />
                  {field.state.meta.errors.length > 0 && (
                    <FieldError errors={field.state.meta.errors} />
                  )}
                </Field>
              )}
            </form.Field>
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
                  <FieldLabel>Password</FieldLabel>
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
              Sign Up
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <div className="text-muted-foreground text-sm">
            Already have an account?{" "}
            <Link
              to="/auth/sign-in"
              search={{ next: redirectTo }}
              className="text-primary hover:underline"
            >
              Sign in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </>
  );
}

import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
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

const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const Route = createFileRoute("/auth/sign-up")({
  beforeLoad: ({ context }) => {
    if (context.isAuthenticated) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/" });
    }
  },
  component: SignUpPage,
});

function SignUpPage() {
  const redirectTo = safeInternalRedirect(
    typeof window === "undefined"
      ? undefined
      : (new URLSearchParams(window.location.search).get("redirect") ??
          undefined),
  );

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
            onSubmit={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              await form.handleSubmit();
            }}
            className="space-y-4"
          >
            <form.Field
              name="name"
              children={(field) => (
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
            />
            <form.Field
              name="email"
              children={(field) => (
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
            />
            <form.Field
              name="password"
              children={(field) => (
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
            />
            <Button
              className="w-full"
              type="submit"
              disabled={form.state.isSubmitting}
            >
              {form.state.isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Sign Up
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <div className="text-muted-foreground text-sm">
            Already have an account?{" "}
            <Link to="/auth/sign-in" className="text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </>
  );
}

function safeInternalRedirect(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

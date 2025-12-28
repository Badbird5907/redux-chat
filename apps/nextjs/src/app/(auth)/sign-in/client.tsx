"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/auth/client";
import { useForm } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as z from "zod";

import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@redux/ui/components/field";
import { Input } from "@redux/ui/components/input";
import { Separator } from "@redux/ui/components/separator";
import GithubIcon from "@redux/ui/icons/github";

const signInSchema = z.object({
  email: z.email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function SignInPage() {
  const router = useRouter();
  const [lastUsed, setLastUsed] = React.useState<string | null>(null);
  const [isGitHubLoading, setIsGitHubLoading] = React.useState(false);

  React.useEffect(() => {
    setLastUsed(localStorage.getItem("last-used-provider"));
  }, []);

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
             localStorage.setItem("last-used-provider", "email");
             router.push("/");
             router.refresh();
          },
          onError: (ctx) => {
             toast.error(ctx.error.message);
          }
        }
      });
    },
  });

  const handleGitHubSignIn = async () => {
    setIsGitHubLoading(true);
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "/",
      fetchOptions: {
        onSuccess: () => {
          localStorage.setItem("last-used-provider", "github");
        },
        onError: (ctx) => {
          toast.error(ctx.error.message);
          setIsGitHubLoading(false);
        },
      },
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>
          Welcome back! Please sign in to continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleGitHubSignIn}
            disabled={isGitHubLoading}
          >
            {isGitHubLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GithubIcon width={24} height={24} />
            )}
            Sign in with GitHub
          </Button>
          {lastUsed === "github" && (
            <Badge
              variant="outline"
              className="absolute -right-2 -top-2 bg-muted"
            >
              Last Used
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Separator className="flex-1" />
          <span className="text-muted-foreground text-xs">OR</span>
          <Separator className="flex-1" />
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await form.handleSubmit();
          }}
          className="space-y-4"
        >
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
                  <div className="flex items-center justify-between">
                    <FieldLabel>Password</FieldLabel>
                    <Link
                        href="/forgot-password"
                        className="text-sm text-muted-foreground hover:underline"
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
            />
          <Button className="w-full" type="submit" disabled={form.state.isSubmitting}>
             {form.state.isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Sign In
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-muted-foreground text-sm">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}


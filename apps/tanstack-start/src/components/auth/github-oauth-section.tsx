import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Separator } from "@redux/ui/components/separator";
import GithubIcon from "@redux/ui/icons/github";

import { authClient } from "@/lib/auth/client";

type GithubOAuthSectionProps = {
  buttonLabel: string;
  showDivider?: boolean;
};

export function GithubOAuthSection({
  buttonLabel,
  showDivider = true,
}: GithubOAuthSectionProps) {
  const [lastUsed] = React.useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : localStorage.getItem("last-used-provider"),
  );
  const [isGitHubLoading, setIsGitHubLoading] = React.useState(false);

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
    <>
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
          {buttonLabel}
        </Button>
        {lastUsed === "github" && (
          <Badge
            variant="outline"
            className="bg-muted absolute -top-2 -right-2"
          >
            Last Used
          </Badge>
        )}
      </div>

      {showDivider ? (
        <div className="flex items-center gap-2">
          <Separator className="flex-1" />
          <span className="text-muted-foreground text-xs">OR</span>
          <Separator className="flex-1" />
        </div>
      ) : null}
    </>
  );
}

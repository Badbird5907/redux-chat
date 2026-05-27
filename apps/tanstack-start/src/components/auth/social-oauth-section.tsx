import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Separator } from "@redux/ui/components/separator";
import GithubIcon from "@redux/ui/icons/github";
import GoogleIcon from "@redux/ui/icons/google";

import { authClient } from "@/lib/auth/client";

type SocialOAuthSectionProps = {
  callbackURL: string;
  githubButtonLabel: string;
  googleButtonLabel: string;
  showDivider?: boolean;
};

type ProviderId = "github" | "google";

export function SocialOAuthSection({
  callbackURL,
  githubButtonLabel,
  googleButtonLabel,
  showDivider = true,
}: SocialOAuthSectionProps) {
  const [lastUsed] = React.useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : localStorage.getItem("last-used-provider"),
  );
  const [loadingProvider, setLoadingProvider] =
    React.useState<ProviderId | null>(null);

  const startSocialSignIn = async (provider: ProviderId) => {
    setLoadingProvider(provider);
    await authClient.signIn.social({
      provider,
      callbackURL,
      fetchOptions: {
        onSuccess: () => {
          localStorage.setItem("last-used-provider", provider);
        },
        onError: (ctx) => {
          toast.error(ctx.error.message);
          setLoadingProvider(null);
        },
      },
    });
  };

  const oauthBusy = loadingProvider !== null;

  return (
    <>
      <div className="space-y-3">
        <div className="relative">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void startSocialSignIn("google")}
            disabled={oauthBusy}
          >
            {loadingProvider === "google" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon width={24} height={24} className="mr-2 shrink-0" />
            )}
            {googleButtonLabel}
          </Button>
          {lastUsed === "google" && (
            <Badge
              variant="outline"
              className="bg-muted absolute -top-2 -right-2"
            >
              Last Used
            </Badge>
          )}
        </div>

        <div className="relative">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void startSocialSignIn("github")}
            disabled={oauthBusy}
          >
            {loadingProvider === "github" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GithubIcon width={24} height={24} />
            )}
            {githubButtonLabel}
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

import { useMemo } from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@redux/ui/components/avatar";
import { cn } from "@redux/ui/lib/utils";

import { api } from "@redux/backend/convex/_generated/api";
import { useQuery } from "@/lib/hooks/convex";

interface UserAvatarProps {
  userId?: string;
  name?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function UserAvatar({ userId = "me", name, className, size }: UserAvatarProps) {
  const image = useQuery(api.functions.user.getUserImage, { userId });

  const initials =
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "?";

  const sizeClass = useMemo(() => {
    switch (size) {
      case "sm":
        return "w-6 h-6";
      case "md":
        return "w-8 h-8";
      case "lg":
        return "w-10 h-10";
      default:
        return "w-8 h-8";
    }
  }, [size]);

  return (
    <Avatar className={cn(sizeClass, className)}>
      <AvatarImage src={image?.image ?? undefined} alt={name ?? "User"} />
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}

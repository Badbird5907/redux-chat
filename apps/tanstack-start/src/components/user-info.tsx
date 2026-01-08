
import { UserAvatar } from "@/components/user-avatar";

interface UserInfoProps {
  userId: string;
  name: string;
  email: string;
  className?: string;
}

export function UserInfo({ userId, name, email, className }: UserInfoProps) {
  return (
    <span className={`flex items-center gap-2 px-2 py-2 ${className ?? ""}`}>
      <UserAvatar size="lg" userId={userId} name={name} />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-muted-foreground truncate text-xs">{email}</span>
      </span>
    </span>
  );
}

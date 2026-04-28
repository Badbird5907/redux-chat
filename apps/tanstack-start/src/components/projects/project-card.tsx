import { Link } from "@tanstack/react-router";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";

interface ProjectCardProps {
  projectId: string;
  name: string;
  description?: string;
  updatedAt: number;
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function ProjectCard({
  projectId,
  name,
  description,
  updatedAt,
}: ProjectCardProps) {
  return (
    <Link to="/projects/$id" params={{ id: projectId }} className="block">
      <Card className="hover:bg-card/80 h-full transition-colors">
        <CardHeader>
          <CardTitle className="truncate">{name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-between gap-6">
          {description ? (
            <p className="text-muted-foreground line-clamp-3 text-sm">
              {description}
            </p>
          ) : (
            <p className="text-muted-foreground/60 line-clamp-3 text-sm italic">
              No description
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            Updated {formatRelativeTime(updatedAt)}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

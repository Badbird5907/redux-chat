"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@redux/ui/lib/utils";

const items = [
  {
    title: "General",
    description: "Profile, preferences, and appearance",
    href: "/settings",
  },
  {
    title: "Security",
    description: "Password, sessions, and 2FA",
    href: "/settings/security",
  },
  {
    title: "Billing",
    description: "Plans, invoices, and usage",
    href: "/settings/billing",
  },
  {
    title: "Notifications",
    description: "Email and in-app alerts",
    href: "/settings/notifications",
  },
];

export function SettingsNav() {
  const pathname = usePathname();
  const router = useRouter();

  const currentItem = items.find((item) => {
    if (item.href === "/settings") {
      return pathname === "/settings";
    }
    return pathname.startsWith(item.href);
  });

  return (
    <>
      {/* Mobile dropdown */}
      <div className="mb-4 lg:hidden">
        <select
          value={currentItem?.href ?? "/settings"}
          onChange={(e) => router.push(e.target.value)}
          className="bg-card ring-foreground/10 text-foreground w-full rounded-3xl px-4 py-3 text-sm font-medium shadow-xs ring-1 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {items.map((item) => (
            <option key={item.href} value={item.href}>
              {item.title}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-[320px] shrink-0 lg:block">
        <div className="bg-card/60 ring-foreground/10 rounded-4xl p-3 shadow-xs ring-1">
          <div className="px-3 pt-3 pb-2">
            <div className="text-lg leading-none font-medium">Settings</div>
            <div className="text-muted-foreground mt-1 text-sm">
              Manage your account and workspace.
            </div>
          </div>

          <nav className="flex flex-col gap-1 p-2">
            {items.map((item) => {
              const active =
                item.href === "/settings"
                  ? pathname === "/settings"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group rounded-3xl px-3 py-3 transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent/15",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {item.title}
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 line-clamp-2 text-xs",
                          active
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        {item.description}
                      </div>
                    </div>

                    <div
                      className={cn(
                        "mt-1 size-2 rounded-full",
                        active ? "bg-primary-foreground" : "bg-transparent",
                      )}
                    />
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}

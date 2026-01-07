"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cpu,
  CreditCard,
  Database,
  Lock,
  Settings,
  User,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@redux/ui/components/sidebar";

import { AppSidebarFooter } from "@/components/sidebar/footer";

const settingsItems = [
  {
    title: "General",
    href: "/settings/general",
    icon: User,
  },
  {
    title: "Billing",
    href: "/settings/billing",
    icon: CreditCard,
  },
  {
    title: "Security",
    href: "/settings/security",
    icon: Lock,
  },
  {
    title: "Models",
    href: "/settings/models",
    icon: Cpu,
  },
  {
    title: "RAG",
    href: "/settings/rag",
    icon: Database,
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar className="border-none">
      <SidebarHeader className="pt-4">
        <Link href="/" className="self-center text-2xl font-bold" prefetch>
          <h1>
            <span className="font-audiowide">Redux.chat</span>
          </h1>
        </Link>
        <div className="mt-2 border-t" />
      </SidebarHeader>
      <SidebarContent
        className="scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <SidebarGroup>
          <h2 className="px-4 text-lg font-semibold tracking-tight mb-2 mt-4">
            Settings
          </h2>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="border-t" />
        <AppSidebarFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

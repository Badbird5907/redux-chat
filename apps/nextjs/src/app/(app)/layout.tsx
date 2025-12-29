import { SidebarProvider, SidebarTrigger } from "@redux/ui/components/sidebar";
import AppSidebar from "@/components/sidebar";
import ThreadList from "@/components/sidebar/chat/thread-list";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar>
        <ThreadList />
      </AppSidebar>
      <div className="h-screen w-screen p-2">
        <div className="bg-card/80 h-full w-full rounded-4xl p-4">
          <div className="flex justify-between items-center w-fit rounded-md bg-card/80 p-1">
            <SidebarTrigger />
          </div>
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
}

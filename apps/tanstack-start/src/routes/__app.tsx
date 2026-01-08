import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SidebarProvider, SidebarTrigger } from "@redux/ui/components/sidebar";
import { getToken } from "@/lib/auth-server";
import AppSidebar from "@/components/sidebar";
import ThreadList from "@/components/sidebar/chat/thread-list";
import { ConvexClientProvider } from "@/providers/convex";
import { useRouteContext } from '@tanstack/react-router';

export const Route = createFileRoute('/app')({
  component: AppLayout,
  beforeLoad: async () => {
    const token = await getToken();
    if (!token) {
      // Redirect to auth if not authenticated
      return {
        redirect: '/auth/sign-in'
      };
    }
    return {
      isAuthenticated: true,
    };
  },
})

function AppLayout() {
  const context = useRouteContext({ from: Route.id });
  
  // Get sidebar config from document.cookie on client side
  const getSidebarConfig = () => {
    if (typeof window === 'undefined') return [undefined, undefined];
    const configCookie = document.cookie
      .split(';')
      .find(c => c.trim().startsWith('sidebar:config='))
      ?.value?.split('=')[1];
    
    if (!configCookie) return [undefined, undefined];
    
    const [openState, savedWidth] = configCookie.split(":");
    return [
      openState !== undefined ? openState === "true" : undefined,
      savedWidth
    ];
  };

  const [defaultOpen, defaultWidth] = getSidebarConfig();

  return (
    <ConvexClientProvider initialToken={context?.token}>
      <SidebarProvider defaultOpen={defaultOpen} defaultWidth={defaultWidth}>
        <AppSidebar>
          <ThreadList />
        </AppSidebar>
        <div className="h-screen w-screen flex flex-col p-2">
          <div className="bg-card/80 flex-1 w-full rounded-4xl p-4 overflow-hidden">
            <div className="bg-card/80 flex w-fit items-center justify-between rounded-md p-1">
              <SidebarTrigger />
            </div>
            <Outlet />
          </div>
        </div>
      </SidebarProvider>
    </ConvexClientProvider>
  );
}
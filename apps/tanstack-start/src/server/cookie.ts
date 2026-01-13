import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

export const getSidebarConfig = createServerFn({ method: "GET" }).handler(() => {
  return getCookie("sidebar:config") ?? null;
});
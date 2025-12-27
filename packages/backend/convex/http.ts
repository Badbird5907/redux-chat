import { httpRouter } from "convex/server";
import { authComponent, initAuth } from "./auth";

const http = httpRouter();

authComponent.registerRoutes(http, initAuth);

export default http;
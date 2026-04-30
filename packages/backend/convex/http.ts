import { httpRouter } from "convex/server";

import { authComponent, initAuth } from "./auth";
import { polar } from "./polar";

const http = httpRouter();

authComponent.registerRoutes(http, initAuth);
polar.registerRoutes(http);

export default http;

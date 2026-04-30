import { defineApp } from "convex/server";
import polar from "@convex-dev/polar/convex.config";

import betterAuth from "./betterAuth/convex.config";

const app = defineApp();
app.use(betterAuth);
app.use(polar);

export default app;

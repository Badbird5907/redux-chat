import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Native crons are registered automatically on every `convex deploy`, so the
// expired skill-proposal payload cleanup runs without any manual registration
// step. This drops proposal file contents once they expire.
crons.interval(
  "cleanup-expired-skill-proposals",
  { hours: 1 },
  internal.functions.skills.internal_cleanupExpiredProposals,
  {},
);

export default crons;

import { paginationOptsValidator } from "convex/server";
import { query } from "./index";

// Deterministic fake thread generation using a seeded approach
function generateFakeThread(index: number) {
  const names = [
    "Project Planning",
    "Team Standup",
    "Design Review",
    "Bug Triage",
    "Feature Discussion",
    "Sprint Planning",
    "Code Review",
    "Architecture Discussion",
    "Performance Optimization",
    "User Research",
    "Product Roadmap",
    "API Design",
    "Database Migration",
    "Security Review",
    "Deployment Strategy",
    "Customer Feedback",
    "Testing Strategy",
    "Documentation",
    "Onboarding",
    "Retrospective",
  ];

  const adjectives = [
    "Weekly",
    "Daily",
    "Monthly",
    "Urgent",
    "Follow-up",
    "Initial",
    "Final",
    "Quick",
    "Deep",
    "Async",
  ];

  // Use index to deterministically select name and adjective
  const nameIndex = index % names.length;
  const adjIndex = Math.floor(index / names.length) % adjectives.length;
  const suffix = Math.floor(index / (names.length * adjectives.length));

  const name =
    suffix > 0
      ? `${adjectives[adjIndex]} ${names[nameIndex]} #${suffix + 1}`
      : `${adjectives[adjIndex]} ${names[nameIndex]}`;

  // Generate a deterministic timestamp going back in time
  // Start from a fixed reference point (Jan 1, 2025) and go backwards
  const baseTime = new Date("2025-01-01T12:00:00Z").getTime();
  // Each thread is between 1 hour and 30 days older than the previous
  const hoursBack = index * (1 + ((index * 7) % 24)); // Deterministic hours back
  const timestamp = baseTime - hoursBack * 60 * 60 * 1000;

  return {
    _id: `thread_${index}` as const,
    name,
    timestamp,
    _creationTime: timestamp,
  };
}

export const getThreads = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: (ctx, args) => {
    // Generate fake threads for testing
    const TOTAL_THREADS = 500; // Total fake threads available
    const { numItems, cursor } = args.paginationOpts;

    // Parse cursor to get the current offset
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const endIndex = Math.min(startIndex + numItems, TOTAL_THREADS);

    // Generate the page of threads
    const page = [];
    for (let i = startIndex; i < endIndex; i++) {
      page.push(generateFakeThread(i));
    }

    // Determine if there are more items
    const isDone = endIndex >= TOTAL_THREADS;
    const continueCursor = isDone ? "" : endIndex.toString();

    return {
      page,
      isDone,
      continueCursor,
    };
  },
});

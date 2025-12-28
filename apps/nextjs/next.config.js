// Validate env at build time only (not on every HMR reload)
if (process.env.npm_lifecycle_event === "build") {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url);
  await jiti.import("./src/env");
}

/** @type {import("next").NextConfig} */
const config = {
  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    "@redux/backend",
    "@redux/ui",
    "@redux/validators",
  ],

  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },
};

export default config;

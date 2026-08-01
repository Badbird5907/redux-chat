import { createSiloCoreFromToken } from "@silo-storage/sdk-core";

const confirm = process.argv.includes("--confirm");
for (const name of ["SILO_URL", "SILO_TOKEN", "SILO_CDN"]) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const silo = createSiloCoreFromToken({
  url: process.env.SILO_URL,
  token: process.env.SILO_TOKEN,
  cdnHost: process.env.SILO_CDN,
});

const filesById = new Map();
for (const kind of ["skill", "skill-original", "skill-chunk"]) {
  let page = 1;
  while (true) {
    const result = await silo.listFiles({
      metadata: { kind },
      page,
      pageSize: 100,
      status: "all",
    });
    for (const file of result.files) filesById.set(file.id, file);
    if (!result.pagination.hasNextPage) break;
    page += 1;
  }
}

const files = [...filesById.values()];
console.log(
  `${confirm ? "Deleting" : "Would delete"} ${files.length} skill storage objects.`,
);
if (!confirm) {
  console.log("Re-run with --confirm to delete them.");
  process.exit(0);
}

const batchSize = 10;
for (let index = 0; index < files.length; index += batchSize) {
  const batch = files.slice(index, index + batchSize);
  const results = await Promise.allSettled(
    batch.map((file) =>
      silo.deleteFile({
        projectId: file.projectId,
        environmentId: file.environmentId,
        fileKeyId: file.id,
        accessKey: file.accessKey,
      }),
    ),
  );
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length)
    throw new Error(`Failed to delete ${failed.length} objects`);
}

console.log(`Deleted ${files.length} skill storage objects.`);

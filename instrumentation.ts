export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { prepareDatabaseFromEnv } = await import("./lib/startup");
  await prepareDatabaseFromEnv();
}

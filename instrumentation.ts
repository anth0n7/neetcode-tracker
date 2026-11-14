export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { prepareDatabaseOrExit } = await import("./lib/startup");
  await prepareDatabaseOrExit();
}

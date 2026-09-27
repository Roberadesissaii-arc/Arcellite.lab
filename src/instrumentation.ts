/** Runs once when the Next.js server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { validateStartup } = await import("./server/startup")
  validateStartup()
}

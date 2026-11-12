// The wrapper every API route goes through, so each route file only has to say
// what is specific to it.
import { checkRequest, HttpError } from "./http";

// Run a route's work with the standard safety net:
//   1. check the request is allowed (localhost only; no cross-site changes),
//   2. run the route,
//   3. turn any HttpError it throws into a JSON error response like
//      { "error": "rating must be one of: ..." } with the right status,
//   4. turn any OTHER error into a generic 500, so internals never leak.
export async function handle(request: Request, work: () => Promise<Response>): Promise<Response> {
  try {
    checkRequest({
      method: request.method,
      // Next's server always sends a Host header. Falling back to the URL's
      // host keeps the check usable when a route is called directly (tests).
      host: request.headers.get("host") ?? new URL(request.url).host,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    });
    return await work();
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error); // goes to the log file; the client only sees a generic message
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Read the request body as a JSON object, or fail with a 400.
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, "Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

import { checkRequest, HttpError } from "./http";

export async function handle(request: Request, work: () => Promise<Response>): Promise<Response> {
  try {
    checkRequest({
      method: request.method,
      host: request.headers.get("host") ?? new URL(request.url).host,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    });
    return await work();
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

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

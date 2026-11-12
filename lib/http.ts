// Small helpers shared by every API route: errors that carry an HTTP status,
// and a check that only lets this computer's own pages talk to the API.

// Throw one of these anywhere in a route and the route wrapper (lib/route.ts)
// turns it into a JSON response like { "error": "..." } with this status.
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// The parts of a request that the safety check looks at.
export type RequestInfo = {
  method: string;
  host: string | null; // the Host header: which address the browser typed
  origin: string | null; // the Origin header: which page sent the request
  secFetchSite: string | null; // set by browsers: "same-origin", "cross-site", ...
};

// Only these names mean "this computer".
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// This app has no login, and it has endpoints that delete data. The server only
// listens on 127.0.0.1, but a web page open in your own browser can still send
// requests to it. This check blocks that. It throws a 403 unless the request is OK.
//
// 1. Every request: the Host must be a loopback name. This stops "DNS
//    rebinding", where a hostile site points its own name at 127.0.0.1.
// 2. Requests that change data (anything but GET/HEAD/OPTIONS): if a browser
//    says where the request came from, it must be this same app. Requests with
//    no Origin at all (curl, scripts) are not browsers, so they are allowed.
export function checkRequest(info: RequestInfo): void {
  const forbidden = (why: string) => new HttpError(403, `Forbidden: ${why}`);

  // --- 1. Host ---
  if (!info.host) throw forbidden("missing Host header");
  let hostname: string;
  try {
    hostname = new URL(`http://${info.host}`).hostname; // drops the port
  } catch {
    throw forbidden("bad Host header");
  }
  if (!LOOPBACK_HOSTS.has(hostname)) throw forbidden("this app only answers on localhost");

  // --- 2. Origin, for requests that change data ---
  if (["GET", "HEAD", "OPTIONS"].includes(info.method)) return;

  // Browsers label each request. Anything other than our own page (or the user
  // typing the address, "none") is refused, including a different local port.
  if (info.secFetchSite && !["same-origin", "none"].includes(info.secFetchSite)) {
    throw forbidden("cross-site request");
  }

  if (info.origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(info.origin).host; // includes the port
    } catch {
      throw forbidden("bad Origin header"); // e.g. the literal string "null"
    }
    if (originHost !== info.host) throw forbidden("request came from a different origin");
  }
}

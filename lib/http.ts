export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type RequestInfo = {
  method: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function checkRequest(info: RequestInfo): void {
  const forbidden = (why: string) => new HttpError(403, `Forbidden: ${why}`);

  if (!info.host) throw forbidden("missing Host header");
  let hostname: string;
  try {
    hostname = new URL(`http://${info.host}`).hostname;
  } catch {
    throw forbidden("bad Host header");
  }
  if (!LOOPBACK_HOSTS.has(hostname)) throw forbidden("this app only answers on localhost");

  if (["GET", "HEAD", "OPTIONS"].includes(info.method)) return;

  if (info.secFetchSite && !["same-origin", "none"].includes(info.secFetchSite)) {
    throw forbidden("cross-site request");
  }

  if (info.origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(info.origin).host;
    } catch {
      throw forbidden("bad Origin header");
    }
    if (originHost !== info.host) throw forbidden("request came from a different origin");
  }
}

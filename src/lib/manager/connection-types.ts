export type DeviceConnection =
  | { status: "idle" | "starting" }
  | { status: "ready"; origin: string }
  | { status: "error"; error: string };

export function isLocalAddress(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "localhost" || host.endsWith(".localhost") || /^127\./.test(host) || ["0.0.0.0", "[::1]", "[::]"].includes(host);
}

export function isPrivateAddress(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.endsWith(".local") || /^\[(f[cd]|fe80)/.test(host);
}

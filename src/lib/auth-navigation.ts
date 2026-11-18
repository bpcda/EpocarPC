export function authReturnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/account";
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : "/account";
  } catch {
    return "/account";
  }
}

export function sanitizeAuthRedirect(value: unknown): string {
  if (typeof value !== "string") {
    return "/";
  }

  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//")
  ) {
    return "/";
  }

  for (let index = 0; index < trimmed.length; index += 1) {
    const code = trimmed.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return "/";
    }
  }

  if (trimmed.includes("\\")) {
    return "/";
  }

  try {
    const parsed = new URL(trimmed, "http://redux-chat.local");
    if (parsed.origin !== "http://redux-chat.local") {
      return "/";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

export function toAbsoluteAuthCallbackURL(path: string): string {
  const sanitizedPath = sanitizeAuthRedirect(path);

  if (typeof window === "undefined") {
    return sanitizedPath;
  }

  return new URL(sanitizedPath, window.location.origin).toString();
}

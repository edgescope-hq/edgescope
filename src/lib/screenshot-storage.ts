export function isPathWithinUserPrefix(path: string, userId: string): boolean {
  if (!path || !userId || path.includes("\\") || path.startsWith("/") || path.endsWith("/")) {
    return false;
  }

  const segments = path.split("/");
  return (
    segments.length >= 2 &&
    segments[0] === userId &&
    segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

function hasEncodedPathControl(path: string): boolean {
  let candidate = path;
  for (let depth = 0; depth < 3; depth += 1) {
    if (/%(?:2f|5c|2e)/i.test(candidate)) return true;
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      return true;
    }
  }
  return false;
}

export function isOwnedScreenshotPath(path: string, userId: string, tradeId: string): boolean {
  if (!isPathWithinUserPrefix(path, userId) || hasEncodedPathControl(path)) return false;
  const segments = path.split("/");
  return segments.length >= 3 && segments[1] === tradeId;
}

export function joinUserStoragePath(
  parent: string,
  childName: string,
  userId: string,
): string | null {
  if (
    !childName ||
    childName === "." ||
    childName === ".." ||
    childName.includes("/") ||
    childName.includes("\\")
  ) {
    return null;
  }

  const path = `${parent}/${childName}`;
  return isPathWithinUserPrefix(path, userId) ? path : null;
}

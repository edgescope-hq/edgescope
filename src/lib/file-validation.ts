const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateScreenshotFile(file: File): string | null {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return "Only PNG, JPEG, and WebP images are allowed.";
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return "Only PNG, JPEG, and WebP images are allowed.";
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File is too large. Maximum size is 5 MB.`;
  }

  if (file.size === 0) {
    return "File is empty.";
  }

  return null;
}

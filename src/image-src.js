/* Icon and artwork URLs come from the config or the native side (data URIs,
   asset URLs). Percent-encode the HTML metacharacters before one reaches an
   <img>, so a malformed value can never be read as markup. Valid image URLs
   don't contain these characters, so they pass through unchanged. */
export function imageSrc(value) {
  return String(value ?? "")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/"/g, "%22")
    .replace(/'/g, "%27");
}

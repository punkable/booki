/* null is genuinely unknown, not zero percent downloaded. */
export function updateProgress(total, received) {
  return total > 0 ? Math.max(0, Math.min(1, received / total)) : null;
}

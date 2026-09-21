/** Message carried by a thrown value, whatever it is. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

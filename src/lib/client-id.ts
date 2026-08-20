const CLIENT_ID_KEY = 'vc_node_client_id'

/** Browser-scoped identity shared by anonymous room REST calls and signaling. */
export function getClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY)
    if (existing) return existing

    const generated = crypto.randomUUID()
    localStorage.setItem(CLIENT_ID_KEY, generated)
    return generated
  } catch {
    return crypto.randomUUID()
  }
}

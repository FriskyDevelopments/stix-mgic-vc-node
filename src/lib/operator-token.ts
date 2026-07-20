const OPERATOR_TOKEN_KEY = 'stix_operator_token'

export function getOperatorToken(): string | null {
  try {
    return sessionStorage.getItem(OPERATOR_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setOperatorToken(token: string): void {
  sessionStorage.setItem(OPERATOR_TOKEN_KEY, token)
}

export function clearOperatorToken(): void {
  sessionStorage.removeItem(OPERATOR_TOKEN_KEY)
}

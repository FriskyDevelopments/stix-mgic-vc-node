/** Workers build stub: Better Auth uses D1 here, so the MySQL pool must never be created. */
export function createPool(): never {
  throw new Error('mysql2 is not available on Workers; use the D1 binding (configureNebuDatabase)')
}
export type Pool = never

/**
 * The integration database. Tests truncate every table, so the URL must name a database
 * whose name contains "test"; anything else is refused rather than wiped.
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://arcellite:arcellite-dev@127.0.0.1:5432/arcellite_test"
  const name = new URL(url).pathname.slice(1)
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to run integration tests against "${name}": use a database whose name contains "test" (TEST_DATABASE_URL).`)
  }
  return url
}

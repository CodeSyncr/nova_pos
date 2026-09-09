/**
 * PostgREST caps every response at `db-max-rows` (1000 on Supabase's default
 * config) and does so *silently* — you get 1000 rows and a 200, not an error.
 * Any query that can legitimately match more than that (a year of orders, say)
 * has to page through `.range()` or it quietly under-reports.
 *
 * `fetchAllRows` runs that loop: it keeps requesting the next window until a
 * page comes back short, which is the only reliable end-of-data signal.
 *
 * Pass a builder that returns a *fresh* query each call — a PostgREST query
 * builder is single-use, so the range has to be applied to a new one each time.
 * The query must carry a stable `.order(...)`; without one, Postgres is free to
 * return rows in a different order per page and windows can overlap or skip.
 */

const PAGE_SIZE = 1000

type RangeQuery<T> = PromiseLike<{
	data: T[] | null
	error: { message: string } | null
}> & {
	range: (from: number, to: number) => RangeQuery<T>
}

export async function fetchAllRows<T>(
	buildQuery: () => RangeQuery<T>,
	options: { pageSize?: number } = {}
): Promise<T[]> {
	const pageSize = options.pageSize ?? PAGE_SIZE
	const rows: T[] = []

	for (let offset = 0; ; offset += pageSize) {
		const { data, error } = await buildQuery().range(
			offset,
			offset + pageSize - 1
		)

		if (error) {
			throw new Error(error.message)
		}

		const page = data || []
		rows.push(...page)

		if (page.length < pageSize) {
			return rows
		}
	}
}

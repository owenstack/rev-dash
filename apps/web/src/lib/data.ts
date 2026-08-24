import type {
	CountryMeta,
	CountryYearRecord,
	DataSourceMeta,
	WorldSnapshotRow,
} from "@public-purse/data/types";

async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
	return res.json() as Promise<T>;
}

export const fetchCountryIndex = () =>
	getJson<CountryMeta[]>("/data/index.json");

export const fetchWorldLatest = () =>
	getJson<WorldSnapshotRow[]>("/data/world/latest.json");

export const fetchCountrySeries = (iso3: string) =>
	getJson<CountryYearRecord[]>(`/data/countries/${iso3}.json`);

export const fetchSources = () =>
	getJson<DataSourceMeta[]>("/data/sources.json");

export interface CountryCoverage {
	tax: number[];
	imfTax: number[];
	imfGov: number[];
}
/** Exact per-year coverage sets, derived at build time (see scripts/gen-coverage.ts). */
export const fetchCoverage = () =>
	getJson<Record<string, CountryCoverage>>("/data/coverage.json");

/** Wrap a state update in the View Transitions API when available.
 * Returns the transition (whose `finished` promise resolves after the
 * animation) or undefined when the API is unsupported. */
export function withViewTransition(
	update: () => void | Promise<void>,
): ViewTransition | undefined {
	if (
		typeof document !== "undefined" &&
		typeof document.startViewTransition === "function"
	) {
		return document.startViewTransition(update);
	}
	void update();
	return undefined;
}

/**
 * Data-quality guard rails.
 *
 * - El Salvador (SLV) reports 67–113% of GDP tax revenue for every year
 *   1990–2000 in the primary source — almost certainly a units/reporting
 *   artifact, excluded from cross-country charts (flagged in copy).
 * - Lesotho's high ratio is real (SACU customs revenue-sharing) and stays in.
 */
export const OUTLIER_EXCLUSIONS = new Set(["SLV"]);
export const MAX_PLOTTABLE_TAX_SHARE = 60;

export function plottableTaxShare(row: {
	taxRevenue: number | null;
	iso3?: string;
	countryName?: string;
}): boolean {
	if (row.taxRevenue == null) return false;
	if (row.iso3 && OUTLIER_EXCLUSIONS.has(row.iso3)) return false;
	return row.taxRevenue <= MAX_PLOTTABLE_TAX_SHARE;
}

/** Split a series into contiguous non-null segments so missing years render
 * as visible gaps instead of misleadingly continuous lines. */
export function contiguousSegments<T>(
	rows: readonly T[],
	isPresent: (row: T) => boolean,
): T[][] {
	const segments: T[][] = [];
	let current: T[] | null = null;
	let prevYear: number | null = null;
	for (const row of rows) {
		// rows must have a numeric `year`
		const year = (row as { year: number }).year;
		if (isPresent(row)) {
			const contiguous =
				current !== null && prevYear !== null && year === prevYear + 1;
			if (contiguous && current) {
				current.push(row);
			} else {
				current = [row];
				segments.push(current);
			}
			prevYear = year;
		} else {
			current = null;
			prevYear = null;
		}
	}
	return segments.filter((s) => s.length > 1 || true);
}

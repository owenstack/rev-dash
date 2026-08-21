/**
 * Derives an exact per-year coverage manifest from the already-generated
 * static country files. index.json only carries yearMin/yearMax/counts,
 * which cannot express interior gaps — this emits the real year sets.
 *
 * Run before serving the app: `bun run build`, `dev`, and `check-types`
 * all invoke it (see apps/web/package.json).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const countriesDir = new URL("../public/data/countries/", import.meta.url);
const outFile = new URL("../public/data/coverage.json", import.meta.url);

if (!existsSync(countriesDir)) {
	console.error(
		"gen-coverage: public/data/countries/ not found. " +
			"Run `bun run --filter @rev-dash/data build` first.",
	);
	process.exit(1);
}

const out: Record<
	string,
	{ tax: number[]; imfTax: number[]; imfGov: number[] }
> = {};

for (const file of readdirSync(countriesDir)) {
	if (!file.endsWith(".json")) continue;
	const iso3 = file.replace(/\.json$/, "");
	const rows = JSON.parse(readFileSync(new URL(file, countriesDir), "utf8")) as
		| {
				year: number;
				taxRevenue: number | null;
				taxRevenueImf: number | null;
				govRevenueImf: number | null;
		  }[]
		| null;
	if (!Array.isArray(rows)) continue;
	out[iso3] = {
		tax: rows.filter((r) => r.taxRevenue != null).map((r) => r.year),
		imfTax: rows.filter((r) => r.taxRevenueImf != null).map((r) => r.year),
		imfGov: rows.filter((r) => r.govRevenueImf != null).map((r) => r.year),
	};
}

// Never leave an empty manifest behind: it usually means the data layer
// hasn't been built yet, and an empty coverage.json breaks the heatmap.
if (Object.keys(out).length === 0) {
	console.error(
		"gen-coverage: no usable country files in public/data/countries/. " +
			"Run `bun run --filter @rev-dash/data build` first.",
	);
	process.exit(1);
}

writeFileSync(outFile, JSON.stringify(out));
console.log(`coverage.json written (${Object.keys(out).length} countries)`);

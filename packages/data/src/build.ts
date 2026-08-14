/**
 * Tax Revenue Dashboard — data pipeline (TS/Bun, no backend needed)
 *
 * Merges the long-format macro file with the wide-format tax analytics file,
 * cleans it, and splits it into route-scoped JSON files that ship as static
 * assets in apps/web/public/data (served by Cloudflare via the Vite build).
 *
 * Run with: bun run src/build.ts
 *
 */
import { execFile } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Papa from "papaparse";
import type {
	CountryMeta,
	CountryYearRecord,
	DataSourceMeta,
	WorldSnapshotRow,
} from "./types";

// Supplementary IMF series, mirrored via Our World in Data (public, no auth).
// These fill in more recent years than the primary Revenue Academy file for
// many countries, and are kept as separate fields (see types.ts) rather than
// overwriting the primary series, so every chart can show and attribute its
// source honestly rather than silently blending vintages.
const OWID_GOV_REVENUE_URL =
	"https://ourworldindata.org/grapher/government-revenues-as-a-share-of-gdp-imf.csv?v=1&csvType=full&useColumnShortNames=false";
const OWID_TAX_REVENUE_URL =
	"https://ourworldindata.org/grapher/tax-revenues-as-a-share-of-gdp-unsdg.csv?v=1&csvType=full&useColumnShortNames=false";

const DATA_SOURCES: DataSourceMeta[] = [
	{
		id: "revenue-academy",
		name: "Tax composition, capacity, gap & buoyancy (SFA-derived)",
		provider:
			"Revenue Academy (blend of UNU-WIDER GRD, IMF WoRLD, IMF WoRLD-derived capacity model)",
		url: "https://github.com/Revenue-Academy/Tax-Revenue-Dashboard",
		retrievedAt: "2026-08-10",
		citation: "Revenue Academy Tax Revenue Dashboard, processed dataset",
		notes:
			"Primary source for taxRevenue, capacity/gap/buoyancy fields, and statutory rates. Coverage varies sharply by country — see index.json yearsWithTaxData.",
	},
	{
		id: "imf-gov-revenue",
		name: "Total government revenue (budgetary central government), % GDP",
		provider: "International Monetary Fund, via Our World in Data",
		url: OWID_GOV_REVENUE_URL,
		retrievedAt: new Date().toISOString().slice(0, 10),
		citation:
			"International Monetary Fund — with minor processing by Our World in Data",
		notes:
			"Total revenue including non-tax sources, not tax revenue alone — not directly comparable to taxRevenue. Useful where it extends coverage past the primary source's last year.",
	},
	{
		id: "imf-tax-revenue",
		name: "Tax revenue, % GDP (IMF GFS Yearbook / UN SDG 17.1)",
		provider:
			"International Monetary Fund, World Bank, OECD, via Our World in Data",
		url: OWID_TAX_REVENUE_URL,
		retrievedAt: new Date().toISOString().slice(0, 10),
		citation:
			"IMF Government Finance Statistics Yearbook and data files, and World Bank/OECD GDP estimates",
		notes:
			"Directly comparable to taxRevenue. Some countries (e.g. those that don't report to the IMF GFS Yearbook) are entirely absent — treat absence as a data point, not a gap to fill.",
	},
];

const OUT_DIR = path.join(
	import.meta.dirname,
	"..",
	"..",
	"..",
	"apps",
	"web",
	"public",
	"data",
);
const UPSTREAM_ARCHIVE_BASE =
	"https://github.com/Revenue-Academy/Tax-Revenue-Dashboard/raw/refs/heads/main";
const SOURCE_ARCHIVES = [
	{ archive: "rev_tax_data.rar", file: "rev_tax_data.csv" },
	{
		archive: "tax_revenue_14_February_2023.rar",
		file: "tax_revenue_14_February_2023.csv",
	},
] as const;
const execFileAsync = promisify(execFile);

const MACRO_INDICATORS: Record<string, string> = {
	"Fiscal Balance": "fiscalBalance",
	"General Government Gross Debt": "govGrossDebt",
	"External Debt": "externalDebt",
	"Internal Debt": "internalDebt",
	"Private Sector Consumption Expenditure (C)": "consumptionPrivate",
	"General Government Consumption Expenditure (G)": "consumptionGov",
	"Investments (I)": "investment",
	"Exports (X)": "exports",
	"Imports (M)": "imports",
};

const WIDE_FIELD_MAP: Record<string, string> = {
	Tax_Revenue: "taxRevenue",
	Total_Revenue_incl_SC: "totalRevenue",
	PIT: "pit",
	CIT: "cit",
	Value_Added_Tax: "vat",
	Excise_Taxes: "excise",
	Trade_Taxes: "trade",
	Social_Contributions: "socialContrib",
	Property_Tax: "property",
	Other_Taxes: "other",
	Direct_Taxes: "direct",
	Indirect_Taxes: "indirect",
	Total_Non_Tax_Revenue: "nonTaxRevenue",
	Tax_Capacity_Tax_Revenue: "capTaxRevenue",
	Tax_Capacity_PIT: "capPit",
	Tax_Capacity_CIT: "capCit",
	Tax_Capacity_Value_Added_Tax: "capVat",
	Tax_Capacity_Excise_Taxes: "capExcise",
	Tax_Capacity_Trade_Taxes: "capTrade",
	Tax_Capacity_Social_Contributions: "capSocialContrib",
	Tax_Capacity_Property_Tax: "capProperty",
	Tax_Gap_Tax_Revenue: "gapTaxRevenue",
	Tax_Gap_PIT: "gapPit",
	Tax_Gap_CIT: "gapCit",
	Tax_Gap_Value_Added_Tax: "gapVat",
	Tax_Revenue_buoyancy: "buoyancyTaxRevenue",
	PIT_buoyancy: "buoyancyPit",
	CIT_buoyancy: "buoyancyCit",
	Value_Added_Tax_buoyancy: "buoyancyVat",
	pit_rate: "ratePit",
	cit_rate: "rateCit",
	indirect_tax_rate: "rateIndirect",
	soc_contri_employer_rate: "rateSocContriEmployer",
	soc_contri_employee_rate: "rateSocContriEmployee",
	GDP_PC_Constant_USD: "gdpPerCapita",
};

const CORE_FIELDS = [
	"taxRevenue",
	"pit",
	"cit",
	"vat",
	"excise",
	"trade",
	"socialContrib",
] as const;

/** Parses "", "NA", "NaN" etc. as null; otherwise a finite number or null. */
function toNumOrNull(v: unknown): number | null {
	if (v === null || v === undefined) return null;
	const s = String(v).trim();
	if (s === "" || s.toLowerCase() === "na" || s.toLowerCase() === "nan")
		return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

function round3(v: number | null): number | null {
	return v === null ? null : Math.round(v * 1000) / 1000;
}

async function parseCsv<T extends Record<string, unknown>>(
	filePath: string,
): Promise<T[]> {
	const text = await readFile(filePath, "utf-8");
	const result = Papa.parse<T>(text, {
		header: true,
		skipEmptyLines: true,
		dynamicTyping: false,
	});
	if (result.errors.length) {
		// Papaparse reports "too few fields" style warnings on some trailing rows —
		// only fail the build on errors that actually lost data.
		const fatal = result.errors.filter((e) => e.type !== "FieldMismatch");
		if (fatal.length) {
			console.error(fatal.slice(0, 5));
			throw new Error(`CSV parse errors in ${filePath}`);
		}
	}
	return result.data;
}

async function findFiles(dir: string, filename: string): Promise<string[]> {
	const matches: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const entryPath = path.join(dir, entry.name);
		if (entry.isDirectory())
			matches.push(...(await findFiles(entryPath, filename)));
		else if (entry.name === filename) matches.push(entryPath);
	}
	return matches;
}

async function downloadAndExtractSources(): Promise<{
	sourceDir: string;
	cleanup: () => Promise<void>;
}> {
	const sourceDir = await mkdtemp(path.join(tmpdir(), "rev-dash-data-"));

	try {
		for (const { archive, file } of SOURCE_ARCHIVES) {
			const archivePath = path.join(sourceDir, archive);
			const response = await fetch(`${UPSTREAM_ARCHIVE_BASE}/${archive}`);
			if (!response.ok)
				throw new Error(
					`Failed to download ${archive} (HTTP ${response.status})`,
				);
			await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));

			try {
				await execFileAsync("unrar", ["x", "-o+", archivePath, sourceDir]);
			} catch (err) {
				throw new Error(
					`Unable to extract ${archive}. Install the "unrar" command and try again. ${
						err instanceof Error ? err.message : err
					}`,
				);
			}

			if (!(await findFiles(sourceDir, file)).length) {
				throw new Error(`Archive ${archive} did not contain ${file}`);
			}
		}
	} catch (err) {
		await rm(sourceDir, { recursive: true, force: true });
		throw err;
	}

	return {
		sourceDir,
		cleanup: () => rm(sourceDir, { recursive: true, force: true }),
	};
}

/** long format: one row per (country, year, indicator) -> pivot macro indicators wide, keyed by iso3+year */
async function loadMacroWide(
	sourceDir: string,
): Promise<Map<string, Partial<Record<string, number | null>>>> {
	type LongRow = {
		Year2: string;
		"indicator name": string;
		iso3_code: string;
		value: string;
	};
	const rows = await parseCsv<LongRow>(
		path.join(sourceDir, "rev_tax_data.csv"),
	);

	const macro = new Map<string, Partial<Record<string, number | null>>>();
	for (const row of rows) {
		const field = MACRO_INDICATORS[row["indicator name"]];
		if (!field) continue;
		const key = `${row.iso3_code}__${row.Year2}`;
		const existing = macro.get(key) ?? {};
		existing[field] = toNumOrNull(row.value);
		macro.set(key, existing);
	}
	return macro;
}

/** Fetches an OWID grapher CSV (Entity,Code,Year,<indicator>) and returns a
 * Map keyed "ISO3__YEAR" -> value. Returns an empty map (with a warning) if
 * the fetch fails, so a network hiccup degrades gracefully instead of
 * failing the whole build. */
async function fetchOwidSeries(url: string): Promise<Map<string, number>> {
	const out = new Map<string, number>();
	let text: string;
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		text = await res.text();
	} catch (err) {
		console.warn(
			`Warning: failed to fetch ${url} (${err instanceof Error ? err.message : err}); continuing without it.`,
		);
		return out;
	}
	const parsed = Papa.parse<{
		Entity: string;
		Code: string;
		Year: string;
		[k: string]: string;
	}>(text, {
		header: true,
		skipEmptyLines: true,
	});
	const valueField = parsed.meta.fields?.find(
		(f) => f !== "Entity" && f !== "Code" && f !== "Year",
	);
	if (!valueField) return out;
	for (const row of parsed.data) {
		if (!row.Code || !row.Year) continue;
		const v = toNumOrNull(row[valueField]);
		if (v !== null) out.set(`${row.Code}__${row.Year}`, v);
	}
	return out;
}

type WideRow = Record<string, string> & {
	Country_Code: string;
	year: string;
	Country_Name_x: string;
	Region_Desc: string;
	"Income Group": string;
};

async function loadWide(sourceDir: string): Promise<WideRow[]> {
	return parseCsv<WideRow>(
		path.join(sourceDir, "tax_revenue_14_February_2023.csv"),
	);
}

async function main() {
	const sources = await downloadAndExtractSources();
	try {
		console.log("Parsing downloaded source CSVs...");
		const [macroByKey, wideRows] = await Promise.all([
			loadMacroWide(sources.sourceDir),
			loadWide(sources.sourceDir),
		]);

		console.log("Fetching supplementary IMF series (via OWID)...");
		const [govRevenueImfByKey, taxRevenueImfByKey] = await Promise.all([
			fetchOwidSeries(OWID_GOV_REVENUE_URL),
			fetchOwidSeries(OWID_TAX_REVENUE_URL),
		]);

		console.log("Merging + cleaning...");
		type Grouped = {
			meta: { name: string; region: string | null; incomeGroup: string | null };
			rows: CountryYearRecord[];
		};
		const byCountry = new Map<string, Grouped>();

		for (const row of wideRows) {
			const iso3 = row.Country_Code;
			const year = Number(row.year);
			if (!iso3 || !Number.isFinite(year)) continue;

			const record: Partial<CountryYearRecord> = { year };
			for (const [src, dest] of Object.entries(WIDE_FIELD_MAP)) {
				(record as Record<string, number | null>)[dest] = toNumOrNull(row[src]);
			}
			const macro = macroByKey.get(`${iso3}__${year}`) ?? {};
			for (const [field, value] of Object.entries(macro)) {
				(record as Record<string, number | null>)[field] = value ?? null;
			}
			// fields present only via macro merge, ensure they exist even when absent for this row
			for (const field of Object.values(MACRO_INDICATORS)) {
				if (!(field in record))
					(record as Record<string, number | null>)[field] = null;
			}

			const key = `${iso3}__${year}`;
			record.govRevenueImf = govRevenueImfByKey.get(key) ?? null;
			record.taxRevenueImf = taxRevenueImfByKey.get(key) ?? null;

			const hasCoreData =
				CORE_FIELDS.some(
					(f) => record[f] !== null && record[f] !== undefined,
				) ||
				record.govRevenueImf !== null ||
				record.taxRevenueImf !== null;
			if (!hasCoreData) continue;

			if (!byCountry.has(iso3)) {
				byCountry.set(iso3, {
					meta: {
						name: row.Country_Name_x || iso3,
						region: row.Region_Desc || null,
						incomeGroup: row["Income Group"] || null,
					},
					rows: [],
				});
			}
			byCountry.get(iso3)!.rows.push(record as CountryYearRecord);
		}

		console.log("Writing output...");
		await mkdir(path.join(OUT_DIR, "countries"), { recursive: true });
		await mkdir(path.join(OUT_DIR, "world"), { recursive: true });

		const index: CountryMeta[] = [];
		const worldLatest: WorldSnapshotRow[] = [];

		for (const [iso3, { meta, rows }] of byCountry) {
			rows.sort((a, b) => a.year - b.year);

			// round every numeric field to 3dp for compact, consistent output
			const rounded = rows.map((r) => {
				const out: Record<string, number | null> = { year: r.year };
				for (const k of Object.keys(r) as (keyof CountryYearRecord)[]) {
					if (k === "year") continue;
					out[k] = round3(r[k] as number | null);
				}
				return out as unknown as CountryYearRecord;
			});

			await writeFile(
				path.join(OUT_DIR, "countries", `${iso3}.json`),
				JSON.stringify(rounded),
			);

			const yearsWithTax = rows.filter((r) => r.taxRevenue !== null);
			const latestYearWithData = yearsWithTax.length
				? Math.max(...yearsWithTax.map((r) => r.year))
				: null;
			const yearsWithGovRevenueImf = rows.filter(
				(r) => r.govRevenueImf !== null,
			);
			const yearsWithTaxRevenueImf = rows.filter(
				(r) => r.taxRevenueImf !== null,
			);

			index.push({
				iso3,
				name: meta.name,
				region: meta.region,
				incomeGroup: meta.incomeGroup,
				yearMin: Math.min(...rows.map((r) => r.year)),
				yearMax: Math.max(...rows.map((r) => r.year)),
				latestYearWithData,
				yearsWithTaxData: yearsWithTax.length,
				totalYears: new Set(rows.map((r) => r.year)).size,
				latestYearGovRevenueImf: yearsWithGovRevenueImf.length
					? Math.max(...yearsWithGovRevenueImf.map((r) => r.year))
					: null,
				latestYearTaxRevenueImf: yearsWithTaxRevenueImf.length
					? Math.max(...yearsWithTaxRevenueImf.map((r) => r.year))
					: null,
			});

			if (latestYearWithData !== null) {
				const latestRow = rounded.find((r) => r.year === latestYearWithData)!;
				worldLatest.push({
					...latestRow,
					iso3,
					countryName: meta.name,
					region: meta.region,
					incomeGroup: meta.incomeGroup,
				});
			}
		}

		index.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
		await writeFile(
			path.join(OUT_DIR, "index.json"),
			JSON.stringify(index, null, 2),
		);
		await writeFile(
			path.join(OUT_DIR, "world", "latest.json"),
			JSON.stringify(worldLatest),
		);
		await writeFile(
			path.join(OUT_DIR, "sources.json"),
			JSON.stringify(DATA_SOURCES, null, 2),
		);

		const upliftCount = index.filter(
			(c) => (c.latestYearGovRevenueImf ?? 0) > (c.latestYearWithData ?? 0),
		).length;
		const absentFromTaxImf = index.filter(
			(c) => c.latestYearTaxRevenueImf === null,
		).length;
		console.log(`Countries: ${index.length}`);
		console.log(
			`Countries where IMF gov-revenue extends past the primary source: ${upliftCount}`,
		);
		console.log(
			`Countries entirely absent from the IMF tax-revenue (GFS Yearbook) series: ${absentFromTaxImf}`,
		);
		console.log(`Output written to ${OUT_DIR}`);
	} finally {
		await sources.cleanup();
		console.log("Temporary source files removed.");
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

/**
 * Tax Revenue Dashboard — data pipeline (TS/Bun, no backend needed)
 *
 * Merges the long-format macro file with the wide-format tax analytics file,
 * cleans it, and splits it into route-scoped JSON files that ship as static
 * assets in apps/web/public/data (served by Cloudflare via the Vite build).
 *
 * Run with: bun run src/build.ts
 *
 * Source CSVs are NOT committed to git (see source/README.md) — this script
 * expects them to already be extracted into ./source/.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { CountryMeta, CountryYearRecord, WorldSnapshotRow } from "./types";

const SOURCE_DIR = path.join(import.meta.dirname, "..", "source");
const OUT_DIR = path.join(import.meta.dirname, "..", "..", "..", "apps", "web", "public", "data");

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

const CORE_FIELDS = ["taxRevenue", "pit", "cit", "vat", "excise", "trade", "socialContrib"] as const;

/** Parses "", "NA", "NaN" etc. as null; otherwise a finite number or null. */
function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s.toLowerCase() === "na" || s.toLowerCase() === "nan") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function round3(v: number | null): number | null {
  return v === null ? null : Math.round(v * 1000) / 1000;
}

async function parseCsv<T extends Record<string, unknown>>(filePath: string): Promise<T[]> {
  const text = await readFile(filePath, "utf-8");
  const result = Papa.parse<T>(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
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

/** long format: one row per (country, year, indicator) -> pivot macro indicators wide, keyed by iso3+year */
async function loadMacroWide(): Promise<Map<string, Partial<Record<string, number | null>>>> {
  type LongRow = { Year2: string; "indicator name": string; iso3_code: string; value: string };
  const rows = await parseCsv<LongRow>(path.join(SOURCE_DIR, "rev_tax_data.csv"));

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

type WideRow = Record<string, string> & {
  Country_Code: string;
  year: string;
  Country_Name_x: string;
  Region_Desc: string;
  "Income Group": string;
};

async function loadWide(): Promise<WideRow[]> {
  return parseCsv<WideRow>(path.join(SOURCE_DIR, "tax_revenue_14_February_2023.csv"));
}

async function main() {
  if (!existsSync(path.join(SOURCE_DIR, "rev_tax_data.csv"))) {
    throw new Error(
      `Missing source CSVs in ${SOURCE_DIR} — see source/README.md for how to obtain them.`,
    );
  }

  console.log("Parsing source CSVs...");
  const [macroByKey, wideRows] = await Promise.all([loadMacroWide(), loadWide()]);

  console.log("Merging + cleaning...");
  type Grouped = { meta: { name: string; region: string | null; incomeGroup: string | null }; rows: CountryYearRecord[] };
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
      if (!(field in record)) (record as Record<string, number | null>)[field] = null;
    }

    const hasCoreData = CORE_FIELDS.some((f) => record[f] !== null && record[f] !== undefined);
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
  await writeFile(path.join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2));
  await writeFile(path.join(OUT_DIR, "world", "latest.json"), JSON.stringify(worldLatest));

  console.log(`Countries: ${index.length}`);
  console.log(`Output written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

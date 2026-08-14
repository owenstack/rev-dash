/** One country-year record. All monetary/ratio fields are null when the
 * source data doesn't have a value for that year — never coerced to 0. */
export interface CountryYearRecord {
	year: number;

	// tax composition, % of GDP
	taxRevenue: number | null;
	totalRevenue: number | null;
	pit: number | null;
	cit: number | null;
	vat: number | null;
	excise: number | null;
	trade: number | null;
	socialContrib: number | null;
	property: number | null;
	other: number | null;
	direct: number | null;
	indirect: number | null;
	nonTaxRevenue: number | null;

	// SFA-derived tax capacity, % of GDP
	capTaxRevenue: number | null;
	capPit: number | null;
	capCit: number | null;
	capVat: number | null;
	capExcise: number | null;
	capTrade: number | null;
	capSocialContrib: number | null;
	capProperty: number | null;

	// tax gap (capacity - actual), % of GDP
	gapTaxRevenue: number | null;
	gapPit: number | null;
	gapCit: number | null;
	gapVat: number | null;

	// buoyancy
	buoyancyTaxRevenue: number | null;
	buoyancyPit: number | null;
	buoyancyCit: number | null;
	buoyancyVat: number | null;

	// statutory rates, %
	ratePit: number | null;
	rateCit: number | null;
	rateIndirect: number | null;
	rateSocContriEmployer: number | null;
	rateSocContriEmployee: number | null;

	// macro context
	gdpPerCapita: number | null;
	exports: number | null;
	imports: number | null;
	investment: number | null;
	consumptionGov: number | null;
	consumptionPrivate: number | null;
	fiscalBalance: number | null;
	govGrossDebt: number | null;
	externalDebt: number | null;
	internalDebt: number | null;

	// supplementary IMF series (via OWID), filled only where the primary
	// Revenue Academy / GRD source has no more recent value — see README
	// "Multiple sources" section. Each carries its own year coverage since
	// it's independently sourced, not merged into `taxRevenue`/`totalRevenue`.
	govRevenueImf: number | null; // total budgetary central gov't revenue, % GDP
	taxRevenueImf: number | null; // tax revenue only, % GDP (IMF GFS Yearbook / UN SDG 17.1)
}

export interface CountryMeta {
	iso3: string;
	name: string;
	region: string | null;
	incomeGroup: string | null;
	yearMin: number;
	yearMax: number;
	latestYearWithData: number | null;
	yearsWithTaxData: number;
	totalYears: number;
	// most recent year available from each supplementary source, for
	// building a per-source completeness indicator (null if the country
	// doesn't appear in that source at all — itself a meaningful signal)
	latestYearGovRevenueImf: number | null;
	latestYearTaxRevenueImf: number | null;
}

/** One row of a source-attribution manifest, written to sources.json. */
export interface DataSourceMeta {
	id: string;
	name: string;
	provider: string;
	url: string;
	retrievedAt: string; // ISO date this build fetched it
	citation: string;
	notes: string;
}

/** One row per country in world/latest.json — CountryYearRecord plus identity fields. */
export interface WorldSnapshotRow extends CountryYearRecord {
	iso3: string;
	countryName: string;
	region: string | null;
	incomeGroup: string | null;
}

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
}

/** One row per country in world/latest.json — CountryYearRecord plus identity fields. */
export interface WorldSnapshotRow extends CountryYearRecord {
  iso3: string;
  countryName: string;
  region: string | null;
  incomeGroup: string | null;
}

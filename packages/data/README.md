# @rev-dash/data

Build pipeline that turns the Revenue Academy Tax Revenue Dashboard's source
data into static JSON consumed by `apps/web`. No backend — output ships as
static assets and is fetched directly from `/data/*` at runtime.

## Source files

The two source files aren't committed to this repo (~30MB combined, and
easily regenerated). Each build downloads `rev_tax_data.rar` and
`tax_revenue_14_February_2023.rar` from the [original dashboard repo](https://github.com/Revenue-Academy/Tax-Revenue-Dashboard),
extracts the required CSVs into a temporary directory, and removes that
directory when processing finishes or fails. The build therefore requires
network access and the `unrar` command to be installed.

## Building

```bash
bun run --filter @rev-dash/data build
```

This writes to `apps/web/public/data/`:

- `index.json` — metadata for all 197 countries (name, region, income group,
  year coverage, data completeness)
- `world/latest.json` — one snapshot row per country (most recent year with
  tax data), for overview/ranking views
- `countries/{ISO3}.json` — full time series per country

## Multiple sources

The primary Revenue Academy file caps out around 2020–2021 for most
countries, and much earlier for some (Nigeria: 2007). Rather than replace it
with a single "fresher" dataset — which would drop the SFA-derived tax
capacity/gap/buoyancy fields entirely, since no public source recomputes
those — the build fetches two supplementary IMF series live from Our World
in Data and keeps them as separate fields:

- `govRevenueImf` — total budgetary central government revenue, % GDP (IMF,
  via OWID). Not the same measure as `taxRevenue` (includes non-tax
  revenue), but extends past the primary source's last year for many
  countries.
- `taxRevenueImf` — tax revenue specifically, from the IMF GFS Yearbook /
  UN SDG 17.1 indicator (via OWID). Directly comparable to `taxRevenue`,
  but several countries — Nigeria included — are entirely absent from it,
  because they don't report through the IMF's standard GFS Yearbook
  channel. That absence is itself meaningful and shouldn't be treated as a
  gap to paper over.

`index.json` carries `latestYearGovRevenueImf` / `latestYearTaxRevenueImf`
per country so the UI can show, honestly, which source last updated when —
this is the basis for a "compare sources" or completeness view rather than
a single blended number. `sources.json` has full attribution for all three
sources (name, provider, citation, retrieval date) — pull directly from it
for any "data sources" / methodology section on the site.

These two fetches hit the network at build time (no auth required) and fail
soft — if OWID is unreachable, the build logs a warning and continues with
those fields `null` rather than failing outright.

## A note on nulls

Missing data is written as `null`, never backfilled or interpolated. Several
countries — Nigeria included — have real gaps (e.g. `taxRevenue` stops
updating well before the dataset's nominal end year). Treat this as data to
surface (a completeness indicator, a "no data" chart state), not something to
paper over.

## Schema

See `src/types.ts` for the full `CountryYearRecord`, `CountryMeta`, and
`WorldSnapshotRow` shapes — import these directly in `apps/web` via
`@rev-dash/data/types` rather than redefining them.

# @rev-dash/data

Build pipeline that turns the Revenue Academy Tax Revenue Dashboard's source
data into static JSON consumed by `apps/web`. No backend — output ships as
static assets and is fetched directly from `/data/*` at runtime.

## Getting the source CSVs

The two source files aren't committed to this repo (~30MB combined, and
easily regenerated). Get them from the [original dashboard repo](https://github.com/Revenue-Academy/Tax-Revenue-Dashboard):

1. Download `rev_tax_data.rar` and `tax_revenue_14_February_2023.rar`
2. Extract both — you'll get `rev_tax_data.csv` and `tax_revenue_14_February_2023.csv`
3. Place both files in `packages/data/source/`

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

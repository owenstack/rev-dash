import type { CountryMeta, DataSourceMeta } from "@rev-dash/data/types";
import { useMemo } from "react";
import type { CountryCoverage } from "@/lib/data";

/** Overview completeness heatmap: share of countries with tax data,
 * by region × year, using exact per-year coverage sets so interior gaps
 * render as gaps rather than being filled by min/max interpolation. */
export function CompletenessHeatmap({
	index,
	coverage,
}: {
	index: CountryMeta[];
	coverage: Record<string, CountryCoverage>;
}) {
	const coverageSets = useMemo(() => {
		// Tax coverage only: primary tax years plus the IMF tax-revenue series.
		// imfGov is deliberately excluded — govRevenueImf is total government
		// revenue (incl. non-tax), so counting it would overstate tax coverage.
		const sets = new Map<string, Set<number>>();
		for (const [iso3, cov] of Object.entries(coverage)) {
			sets.set(iso3, new Set([...cov.tax, ...cov.imfTax]));
		}
		return sets;
	}, [coverage]);
	const regions = useMemo(() => {
		const counts = new Map<string, number>();
		for (const c of index) {
			const key = c.region ?? "Unknown";
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return [...counts.entries()].sort((a, b) => b[1] - a[1]);
	}, [index]);

	const years = Array.from({ length: 45 }, (_, i) => 1980 + i);

	const shareFor = (region: string, year: number) => {
		let withData = 0;
		let total = 0;
		for (const c of index) {
			if ((c.region ?? "Unknown") !== region) continue;
			total++;
			const sets = coverageSets.get(c.iso3);
			// exact membership — a year counts only if the country's primary tax
			// series or the IMF tax-revenue series actually contains that year
			if (sets?.has(year)) withData++;
		}
		return total === 0 ? null : withData / total;
	};

	return (
		<div className="min-w-0 overflow-x-auto">
			<table className="w-full min-w-[560px] border-separate border-spacing-px text-[10px]">
				<tbody>
					{regions.map(([region, total]) => (
						<tr key={region}>
							<th className="whitespace-nowrap pr-2 text-right align-middle font-normal text-muted-foreground">
								{region}{" "}
								<span className="text-muted-foreground/60">({total})</span>
							</th>
							{years.map((y) => {
								const s = shareFor(region, y);
								return (
									<td
										key={y}
										title={`${region}, ${y}: ${
											s == null
												? "no data"
												: `${Math.round(s * 100)}% of countries`
										}`}
										className="h-4 w-3"
										style={{
											background:
												s == null
													? "transparent"
													: `oklch(0.85 ${s < 0.05 ? 0 : 0.02 + s * 0.06} ${
															s < 0.05 ? 17 : 250
														} / ${s === 0 ? 0.08 : 0.15 + s * 0.85})`,
										}}
									/>
								);
							})}
						</tr>
					))}
					<tr>
						<th />
						{years.map((y) => (
							<td key={y} className="pt-1 text-center text-muted-foreground">
								{y % 10 === 0 ? String(y).slice(2) : ""}
							</td>
						))}
					</tr>
				</tbody>
			</table>
			<p className="mt-3 text-muted-foreground text-xs">
				Share of countries in each region with tax-revenue data for that year.
				The empty stretches are real — they are the story of what the sources do
				and don't cover.
			</p>
		</div>
	);
}

/** Country-mode per-year coverage timeline: one cell per year, shaded by
 * which source carries data for it. Shows the real gaps instead of just a
 * min–max range. */
export function CountryCoverageTimeline({
	meta,
	coverage,
}: {
	meta: CountryMeta;
	coverage: CountryCoverage | undefined;
}) {
	// Tax coverage only: the primary tax series plus the IMF *tax-revenue*
	// series. imfGov (govRevenueImf) is total government revenue including
	// non-tax sources — counting its years here would claim tax coverage
	// the tax dataset does not have. It stays documented in Methodology.
	const { taxSet, imfTaxSet } = useMemo(() => {
		const cov = coverage ?? { tax: [], imfTax: [], imfGov: [] };
		return {
			taxSet: new Set(cov.tax),
			imfTaxSet: new Set(cov.imfTax),
		};
	}, [coverage]);

	const lastYear = Math.max(meta.yearMax, ...imfTaxSet, meta.yearMin);
	const years: number[] = [];
	for (let y = meta.yearMin; y <= lastYear; y++) years.push(y);

	return (
		<div className="min-w-0">
			<div className="flex flex-wrap gap-px">
				{years.map((y) => {
					const primary = taxSet.has(y);
					const imf = imfTaxSet.has(y);
					const background = primary
						? imf
							? "#f4f4f5"
							: "#b9b9c2"
						: imf
							? "#5f5f6b"
							: "transparent";
					return (
						<div
							key={y}
							title={`${y}: ${
								primary
									? imf
										? "primary + IMF"
										: "primary source"
									: imf
										? "IMF only"
										: "no data"
							}`}
							className={`h-5 w-2.5 ${
								primary || imf ? "" : "border border-border/40"
							}`}
							style={{ background }}
						/>
					);
				})}
			</div>
			<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
				<span className="inline-flex items-center gap-1.5">
					<span
						className="inline-block h-2.5 w-2"
						style={{ background: "#f4f4f5" }}
					/>
					Primary + IMF
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span
						className="inline-block h-2.5 w-2"
						style={{ background: "#b9b9c2" }}
					/>
					Primary source
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span
						className="inline-block h-2.5 w-2"
						style={{ background: "#5f5f6b" }}
					/>
					IMF only
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span className="inline-block h-2.5 w-2 border border-border/40" />
					No data
				</span>
			</div>
			<p className="mt-1 text-[11px] text-muted-foreground">
				{years[0]}–{years[years.length - 1]}, one cell per year
			</p>
		</div>
	);
}

/** Country-mode coverage tag, shown whenever coverage stops short of today. */
export function CoverageTag({ meta }: { meta: CountryMeta }) {
	const parts: string[] = [];
	parts.push(`${meta.yearMin}–${meta.yearMax}`);
	const imfTax = meta.latestYearTaxRevenueImf;
	const imfGov = meta.latestYearGovRevenueImf;
	if (imfTax != null || imfGov != null) {
		const max = Math.max(imfTax ?? -1, imfGov ?? -1);
		if (max > meta.yearMax) parts.push(`IMF series to ${max}`);
	}
	return (
		<p className="font-mono text-muted-foreground text-xs">
			Data available {parts.join(" · ")}
		</p>
	);
}

/** Transparency/attribution section — a content pillar, not a footnote. */
export function Methodology({
	number,
	sources,
	index,
}: {
	number: string;
	sources: DataSourceMeta[];
	index: CountryMeta[];
}) {
	const countriesWithImf = index.filter(
		(c) =>
			c.latestYearTaxRevenueImf != null || c.latestYearGovRevenueImf != null,
	).length;
	return (
		<section
			id="methodology"
			className="mx-auto max-w-6xl scroll-mt-16 border-border/60 border-t px-4 py-16 md:py-24"
		>
			<p className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-widest">
				{number} — Sources &amp; method
			</p>
			<h2 className="max-w-2xl text-balance font-medium font-serif text-2xl leading-snug tracking-tight md:text-3xl">
				Where every number comes from — and exactly what we don't know.
			</h2>
			<p className="mt-4 max-w-prose text-muted-foreground text-sm leading-relaxed">
				This page blends three independently-sourced datasets with different
				coverage and update cadence. {countriesWithImf} of {index.length}{" "}
				countries appear in at least one live IMF series; for the rest, their
				absence is itself a signal about global reporting coverage, not a bug to
				fill in. Missing years are never interpolated or zero-filled.
			</p>
			<div className="mt-8 grid gap-6 md:grid-cols-3">
				{sources.map((s) => (
					<div key={s.id} className="border border-border p-4">
						<h3 className="font-medium text-sm">{s.name}</h3>
						<p className="mt-1 text-muted-foreground text-xs">{s.provider}</p>
						<p className="mt-3 text-muted-foreground text-xs leading-relaxed">
							{s.notes}
						</p>
						<a
							href={s.url}
							className="mt-3 inline-block text-xs underline underline-offset-2"
							target="_blank"
							rel="noreferrer"
						>
							Source ↗
						</a>
						<p className="mt-2 font-mono text-[11px] text-muted-foreground/70">
							Retrieved {s.retrievedAt}
						</p>
					</div>
				))}
			</div>
		</section>
	);
}

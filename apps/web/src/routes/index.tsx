import type { CountryMeta, WorldSnapshotRow } from "@rev-dash/data/types";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import {
	CapacityScatter,
	CompositionOverview,
	CompositionTime,
	GapBandChart,
	LegendComposition,
	LegendIncomeGroups,
	PeerCompare,
	RankedBars,
	RatesTimeline,
} from "@/components/dashboard/charts";
import {
	CompletenessHeatmap,
	CountryCoverageTimeline,
	CoverageTag,
	Methodology,
} from "@/components/dashboard/completeness";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { CountryGlobe } from "@/components/dashboard/globe";
import { Section } from "@/components/dashboard/section";
import { useContainerWidth } from "@/hooks/use-container-width";
import {
	type CountryCoverage,
	fetchCountryIndex,
	fetchCountrySeries,
	fetchCoverage,
	fetchSources,
	fetchWorldLatest,
	plottableTaxShare,
	withViewTransition,
} from "@/lib/data";

// One route, one typed search param. Selecting a country is filter state:
// absent = all-countries overview, present = single-country mode.
const searchSchema = z.object({
	country: z.string().length(3).optional(),
});

export const Route = createFileRoute("/")({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => ({ country: search.country }),
	loader: async ({ deps }) => {
		// world snapshot is needed in both modes: ranked bars/scatter in
		// overview, and the region/income-group averages for country peers.
		const [index, sources, coverage, world] = await Promise.all([
			fetchCountryIndex(),
			fetchSources(),
			fetchCoverage(),
			fetchWorldLatest(),
		]);
		if (deps.country) {
			if (!index.some((c) => c.iso3 === deps.country)) {
				throw new Error(`Unknown country code: ${deps.country}`);
			}
			const series = await fetchCountrySeries(deps.country);
			return { index, sources, coverage, world, series };
		}
		return { index, sources, coverage, world };
	},
	component: DashboardPage,
});

function DashboardPage() {
	const data = Route.useLoaderData();
	const { country } = Route.useSearch();
	const navigate = Route.useNavigate();

	const selectedMeta = country
		? (data.index.find((c) => c.iso3 === country) ?? null)
		: null;

	const select = (iso3: string | null) => {
		const navigateTo = () =>
			navigate({
				to: ".",
				search: (prev) => ({ ...prev, country: iso3 ?? undefined }),
			});
		// After a country selection, bring the country-specific capacity
		// section into view once the route update settles. Clearing returns
		// to the overview without moving the page.
		if (!iso3) {
			withViewTransition(navigateTo);
			return;
		}
		const scrollToCapacity = () => {
			document
				.getElementById("country-capacity")
				?.scrollIntoView({ behavior: "smooth", block: "start" });
		};
		const supportsViewTransitions =
			typeof document !== "undefined" &&
			typeof document.startViewTransition === "function";
		if (supportsViewTransitions) {
			const transition = withViewTransition(navigateTo);
			// scroll once the morph finishes
			transition?.finished.then(scrollToCapacity).catch(scrollToCapacity);
		} else {
			// no View Transitions API: navigate once, then scroll when settled
			navigateTo()
				.then(scrollToCapacity)
				.catch(() => {});
		}
	};

	const worldRows = data.world;
	const series = "series" in data ? data.series : undefined;

	return (
		<div className="min-h-svh bg-background text-foreground">
			<FilterBar
				countries={data.index}
				selected={selectedMeta}
				onSelect={(iso3) => select(iso3)}
				onClear={() => select(null)}
			/>

			{/* Hero — dark, globe as the primary input */}
			<header className="relative overflow-hidden">
				<div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pt-16 pb-10 md:grid-cols-2 md:pt-24">
					<div>
						<p className="mb-4 font-mono text-muted-foreground text-xs uppercase tracking-widest">
							40+ years · 197 countries · three sources
						</p>
						<h1 className="text-balance font-medium font-serif text-4xl leading-tight tracking-tight md:text-5xl">
							How does a country pay for itself — and is it collecting what it
							could?
						</h1>
						<p className="mt-5 max-w-prose text-muted-foreground text-sm leading-relaxed md:text-base">
							An exploration of how governments fund themselves, built on tax
							revenue data from the UNU-WIDER Government Revenue Dataset, the
							IMF, and a modeled picture of what each country could
							realistically collect. Click a dot on the globe, or search a
							country above.
						</p>
					</div>
					<HeroGlobe
						countries={data.index}
						selected={selectedMeta?.iso3 ?? null}
						onSelect={(iso3) => select(iso3)}
					/>
				</div>
			</header>

			{worldRows && (
				<OverviewSections
					rows={worldRows}
					index={data.index}
					coverage={data.coverage}
					onSelect={select}
				/>
			)}

			{series && selectedMeta && (
				<CountrySections
					series={series}
					meta={selectedMeta}
					rows={worldRows}
					coverage={data.coverage[selectedMeta.iso3]}
				/>
			)}

			<Methodology sources={data.sources} index={data.index} />

			<footer className="border-border/60 border-t px-4 py-8 text-center font-mono text-muted-foreground text-xs">
				rev-dash — a data-journalism prototype. All figures are shares of GDP
				unless noted.
			</footer>
		</div>
	);
}

/** Hero globe sized to its container so it never overflows narrow viewports. */
function HeroGlobe({
	countries,
	selected,
	onSelect,
}: {
	countries: CountryMeta[];
	selected: string | null;
	onSelect: (iso3: string) => void;
}) {
	const [ref, width] = useContainerWidth<HTMLDivElement>(320);
	const size = Math.min(520, Math.max(280, width));
	return (
		<div
			ref={ref}
			className="flex w-full min-w-0 justify-center md:justify-end"
		>
			<CountryGlobe
				countries={countries}
				selected={selected}
				onSelect={onSelect}
				size={size}
			/>
		</div>
	);
}

function OverviewSections({
	rows,
	index,
	coverage,
	onSelect,
}: {
	rows: WorldSnapshotRow[];
	index: CountryMeta[];
	coverage: Awaited<ReturnType<typeof fetchCoverage>>;
	onSelect: (iso3: string) => void;
}) {
	const plottable = useMemo(() => rows.filter(plottableTaxShare), [rows]);

	const _averages = useMemo(() => {
		const acc = new Map<string, { sum: number; n: number }>();
		for (const r of plottable) {
			for (const key of ["region", "incomeGroup"] as const) {
				const g = r[key];
				if (!g) continue;
				const e = acc.get(`${key}:${g}`) ?? { sum: 0, n: 0 };
				e.sum += r.taxRevenue ?? 0;
				e.n++;
				acc.set(`${key}:${g}`, e);
			}
		}
		return (key: string, group: string | null) => {
			if (!group) return null;
			const e = acc.get(`${key}:${group}`);
			return e && e.n > 0 ? e.sum / e.n : null;
		};
	}, [plottable]);

	return (
		<>
			<Section
				number="01"
				kicker="Level"
				question="Which countries collect the most — and the least — relative to their economies?"
				aside={
					<div className="space-y-3">
						<RankedBars rows={rows} onSelect={onSelect} />
						<LegendIncomeGroups />
						<p className="text-muted-foreground text-xs">
							El Salvador's 1990s values (67–113% of GDP in the primary source,
							almost certainly a reporting artifact) are excluded. Lesotho's
							high ratio is real — SACU customs revenue-sharing.
						</p>
					</div>
				}
			>
				<p>
					Tax-to-GDP spans an enormous range across these 197 countries. Rich
					economies cluster at the top — but capacity, not just wealth, explains
					a lot of the spread. Click any bar to put a country under the lens.
				</p>
			</Section>

			<Section
				number="02"
				kicker="Capacity"
				question="Are countries collecting as much tax as they could?"
				aside={
					<div className="space-y-3">
						<CapacityScatter rows={rows} onSelect={onSelect} />
						<LegendIncomeGroups />
						<p className="text-muted-foreground text-xs">
							Dashed line = the frontier where actual revenue equals modeled
							capacity. No country exceeds its modeled capacity in this dataset
							— everyone sits at or below the line.
						</p>
					</div>
				}
			>
				<p>
					A statistical model estimates each country's taxable capacity from
					structural features — income, trade openness, sector composition. The
					vertical distance below the dashed frontier is the gap between what a
					country collects and what, structurally, it could.
				</p>
			</Section>

			<Section
				number="03"
				kicker="Composition"
				question="What is a government actually taxing to fund itself?"
				aside={
					<div className="space-y-3">
						<CompositionOverview rows={rows} />
						<LegendComposition />
					</div>
				}
			>
				<p>
					Averaged within each group and using each country's most recent year
					of data, the mix shifts dramatically with development: low-income
					governments lean on trade taxes and excises, while high-income ones
					draw primarily from personal income taxes and VAT.
				</p>
			</Section>

			<Section
				number="04"
				kicker="Coverage"
				question="How much of this picture do we actually have?"
				aside={<CompletenessHeatmap index={index} coverage={coverage} />}
			>
				<p>
					Coverage is uneven in space and in time — some regions have four
					decades of near-complete data, others have thin stretches or long
					silences. Selecting a country shows exactly which years exist for it,
					and from which source.
				</p>
			</Section>
		</>
	);
}

function CountrySections({
	series,
	meta,
	rows,
	coverage,
}: {
	series: Awaited<ReturnType<typeof fetchCountrySeries>>;
	meta: CountryMeta;
	rows: WorldSnapshotRow[];
	coverage: CountryCoverage | undefined;
}) {
	const peerStats = useMemo(() => {
		const latest = new Map<string, number>();
		for (const r of rows.filter(plottableTaxShare)) {
			if (!latest.has(r.iso3)) latest.set(r.iso3, r.taxRevenue ?? 0);
		}
		const avgBy = (
			key: "iso3" | "region" | "incomeGroup",
			val?: string | null,
		) => {
			const vals: number[] = [];
			for (const r of rows) {
				if (!plottableTaxShare(r) || r.taxRevenue == null) continue;
				if (key === "iso3" ? r.iso3 === val : r[key] === val)
					vals.push(r.taxRevenue);
			}
			return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
		};
		return {
			self: latest.get(meta.iso3) ?? null,
			regionAvg: avgBy("region", meta.region),
			incomeAvg: avgBy("incomeGroup", meta.incomeGroup),
		};
	}, [rows, meta]);

	const coveredYears = series.filter((r) => r.taxRevenue != null).length;

	return (
		<>
			<Section
				id="country-capacity"
				number="01"
				kicker="Capacity over time"
				question={`Is ${meta.name} collecting as much tax as it could?`}
				aside={
					<div className="space-y-3">
						<CoverageTag meta={meta} />
						<GapBandChart series={series} />
						<p className="text-muted-foreground text-xs">
							Solid line = actual tax revenue; dashed = modeled capacity; shaded
							area = the gap. Breaks in the chart are missing years, shown as
							gaps rather than interpolated.
						</p>
					</div>
				}
			>
				<p>
					The model estimates what {meta.name}'s economy could sustainably
					support in tax collection. The shaded band is forgone revenue — though
					capacity is a benchmark, not a target: closing the whole gap is rarely
					feasible or desirable.
				</p>
			</Section>

			<Section
				number="02"
				kicker="Composition"
				question={`What does ${meta.name}'s government actually tax?`}
				aside={
					<div className="space-y-3">
						<CoverageTag meta={meta} />
						<CompositionTime series={series} />
						<LegendComposition />
					</div>
				}
			>
				<p>
					The stack decomposes total tax take into its instruments — income,
					consumption, trade. Watch how reliance shifts as the economy changes:
					trade taxes shrinking, VAT growing, income taxes maturing.
				</p>
			</Section>

			<Section
				number="03"
				kicker="Peers"
				question={`How does ${meta.name} compare to its peers?`}
				aside={
					<PeerCompare
						countryName={meta.name}
						countryValue={peerStats.self}
						regionAvg={peerStats.regionAvg}
						incomeAvg={peerStats.incomeAvg}
					/>
				}
			>
				<p>
					Same metric — latest available tax-to-GDP — against two reference
					points: the regional average and the income-group average. Context
					matters more than rank.
				</p>
			</Section>

			<Section
				number="04"
				kicker="Statutory rates"
				question={`What are the rates on paper in ${meta.name}?`}
				aside={
					<div className="space-y-3">
						<CoverageTag meta={meta} />
						<RatesTimeline series={series} />
					</div>
				}
			>
				<p>
					De jure rates tell a different story than collections: a country can
					have high statutory rates and low revenue when enforcement, bases, or
					exemptions get in the way.
				</p>
			</Section>

			<Section
				number="05"
				kicker="Coverage"
				question={`How complete is the record for ${meta.name}?`}
				aside={
					<div className="space-y-3">
						<CoverageTag meta={meta} />
						<CountryCoverageTimeline meta={meta} coverage={coverage} />
					</div>
				}
			>
				<p>
					{coveredYears} years carry tax-revenue data for {meta.name}
					{meta.latestYearWithData != null
						? `, most recently ${meta.latestYearWithData}`
						: ""}
					. Where coverage stops short of the present, that's marked on every
					chart above rather than hidden.
				</p>
			</Section>
		</>
	);
}

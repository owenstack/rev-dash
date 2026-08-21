import type { CountryYearRecord, WorldSnapshotRow } from "@rev-dash/data/types";
import { areaY, barX, defineChart, dot, lineY } from "@tanstack/charts";
import type { ChartProps } from "@tanstack/charts/react";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scaleOrdinal } from "@tanstack/charts/scales/ordinal";
import { tooltip } from "@tanstack/charts/tooltip";
import type { ChartValue } from "@tanstack/charts/types";
import { useMemo } from "react";
import { useContainerWidth } from "@/hooks/use-container-width";
import { contiguousSegments, plottableTaxShare } from "@/lib/data";
import {
	COMPOSITION_CATEGORIES,
	COMPOSITION_COLORS,
	INCOME_GROUP_COLORS,
	INCOME_GROUPS,
	incomeColor,
} from "@/lib/palette";

const incomeScale = scaleOrdinal<string, string>()
	.domain([...INCOME_GROUPS, "Unknown"])
	.range([...INCOME_GROUPS.map((g) => INCOME_GROUP_COLORS[g]), "#8a8a93"]);

const compositionScale = scaleOrdinal<string, string>()
	.domain(COMPOSITION_CATEGORIES.map((c) => c.key))
	.range(COMPOSITION_CATEGORIES.map((c) => COMPOSITION_COLORS[c.key]));

type SelectHandler = (iso3: string) => void;

/** Renders a chart at the measured width of its wrapping container so it
 * adapts to narrow viewports instead of overflowing with a fixed width. */
function ResponsiveChart<
	TDatum,
	TXValue extends ChartValue,
	TYValue extends ChartValue,
>({
	width: _fixedWidth,
	...props
}: Omit<ChartProps<TDatum, TXValue, TYValue>, "width"> & { width?: number }) {
	const [ref, measuredWidth] = useContainerWidth<HTMLDivElement>();
	return (
		<div ref={ref} className="w-full min-w-0">
			<Chart<TDatum, TXValue, TYValue> {...props} width={measuredWidth} />
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* 01 — overview: ranked bars, tax-to-GDP                              */
/* ------------------------------------------------------------------ */

export function RankedBars({
	rows,
	onSelect,
}: {
	rows: WorldSnapshotRow[];
	onSelect?: SelectHandler;
}) {
	const data = useMemo(
		() =>
			rows
				.filter(plottableTaxShare)
				.sort((a, b) => (b.taxRevenue ?? 0) - (a.taxRevenue ?? 0)),
		[rows],
	);

	const chart = useMemo(
		() =>
			defineChart({
				marks: [
					barX(data, {
						x: "taxRevenue",
						y: "countryName",
						color: "incomeGroup",
						key: "iso3",
						fillOpacity: 0.9,
					}),
				],
				y: { scale: () => scaleBand<string>().padding(0.18) },
				x: {
					scale: scaleLinear,
					grid: true,
					axis: { label: "Tax revenue (% of GDP), latest year with data" },
				},
				color: { scale: incomeScale },
				focus: "nearest-y",
				maxFocusDistance: 24,
				tooltip,
			}),
		[data],
	);

	return (
		<ResponsiveChart
			definition={chart}
			ariaLabel="Countries ranked by tax revenue as a share of GDP"
			height={data.length * 14 + 48}
			onSelect={(point) => {
				const iso3 = point?.datum?.iso3;
				if (typeof iso3 === "string") onSelect?.(iso3);
			}}
		/>
	);
}

/* ------------------------------------------------------------------ */
/* 02 — overview: capacity vs actual scatter                           */
/* ------------------------------------------------------------------ */

const SCATTER_DOMAIN = 60;

export function CapacityScatter({
	rows,
	onSelect,
}: {
	rows: WorldSnapshotRow[];
	onSelect?: SelectHandler;
}) {
	const data = useMemo(
		() =>
			rows
				.filter(plottableTaxShare)
				.filter(
					(r) =>
						r.capTaxRevenue != null &&
						r.capTaxRevenue <= SCATTER_DOMAIN &&
						(r.taxRevenue ?? 0) <= SCATTER_DOMAIN,
				),
		[rows],
	);

	const chart = useMemo(() => {
		// Diagonal "frontier": every country sits at or below this line —
		// gapTaxRevenue is never negative in this dataset.
		const frontier = [
			{ x: 0, y: 0, key: "f0" },
			{ x: SCATTER_DOMAIN, y: SCATTER_DOMAIN, key: "f1" },
		];
		return defineChart({
			marks: [
				lineY(frontier, {
					x: "x",
					y: "y",
					key: "key",
					strokeDasharray: "5 5",
					stroke: "#71717a",
				}),
				dot(data, {
					x: "capTaxRevenue",
					y: "taxRevenue",
					color: "incomeGroup",
					key: "iso3",
				}),
			],
			x: {
				scale: () => scaleLinear().domain([0, SCATTER_DOMAIN]),
				grid: true,
				axis: { label: "Modeled tax capacity (% of GDP)" },
			},
			y: {
				scale: () => scaleLinear().domain([0, SCATTER_DOMAIN]),
				grid: true,
				axis: { label: "Actual tax revenue (% of GDP)" },
			},
			color: { scale: incomeScale },
			focus: "nearest-x",
			maxFocusDistance: 24,
			tooltip,
		});
	}, [data]);

	return (
		<ResponsiveChart
			definition={chart}
			ariaLabel="Actual tax revenue versus modeled tax capacity, one dot per country"
			height={480}
			onSelect={(point) => {
				const iso3 = (point?.datum as { iso3?: string } | null | undefined)
					?.iso3;
				if (typeof iso3 === "string") onSelect?.(iso3);
			}}
		/>
	);
}

/* ------------------------------------------------------------------ */
/* 02 — country: actual vs capacity over time, shaded gap band         */
/* ------------------------------------------------------------------ */

export function GapBandChart({ series }: { series: CountryYearRecord[] }) {
	const rows = useMemo(() => {
		const segments = contiguousSegments(
			series,
			(r) => r.taxRevenue != null && r.capTaxRevenue != null,
		);
		const out: {
			year: number;
			actual: number;
			cap: number;
			z: number;
		}[] = [];
		segments.forEach((seg, i) => {
			for (const r of seg) {
				if (r.taxRevenue == null || r.capTaxRevenue == null) continue;
				out.push({
					year: r.year,
					actual: r.taxRevenue,
					cap: r.capTaxRevenue,
					z: i,
				});
			}
		});
		return out;
	}, [series]);

	const chart = useMemo(
		() =>
			defineChart({
				marks: [
					areaY(rows, {
						x: "year",
						y1: "actual",
						y2: "cap",
						z: "z",
						key: (d: { year: number }) => `a${d.year}`,
						fill: "#8a8a95",
						fillOpacity: 0.2,
					}),
					lineY(rows, {
						x: "year",
						y: "cap",
						z: "z",
						key: (d: { year: number; z: number }) => `cap-${d.z}-${d.year}`,
						strokeDasharray: "5 4",
						stroke: "#b9b9c2",
					}),
					lineY(rows, {
						x: "year",
						y: "actual",
						z: "z",
						key: (d: { year: number; z: number }) => `act-${d.z}-${d.year}`,
						stroke: "#f4f4f5",
					}),
				],
				x: {
					scale: scaleLinear,
					axis: { label: "Year" },
				},
				y: {
					scale: scaleLinear,
					grid: true,
					nice: true,
					axis: { label: "% of GDP" },
				},
				focus: "nearest-x",
				maxFocusDistance: Number.POSITIVE_INFINITY,
				tooltip,
			}),
		[rows],
	);

	if (rows.length === 0) {
		return (
			<p className="motion-state-enter text-muted-foreground text-sm">
				No years where both actual revenue and modeled capacity are available
				for this country.
			</p>
		);
	}

	return (
		<ResponsiveChart
			definition={chart}
			ariaLabel="Actual tax revenue and modeled tax capacity over time, with the gap shaded"
			height={380}
		/>
	);
}

/* ------------------------------------------------------------------ */
/* 03 — composition                                                    */
/* ------------------------------------------------------------------ */

/** One representative row per country: its most recent year with any
 * composition data. All categories are then read from this same row, so a
 * stacked bar never mixes values from mismatched years. */
function representativeRows<T extends WorldSnapshotRow>(
	rows: readonly T[],
): Map<string, T> {
	const byCountry = new Map<string, T>();
	for (const r of rows) {
		if (!COMPOSITION_CATEGORIES.some((c) => r[c.key] != null)) continue;
		const prev = byCountry.get(r.iso3);
		if (!prev || r.year > prev.year) byCountry.set(r.iso3, r);
	}
	return byCountry;
}

/** Average composition shares for two income groups, manually stacked.
 * Per country, every category comes from the same (latest) year. */
export function CompositionOverview({ rows }: { rows: WorldSnapshotRow[] }) {
	const groups = ["Low Income", "High Income"] as const;

	const stacked = useMemo(() => {
		const out: {
			group: string;
			cat: string;
			catLabel: string;
			y1: number;
			y2: number;
			key: string;
		}[] = [];
		for (const group of groups) {
			// representative row per country in this group — one common year
			const reps = [...representativeRows(rows).values()].filter(
				(r) => r.incomeGroup === group,
			);
			let cum = 0;
			for (const cat of COMPOSITION_CATEGORIES) {
				const values = reps
					.map((r) => r[cat.key])
					.filter((v): v is number => v != null);
				if (values.length === 0) continue;
				const avg =
					values.reduce((a, b) => a + b, 0) / values.length;
				out.push({
					group,
					cat: cat.key,
					catLabel: cat.label,
					y1: cum,
					y2: cum + avg,
					key: `${group}-${cat.key}`,
				});
				cum += avg;
			}
		}
		return out;
	}, [rows, groups]);

	const chart = useMemo(
		() =>
			defineChart({
				marks: [
					barX(stacked, {
						y: "group",
						x1: "y1",
						x2: "y2",
						color: "cat",
						key: "key",
					}),
				],
				y: { scale: () => scaleBand<string>().padding(0.35) },
				x: {
					scale: scaleLinear,
					grid: true,
					axis: {
						label: "Average share of GDP across countries with data (%)",
					},
				},
				color: { scale: compositionScale },
				focus: "nearest-y",
				maxFocusDistance: 24,
				tooltip,
			}),
		[stacked],
	);

	return (
		<ResponsiveChart
			definition={chart}
			ariaLabel="Average tax composition, low income versus high income countries"
			height={220}
		/>
	);
}

export function LegendComposition() {
	return (
		<div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
			{COMPOSITION_CATEGORIES.map((c) => (
				<span key={c.key} className="inline-flex items-center gap-1.5">
					<span
						className="inline-block size-2.5 rounded-[2px]"
						style={{ background: COMPOSITION_COLORS[c.key] }}
					/>
					{c.label}
				</span>
			))}
		</div>
	);
}

/** Stacked area of one country's composition over time, manual stacking. */
export function CompositionTime({ series }: { series: CountryYearRecord[] }) {
	const stacked = useMemo(() => {
		const out: {
			year: number;
			cat: string;
			y1: number;
			y2: number;
			key: string;
		}[] = [];
		for (const cat of COMPOSITION_CATEGORIES) {
			for (const r of series) {
				const v = r[cat.key];
				if (v == null) continue;
				// cumulative sum of the categories below this one for that year
				let below = 0;
				for (const c of COMPOSITION_CATEGORIES) {
					if (c.key === cat.key) break;
					below += r[c.key] ?? 0;
				}
				out.push({
					year: r.year,
					cat: cat.key,
					y1: below,
					y2: below + v,
					key: `${cat.key}-${r.year}`,
				});
			}
		}
		return out;
	}, [series]);

	if (stacked.length === 0) {
		return (
			<p className="motion-state-enter text-muted-foreground text-sm">
				No composition breakdown available for this country.
			</p>
		);
	}

	const chart = useMemo(
		() =>
			defineChart({
				marks: [
					// One areaY per contiguous run of years per category, so missing
					// years render as visible gaps instead of a misleadingly
					// continuous filled area across years with no source data.
					...COMPOSITION_CATEGORIES.flatMap((cat) => {
						const catRows = stacked
							.filter((d) => d.cat === cat.key)
							.sort((a, b) => a.year - b.year);
						return contiguousSegments(catRows, () => true).map((seg) =>
							areaY(seg, {
								x: "year",
								y1: "y1",
								y2: "y2",
								key: "key",
								fill: COMPOSITION_COLORS[cat.key],
								fillOpacity: 0.85,
							}),
						);
					}),
				],
				x: { scale: scaleLinear, axis: { label: "Year" } },
				y: {
					scale: scaleLinear,
					nice: true,
					grid: true,
					axis: { label: "% of GDP" },
				},
				focus: "nearest-x",
				maxFocusDistance: Number.POSITIVE_INFINITY,
				tooltip,
			}),
		[stacked],
	);

	return (
		<ResponsiveChart
			definition={chart}
			ariaLabel="Tax composition over time"
			height={380}
		/>
	);
}

/* ------------------------------------------------------------------ */
/* 04 — peer comparison (country mode)                                 */
/* ------------------------------------------------------------------ */

export function PeerCompare({
	countryName,
	countryValue,
	regionAvg,
	incomeAvg,
}: {
	countryName: string;
	countryValue: number | null;
	regionAvg: number | null;
	incomeAvg: number | null;
}) {
	const rows = [
		{ label: countryName, value: countryValue, kind: "country", key: "c" },
		{
			label: regionAvg != null ? "Region average" : "",
			value: regionAvg,
			kind: "peer",
			key: "r",
		},
		{
			label: incomeAvg != null ? "Income-group average" : "",
			value: incomeAvg,
			kind: "peer",
			key: "i",
		},
	].filter((r) => r.value != null && r.label !== "");

	if (rows.length === 0) {
		return (
			<p className="motion-state-enter text-muted-foreground text-sm">
				No recent tax-revenue figure to compare for this country.
			</p>
		);
	}

	const peerScale = scaleOrdinal<string, string>()
		.domain(["country", "peer"])
		.range(["#f4f4f5", "#63636e"]);

	const chart = useMemo(
		() =>
			defineChart({
				marks: [
					barX(rows, {
						x: "value",
						y: "label",
						color: "kind",
						key: "key",
					}),
				],
				y: { scale: () => scaleBand<string>().padding(0.3) },
				x: {
					scale: scaleLinear,
					grid: true,
					axis: { label: "Tax revenue (% of GDP), most recent year" },
				},
				color: { scale: peerScale },
				tooltip,
			}),
		[rows, peerScale],
	);

	return (
		<ResponsiveChart
			definition={chart}
			ariaLabel={`${countryName} compared with region and income-group averages`}
			height={160}
		/>
	);
}

/* ------------------------------------------------------------------ */
/* 05 — statutory rates (country mode)                                 */
/* ------------------------------------------------------------------ */

export function RatesTimeline({ series }: { series: CountryYearRecord[] }) {
	const lines = useMemo(() => {
		const kinds = [
			{ key: "ratePit", label: "PIT top rate" },
			{ key: "rateCit", label: "CIT rate" },
			{ key: "rateIndirect", label: "VAT / indirect rate" },
		] as const;
		return kinds.map((k, ki) => ({
			label: k.label,
			rows: contiguousSegments(series, (r) => r[k.key] != null).flatMap((seg) =>
				seg.map((r) => ({
					year: r.year,
					rate: r[k.key] as number,
					z: `${k.key}-${ki}-${seg[0].year}`,
					key: `${k.key}-${r.year}`,
				})),
			),
		}));
	}, [series]);

	const hasAny = lines.some((l) => l.rows.length > 0);
	if (!hasAny) {
		return (
			<p className="motion-state-enter text-muted-foreground text-sm">
				No statutory rate history available for this country.
			</p>
		);
	}

	const allRows = lines.flatMap((l) =>
		l.rows.map((r) => ({ ...r, kind: l.label })),
	);
	const rateScale = scaleOrdinal<string, string>()
		.domain(lines.map((l) => l.label))
		.range(["#f4f4f5", "#b9b9c2", "#71717a"]);

	const chart = useMemo(
		() =>
			defineChart({
				marks: [
					lineY(allRows, {
						x: "year",
						y: "rate",
						z: "z",
						color: "kind",
						key: "key",
					}),
				],
				x: { scale: scaleLinear, axis: { label: "Year" } },
				y: {
					scale: scaleLinear,
					grid: true,
					nice: true,
					axis: { label: "Statutory rate (%)" },
				},
				color: { scale: rateScale },
				tooltip,
			}),
		[allRows, rateScale],
	);

	return (
		<ResponsiveChart
			definition={chart}
			ariaLabel="Statutory PIT, CIT and VAT rates over time"
			height={320}
		/>
	);
}

/* ------------------------------------------------------------------ */
/* shared legend chip row for income groups                            */
/* ------------------------------------------------------------------ */

export function LegendIncomeGroups() {
	return (
		<div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
			{INCOME_GROUPS.map((g) => (
				<span key={g} className="inline-flex items-center gap-1.5">
					<span
						className="inline-block size-2.5 rounded-full"
						style={{ background: incomeColor(g) }}
					/>
					{g.replace(" Income", "")}
				</span>
			))}
		</div>
	);
}

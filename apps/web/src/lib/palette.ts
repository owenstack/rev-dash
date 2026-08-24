/** The one reserved accent system: four-color categorical palette for
 * income-group coding, used consistently in charts, globe markers, legend chips. */
export const INCOME_GROUP_COLORS = {
	"Low Income": "#D85A30",
	"Lower Middle Income": "#EF9F27",
	"Upper Middle Income": "#5DCAA5",
	"High Income": "#7F77DD",
} as const;

export const INCOME_GROUPS = Object.keys(
	INCOME_GROUP_COLORS,
) as (keyof typeof INCOME_GROUP_COLORS)[];

export function incomeColor(group: string | null): string {
	return group && group in INCOME_GROUP_COLORS
		? INCOME_GROUP_COLORS[group as keyof typeof INCOME_GROUP_COLORS]
		: "#8a8a93";
}

/** cobe wants [r,g,b] floats in 0..1 */
export function hexToRgbFloats(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Categorical colors for tax-composition categories, derived from the
 * reserved accent palette so charts stay visually cohesive. "Other" is
 * deliberately neutral — it's the catch-all, not a distinct instrument. */
export const COMPOSITION_CATEGORIES = [
	{ key: "pit", label: "Personal income" },
	{ key: "cit", label: "Corporate income" },
	{ key: "vat", label: "VAT / GST" },
	{ key: "excise", label: "Excises" },
	{ key: "trade", label: "Trade taxes" },
	{ key: "other", label: "Other" },
] as const;

export const COMPOSITION_COLORS: Record<string, string> = {
	pit: "#7F77DD", // violet (High income accent)
	cit: "#D85A30", // coral/rust (Low income accent)
	vat: "#5DCAA5", // teal (Upper middle accent)
	excise: "#EF9F27", // amber (Lower middle accent)
	trade: "#4E8FD9", // blue — supplementary hue, distinct from the four above
	other: "#8a8a93", // neutral gray — catch-all
};

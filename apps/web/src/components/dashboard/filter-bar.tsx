import type { CountryMeta } from "@rev-dash/data/types";
import { Button } from "@rev-dash/ui/components/button";
import { Input } from "@rev-dash/ui/components/input";
import { X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { incomeColor } from "@/lib/palette";

/** Slim sticky bar: logo mark, country search typeahead, filter chip. */
export function FilterBar({
	countries,
	selected,
	onSelect,
	onClear,
}: {
	countries: CountryMeta[];
	selected: CountryMeta | null;
	onSelect: (iso3: string) => void;
	onClear: () => void;
}) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(-1);
	const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		return countries
			.filter((c) => c.name.toLowerCase().includes(q))
			.slice(0, 8);
	}, [countries, query]);

	const choose = (iso3: string) => {
		onSelect(iso3);
		setQuery("");
		setOpen(false);
		setHighlight(-1);
	};

	return (
		<div className="sticky top-0 z-50 border-border/60 border-b bg-background/85 backdrop-blur">
			<div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
				<a href="/" className="font-semibold font-serif text-sm tracking-tight">
					rev<span className="text-muted-foreground">·</span>dash
				</a>

				<div className="relative ml-auto w-56 md:w-64">
					<Input
						value={query}
						placeholder="Search a country"
						aria-label="Search a country"
						onChange={(e) => {
							setQuery(e.target.value);
							setOpen(true);
							setHighlight(-1);
						}}
						onFocus={() => setOpen(true)}
						onBlur={() => {
							blurTimer.current = setTimeout(() => setOpen(false), 120);
						}}
						onKeyDown={(e) => {
							if (e.key === "ArrowDown" && matches.length > 0) {
								e.preventDefault();
								setOpen(true);
								setHighlight((h) => (h + 1) % matches.length);
							} else if (e.key === "ArrowUp" && matches.length > 0) {
								e.preventDefault();
								setHighlight((h) => (h - 1 + matches.length) % matches.length);
							} else if (
								e.key === "Enter" &&
								matches[highlight >= 0 ? highlight : 0]
							) {
								choose(matches[highlight >= 0 ? highlight : 0].iso3);
							} else if (e.key === "Escape") {
								setOpen(false);
							}
						}}
					/>
					{open && matches.length > 0 && (
						<ul
							aria-label="Country matches"
							className="dropdown-popover absolute top-full left-0 z-50 mt-1 max-h-72 w-full overflow-auto border border-border bg-popover py-1 shadow-lg"
						>
							{matches.map((c, i) => (
								<li key={c.iso3}>
									<button
										type="button"
										className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
											i === highlight ? "bg-muted" : "hover:bg-muted"
										}`}
										onMouseDown={() => {
											if (blurTimer.current) clearTimeout(blurTimer.current);
											choose(c.iso3);
										}}
									>
										<span
											className="inline-block size-2 rounded-full"
											style={{ background: incomeColor(c.incomeGroup) }}
										/>
										{c.name}
										<span className="ml-auto text-muted-foreground">
											{c.iso3}
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</div>

				{selected && <CountryChip meta={selected} onClear={onClear} />}
				{!selected && (
					<span className="border border-border border-dashed px-2.5 py-1 text-muted-foreground text-xs">
						All countries
					</span>
				)}
			</div>
		</div>
	);
}

/** Selected-country chip. Its view-transition name gives the old/new
 * snapshots a 100/160ms scale + opacity animation on select, replace and
 * clear (see index.css); reduced-motion gets an 80ms opacity-only change.
 * Selection changes already run inside `withViewTransition` in the route. */
function CountryChip({
	meta,
	onClear,
}: {
	meta: CountryMeta;
	onClear: () => void;
}) {
	return (
		<span className="inline-flex items-center gap-1.5 border border-border bg-secondary px-2.5 py-1 text-xs [view-transition-name:selected-country-chip]">
			<span
				className="inline-block size-2 rounded-full"
				style={{ background: incomeColor(meta.incomeGroup) }}
			/>
			{meta.name}
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label="Clear filter, back to all countries"
				className="-mr-1.5 ml-1 size-5"
				onClick={onClear}
			>
				<X className="size-3" />
			</Button>
		</span>
	);
}

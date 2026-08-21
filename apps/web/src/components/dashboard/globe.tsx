import type { CountryMeta } from "@rev-dash/data/types";
import createGlobe from "cobe";
import { useEffect, useMemo, useRef } from "react";
import { COUNTRY_COORDS } from "@/lib/coords";
import { hexToRgbFloats, incomeColor } from "@/lib/palette";

/**
 * Dot globe. COBE v2 does NOT drive its own animation loop and has no
 * onRender callback — the caller owns a requestAnimationFrame loop and
 * calls globe.update({ phi }) every frame.
 *
 * Marker click targets use CSS Anchor Positioning (COBE's documented
 * mechanism): each marker gets an id and COBE exposes `--cobe-{id}` as an
 * anchor name plus `--cobe-visible-{id}` for on-screen visibility.
 */
export function CountryGlobe({
	countries,
	selected,
	onSelect,
	size = 560,
}: {
	countries: CountryMeta[];
	selected: string | null;
	onSelect: (iso3: string) => void;
	size?: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const phiRef = useRef(0);
	const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);

	// Base marker set, memoized so it's a stable effect dependency — without
	// this the WebGL globe would be torn down and recreated on every render.
	const markers = useMemo(
		() =>
			countries
				.filter((c) => COUNTRY_COORDS[c.iso3])
				.map((c) => ({
					id: c.iso3,
					location: COUNTRY_COORDS[c.iso3],
					size: c.incomeGroup ? 0.045 : 0.035,
					color: hexToRgbFloats(incomeColor(c.incomeGroup)),
				})),
		[countries],
	);

	// Globe creation must be declared BEFORE the selection effect: effects
	// run in declaration order on mount, so globeRef is populated by the time
	// the selection effect applies an initial URL selection like ?country=USA.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const globe = createGlobe(canvas, {
			width: size,
			height: size,
			phi: 0,
			theta: 0.22,
			mapSamples: 16000,
			mapBrightness: 5.5,
			baseColor: [0.18, 0.18, 0.21],
			markerColor: [0.85, 0.85, 0.92],
			glowColor: [0.1, 0.1, 0.12],
			dark: 1,
			diffuse: 1.4,
			markers,
			devicePixelRatio: Math.min(window.devicePixelRatio ?? 1, 2),
		});
		globeRef.current = globe;

		let raf = 0;
		const frame = () => {
			phiRef.current += 0.0022;
			globe.update({ phi: phiRef.current });
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(raf);
			globe.destroy();
			globeRef.current = null;
		};
		// rebuild only when the country set or size actually changes
	}, [size, markers]);

	// Selection only re-emphasizes one marker via a cheap partial update();
	// it must not recreate the globe or reset rotation.
	useEffect(() => {
		if (!selected) {
			globeRef.current?.update({ markers });
			return;
		}
		globeRef.current?.update({
			markers: markers.map((m) =>
				m.id === selected ? { ...m, size: 0.09 } : m,
			),
		});
	}, [selected, markers]);

	return (
		<div className="relative" style={{ width: size, height: size }}>
			<canvas
				ref={canvasRef}
				style={{ width: size, height: size, contain: "layout paint size" }}
			/>
			{markers.map((m) => (
				<button
					key={m.id}
					type="button"
					aria-label={`Select ${countries.find((c) => c.iso3 === m.id)?.name ?? m.id}`}
					className="globe-marker-btn"
					style={{
						// COBE exposes these custom properties on the canvas per frame
						positionAnchor: `--cobe-${m.id}`,
						opacity: `var(--cobe-visible-${m.id}, 0)`,
					}}
					onClick={() => {
						// opacity alone doesn't stop hit-testing: markers on the far
						// side of the sphere are invisible but still clickable, which
						// would let an apparently empty click select an off-screen
						// country. Only accept clicks on markers COBE reports visible.
						const canvas = canvasRef.current;
						if (canvas) {
							const visible = getComputedStyle(canvas)
								.getPropertyValue(`--cobe-visible-${m.id}`)
								.trim();
							// COBE removes the property entirely for far-side markers,
							// so an empty value means hidden too — only a positive
							// visibility counts.
							if (visible === "" || visible === "0") return;
						}
						onSelect(m.id);
					}}
				/>
			))}
		</div>
	);
}

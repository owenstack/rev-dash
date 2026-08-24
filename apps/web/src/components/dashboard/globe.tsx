import type { CountryMeta } from "@public-purse/data/types";
import createGlobe from "cobe";
import { useEffect, useMemo, useRef } from "react";
import { COUNTRY_COORDS } from "@/lib/coords";
import { hexToRgbFloats, incomeColor } from "@/lib/palette";

const AUTO_ROTATE_SPEED = 0.0022;
const THETA_LIMIT = 1.1;
/** Movement (px) before a press becomes a drag and cancels the click. */
const DRAG_THRESHOLD_PX = 6;
/** Per-frame decay of post-release spin. */
const MOMENTUM_DECAY = 0.95;

/** Progressive resistance past a rotational boundary (rubber-banding). */
function rubberband(overshoot: number, constant = 0.55) {
	const dimension = 100;
	return (
		(overshoot * dimension * constant) /
		(dimension + constant * Math.abs(overshoot))
	);
}

function clampedThetaWithRubberband(raw: number) {
	if (raw > THETA_LIMIT) return THETA_LIMIT + rubberband(raw - THETA_LIMIT);
	if (raw < -THETA_LIMIT) return -THETA_LIMIT - rubberband(-raw - THETA_LIMIT);
	return raw;
}

/**
 * Dot globe. COBE v2 does NOT drive its own animation loop and has no
 * onRender callback — the caller owns a requestAnimationFrame loop and
 * calls globe.update({ phi }) every frame.
 *
 * The globe is draggable: pointer drag maps to phi (longitude) and clamped
 * theta (latitude); auto-rotation pauses while dragging.
 *
 * Marker click targets use CSS Anchor Positioning (COBE's documented
 * mechanism): each marker gets an id and COBE exposes `--cobe-{id}` as an
 * anchor name plus `--cobe-visible-{id}` for on-screen visibility. Hovering
 * a visible marker shows a country-name label.
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
	// Unclamped latitude: dragged past the limit it overshoots with rubber-band
	// resistance and settles back inside on release.
	const thetaRawRef = useRef(0.22);
	// Post-release spin (phi units per frame), handed off from the drag.
	const momentumRef = useRef(0);
	// Drag state: null when not dragging; tracks start point (for the tap
	// threshold) and last event (for velocity handoff).
	const dragRef = useRef<{
		x: number;
		y: number;
		lastX: number;
		velPhi: number;
	} | null>(null);
	const movedBeyondThresholdRef = useRef(false);
	const reduceMotionRef = useRef(false);
	const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);

	// Reduced motion: no perpetual auto-rotation (slow looping oscillations are
	// a vestibular trigger). The globe stays fully draggable.
	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		reduceMotionRef.current = mq.matches;
		const onChange = () => {
			reduceMotionRef.current = mq.matches;
		};
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

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

	const nameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const c of countries) map.set(c.iso3, c.name);
		return map;
	}, [countries]);

	// Globe creation must be declared BEFORE the selection effect: effects
	// run in declaration order on mount, so globeRef is populated by the time
	// the selection effect applies an initial URL selection like ?country=USA.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const globe = createGlobe(canvas, {
			width: size,
			height: size,
			phi: phiRef.current,
			theta: clampedThetaWithRubberband(thetaRawRef.current),
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
			const dragging = dragRef.current !== null;
			if (!dragging) {
				// Settle rubber-banded latitude back inside the limit: ease the raw
				// value toward the boundary so the resisted overshoot springs home
				// instead of staying frozen past the edge.
				if (thetaRawRef.current > THETA_LIMIT) {
					thetaRawRef.current += (THETA_LIMIT - thetaRawRef.current) * 0.15;
				} else if (thetaRawRef.current < -THETA_LIMIT) {
					thetaRawRef.current += (-THETA_LIMIT - thetaRawRef.current) * 0.15;
				}
				// Momentum handoff: keep spinning at the release velocity, decay
				// per frame, and let auto-rotation blend back in once the spin
				// falls below its speed. Under reduced motion: no ambient spin.
				if (Math.abs(momentumRef.current) > 0.00001) {
					phiRef.current += momentumRef.current;
					momentumRef.current *= MOMENTUM_DECAY;
				}
				if (
					Math.abs(momentumRef.current) <= AUTO_ROTATE_SPEED &&
					!reduceMotionRef.current
				) {
					phiRef.current += AUTO_ROTATE_SPEED;
				}
			}
			globe.update({
				phi: phiRef.current,
				theta: clampedThetaWithRubberband(thetaRawRef.current),
			});
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

	const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		movedBeyondThresholdRef.current = false;
		dragRef.current = {
			x: e.clientX,
			y: e.clientY,
			lastX: e.clientX,
			velPhi: 0,
		};
	};

	const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const drag = dragRef.current;
		if (!drag) return;
		// Hysteresis: small movements are still a tap — don't rotate, and let
		// the click go through. Past the threshold this becomes a drag and the
		// subsequent click is suppressed.
		if (
			!movedBeyondThresholdRef.current &&
			Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD_PX
		) {
			return;
		}
		movedBeyondThresholdRef.current = true;
		const dx = e.clientX - drag.lastX;
		const dPhi = dx * 0.005;
		phiRef.current += dPhi;
		thetaRawRef.current -= (e.clientY - drag.y) * 0.005;
		// Smoothed velocity in phi units per event, for momentum handoff.
		drag.velPhi = drag.velPhi * 0.8 + dPhi * 0.2;
		drag.lastX = e.clientX;
		drag.y = e.clientY;
	};

	const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const drag = dragRef.current;
		if (!drag) return;
		if (movedBeyondThresholdRef.current) {
			// Hand the gesture's velocity to the animation so there is no seam.
			momentumRef.current = drag.velPhi;
		}
		dragRef.current = null;
		e.currentTarget.releasePointerCapture(e.pointerId);
	};
	return (
		<div className="relative" style={{ width: size, height: size }}>
			<canvas
				ref={canvasRef}
				className="cursor-grab touch-none select-none active:cursor-grabbing"
				style={{ width: size, height: size, contain: "layout paint size" }}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
			/>
			{markers.map((m) => (
				<button
					key={m.id}
					type="button"
					aria-label={`Select ${nameById.get(m.id) ?? m.id}`}
					className="globe-marker-btn"
					// Marker buttons sit above the canvas, so a press on one never
					// runs the canvas's own pointerdown (which resets drag
					// suppression). Reset here so clicks always register.
					onPointerDown={() => {
						movedBeyondThresholdRef.current = false;
					}}
					style={{
						// COBE exposes these custom properties on the canvas per frame
						positionAnchor: `--cobe-${m.id}`,
						opacity: `var(--cobe-visible-${m.id}, 0)`,
					}}
					onClick={() => {
						// A press that moved past the tap threshold became a drag —
						// dragging away and back must cancel the selection.
						if (movedBeyondThresholdRef.current) return;
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
				>
					<span className="globe-marker-label" aria-hidden="true">
						{nameById.get(m.id) ?? m.id}
					</span>
				</button>
			))}
		</div>
	);
}

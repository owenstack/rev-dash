import { useEffect, useRef, useState } from "react";

/** Measures the rendered width of a container element via ResizeObserver,
 * falling back to `fallback` before first measurement. Returns a ref to
 * attach to the wrapping element and the current width in px. */
export function useContainerWidth<T extends HTMLElement>(fallback = 640) {
	const ref = useRef<T | null>(null);
	const [width, setWidth] = useState<number | null>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setWidth(entry.contentRect.width);
			}
		});
		ro.observe(el);
		setWidth(el.getBoundingClientRect().width);
		return () => ro.disconnect();
	}, []);

	return [ref, width === null || width <= 0 ? fallback : width] as const;
}

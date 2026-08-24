import type { ReactNode } from "react";

/** Repeating section pattern: kicker + question headline + copy + chart. */
export function Section({
	number,
	kicker,
	question,
	children,
	aside,
	id,
}: {
	number: string;
	kicker: string;
	question: string;
	/** supporting context paragraph(s) */
	children: ReactNode;
	/** chart + legend, rendered adjacent on desktop */
	aside?: ReactNode;
	/** optional anchor id (e.g. scroll target after a country selection) */
	id?: string;
}) {
	return (
		<section
			id={id}
			className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 md:py-24"
		>
			<div className="grid gap-8 md:grid-cols-2 md:gap-12">
				<div>
					<p className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-widest">
						{number} — {kicker}
					</p>
					<h2 className="text-balance font-medium font-serif text-2xl leading-snug tracking-tight md:text-3xl">
						{question}
					</h2>
					<div className="mt-4 max-w-prose space-y-3 text-muted-foreground text-sm leading-relaxed">
						{children}
					</div>
				</div>
				<div className="min-w-0">{aside}</div>
			</div>
		</section>
	);
}

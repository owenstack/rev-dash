# Design prompt: public-purse — a tax revenue exploration dashboard

## What this is

A portfolio data-journalism piece exploring how governments fund themselves,
built on 40+ years of tax revenue data across 197 countries (UNU-WIDER GRD,
IMF WoRLD, and Revenue Academy's SFA-derived tax capacity model). Not a BI
dashboard — an editorial, single-page interactive exploration in the spirit
of FT/Economist data journalism, anchored by a rotating globe as the primary
navigation device.

**Guiding thesis, stated on the page itself:** *How does a country pay for
itself — and is it collecting what it could?*

## Visual direction

- **Monochrome-first, editorial, minimalist.** Generous whitespace, real
  typographic hierarchy, restrained color. Reference points: FT visual
  journalism, The Economist's data pages, Vercel/Linear-style dev portfolios
  — not Tableau, not a typical admin/BI dashboard template.
- **One reserved accent system**: a four-color categorical palette for
  income-group coding, used consistently everywhere it appears (charts,
  globe markers, legend chips). Starting palette (already validated in a
  working chart prototype, feel free to refine):
  - Low income — `#D85A30` (coral/rust)
  - Lower middle income — `#EF9F27` (amber)
  - Upper middle income — `#5DCAA5` (teal/green)
  - High income — `#7F77DD` (violet)
- **Dark hero, light body** is one reasonable direction (the globe reads
  well on dark), but this is open — propose whichever contrast works best
  for legibility of both the globe and the chart-heavy sections below it.
- Typography: a characterful serif or display face for section headlines
  (these headlines are literally questions, they should read like article
  titles) paired with a clean, high-legibility sans for body copy and chart
  labels/axes.

## Structure: one continuous page, not separate routes

There is no separate "country page." Everything lives on one scrolling
route. A country selection is a **filter state**, not a navigation — the
URL updates via a search param (`?country=NGA`) but the page itself doesn't
change shape, just what's inside each section.

**Persistent chrome once scrolled past the hero:** a slim sticky bar with a
small logo mark, a search input ("Search a country"), and a filter chip on
the right — either "All countries" (default/pill styling) or the selected
country's name with a clear/× affordance to return to overview.

## The hero: globe as the primary input

- A rotating, minimal **dot globe** (point markers per country on a
  sphere, not full country polygon shapes) — think glowing dots on a dark
  sphere, monochrome with the income-group accent only appearing on
  hover/selection.
- Below/beside the globe: the thesis headline and the search input (typing
  a country name is a first-class parallel input to clicking a globe dot,
  not a fallback).
- **Interaction, already prototyped and working**: clicking a globe marker
  triggers a smooth morph — via the View Transitions API — where the globe
  shrinks and relocates (e.g. into a corner or a compact "currently viewing"
  badge) while the country's content panel transitions in. This should feel
  like one continuous camera move, not a page swap or hard cut.
- If the user simply scrolls past the hero without clicking anything, the
  content below defaults to the all-countries overview.

## Section pattern (repeats down the page)

Every section below the hero follows the same shape:

1. A small kicker/eyebrow label (e.g. "02 — Composition")
2. **A question as the actual headline** — not a chart title. E.g. "Are
   countries collecting as much tax as they could?" — the copy IS the
   framing device for the chart, not decoration around it.
3. A short paragraph of supporting context (2–3 sentences)
4. The chart itself, positioned adjacent to the copy on desktop (roughly
   40/60 split, text/chart) and stacked below the copy on mobile

## The six sections and what changes between modes

Filter = "All countries" and filter = a specific country reuse the same
section slots, but several swap chart type entirely — this asymmetry is
intentional, not a gap to fill in later.

| # | Question | All-countries view | Single-country view |
|---|---|---|---|
| 1 | Which countries collect the most/least, relative to their economies? | Ranked bar, tax-to-GDP, all 197 | *(replaced by peer comparison, see #4)* |
| 2 | Are countries collecting as much tax as they could? | **Scatter**: one dot per country, x = modeled tax capacity, y = actual tax revenue, dashed diagonal "frontier" line, dots colored by income group. Everyone sits at or below the line — no country in this data exceeds its modeled capacity. | **Line + shaded gap band** over time for the one country: actual revenue as a solid line, capacity as a dashed line above it, the gap between them shaded |
| 3 | What is a government actually taxing to fund itself? | Composition by income group — stacked bars, poorest vs. richest, showing the real-world shift from trade/excise taxes toward income/VAT as countries develop | Composition over time — stacked area, one country, same tax categories |
| 4 | How does this country compare to its peers? | *(n/a — this IS the reference set for #4)* | Small strip/bars: country vs. region average vs. income-group average |
| 5 | What are the tax rates on paper? | *(skip, or a distribution of statutory rates across all countries)* | Rate cards or a small timeline: PIT / CIT / VAT statutory rates over time |
| 6 | How much of this picture do we actually have? | Completeness heatmap — years of coverage per country/region, deliberately showing the gaps, not hiding them | A small persistent "data available 1990–2007" tag near any chart for that country, whenever coverage stops well short of the present |

## The transparency/attribution layer (this is a real content pillar, not a footnote)

The data is blended from three independently-sourced datasets with
different coverage and update cadence (a Revenue Academy/UNU-WIDER-derived
file with rich but dated analytics, and two live-fetched IMF series via Our
World in Data with different coverage per country — one of them entirely
absent for some countries, which is itself a meaningful signal). The design
should treat "here's exactly where this number came from, and here's
exactly what we don't know" as a genuine feature — a methodology section
with real citations, and small per-chart source/vintage indicators — not an
apologetic disclaimer buried in a footer.

## What to actually produce

Prototype the following screens/states at minimum:
1. Hero state (globe, no selection, thesis + search visible)
2. Overview mode, scrolled — sections 1, 2, 3, 6 with the sticky filter bar
   showing "All countries"
3. The mid-transition moment — globe mid-morph into the compact state (or a
   best guess at the in-between frame if the tool can't animate)
4. Country mode, scrolled — sections 2, 3, 4, 5 with sticky bar showing a
   selected country name + clear affordance
5. A close-up of the section pattern itself (kicker + question headline +
   copy + chart) at a size where the typography and pairing ratio are
   clearly legible

Prioritize getting the tone right — restrained, editorial, confident in its
use of whitespace — over covering every section exhaustively.

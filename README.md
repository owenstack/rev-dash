# The Public Purse

How does a country pay for itself, and is it collecting what it could? This
project explores that question with 40+ years of tax revenue data covering
197 countries, drawn from the UNU-WIDER Government Revenue Dataset, IMF
series (via Our World in Data), and a modeled estimate of each country's
tax capacity.

The result is a single scrolling page in the style of data journalism.
A rotating globe is the main way in: click a country's dot, or search for
it by name, and the whole page refocuses on that country while keeping its
place. Sections ask one question each, such as "Are countries collecting as
much tax as they could?" and answer it with a chart. Gaps in the data are
shown as they are; every chart names its source and vintage.

## Development

This is a Bun + Turborepo monorepo. The app is React with TanStack Router,
TailwindCSS, and shared shadcn/ui components.

```bash
bun install
bun run dev        # start everything in development mode
bun run dev:web    # start only the web app, at http://localhost:3001
```

### Structure

```
apps/web/          # the site itself (React + TanStack Router)
packages/ui/       # shared shadcn/ui components and styles
packages/data/     # dataset build pipeline and types
packages/env/      # environment variable handling
packages/config/   # shared configuration
packages/infra/    # deployment (Cloudflare via Alchemy)
```

### Data

`packages/data` builds the datasets the site loads. To rebuild them:

```bash
cd apps/web && bun run generate-pwa-assets   # PWA icons
```

Coverage and source details live in the site's Sources & Method section,
which also links each upstream dataset and records when it was retrieved.

### Checks and deployment

```bash
bun run check          # Biome formatting and linting
bun run check-types    # TypeScript across all packages
bun run deploy         # deploy to Cloudflare via Alchemy
bun run destroy        # tear down the Cloudflare deployment
```

Shared UI primitives come from `packages/ui`. Add new ones with:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Then import them as:

```tsx
import { Button } from "@public-purse/ui/components/button";
```

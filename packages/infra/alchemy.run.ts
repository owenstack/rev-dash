import alchemy from "alchemy";
import { Vite } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });

const isCI = process.env.NODE_ENV === "production" || !!process.env.CI;
const app = await alchemy("rev-dash", {
	...(isCI && {
		stateStore: (scope) =>
			new CloudflareStateStore(scope, { forceUpdate: true }),
	}),
});

export const web = await Vite("web", {
  cwd: "../../apps/web",
  assets: "dist",
  bindings: {
    VITE_SERVER_URL: alchemy.env.VITE_SERVER_URL!,
  },
});

console.log(`Web    -> ${web.url}`);

await app.finalize();

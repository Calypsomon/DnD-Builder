// Standalone: crawl and fill the HTML cache without parsing (npx tsx importer/download.ts)
import { crawl, downloadAll } from "./crawl";
import { stats } from "./fetch";

const res = await crawl();
const n = await downloadAll(res);
console.log(`done: ${n} pages referenced, ${stats.fetched} fetched, ${stats.cached} from cache`);
if (stats.failed.length) console.log("failed:", stats.failed.join(", "));

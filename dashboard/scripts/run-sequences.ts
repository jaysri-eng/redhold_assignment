/**
 * scripts/run-sequences.ts
 *
 * Manual sequence processor — runs all due nurture email steps and prints a
 * summary. Use this during the demo to trigger emails on-demand instead of
 * waiting for a scheduler.
 *
 * Prerequisites:
 *   • Next.js dev server running at http://localhost:3000 (npm run dev)
 *   • NOTIFY_EMAIL + NOTIFY_GMAIL_APP_PASSWORD set in dashboard/.env.local
 *   • Optional: DEMO_MODE=true in .env.local for 1-minute inter-step delays
 *
 * Run from the dashboard/ directory:
 *   npx tsx scripts/run-sequences.ts
 *   npx ts-node --transpile-only scripts/run-sequences.ts
 *
 * Optional: pass a custom base URL as the first argument
 *   npx tsx scripts/run-sequences.ts http://localhost:3001
 */

// Use a relative import so this script works with ts-node / tsx
// without needing @/ path-alias resolution.
import { processDueSequences } from "../lib/sequence-runner";

const BOLD  = "\x1b[1m";
const RESET = "\x1b[0m";
const CYAN  = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED   = "\x1b[31m";
const DIM   = "\x1b[2m";

const baseUrl = process.argv[2] ?? "http://localhost:3000";

console.log(`\n${BOLD}${CYAN}Sequence Runner${RESET}`);
console.log(`${DIM}Processing due nurture email steps via ${baseUrl}${RESET}\n`);

processDueSequences(baseUrl)
  .then((result) => {
    console.log(`${BOLD}Summary${RESET}`);
    console.log(`  Processed : ${GREEN}${result.processed}${RESET}`);
    console.log(`  Skipped   : ${YELLOW}${result.skipped}${RESET}`);
    console.log(`  Errors    : ${result.errors > 0 ? RED : DIM}${result.errors}${RESET}`);

    if (result.details.length > 0) {
      console.log(`\n${BOLD}Details${RESET}`);
      for (const d of result.details) {
        const icon =
          d.status === "sent"    ? `${GREEN}✓${RESET}` :
          d.status === "error"   ? `${RED}✗${RESET}` :
          `${DIM}–${RESET}`;
        const stepLabel = d.step > 0 ? ` step ${d.step}` : "";
        const msg       = d.message ? `  ${DIM}(${d.message})${RESET}` : "";
        console.log(`  ${icon} ${d.id}${stepLabel}${msg}`);
      }
    }

    if (result.processed === 0 && result.errors === 0) {
      console.log(`\n${DIM}No sequences are due right now.${RESET}`);
      console.log(`${DIM}Set DEMO_MODE=true in .env.local to use 1-minute delays.${RESET}`);
    }

    console.log();
  })
  .catch((err) => {
    console.error(`${RED}Fatal error:${RESET}`, err);
    process.exit(1);
  });

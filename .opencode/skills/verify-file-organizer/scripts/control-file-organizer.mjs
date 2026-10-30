#!/usr/bin/env node

/**
 * Thin forwarder. The harness lives in the repo it verifies, at
 * scripts/verify/ (harness.mjs + cli.mjs), so CI and scenarios can drive the
 * same code this skill does. Argument parsing, subcommands and the exit-code
 * contract are unchanged: 0 success, 1 tool error, 2 harness failure.
 */

import { main } from "../../../../scripts/verify/cli.mjs";

process.exit(await main(process.argv.slice(2)));

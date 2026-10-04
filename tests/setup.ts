import fs from "fs";
import path from "path";
import { globalLoggerSetup } from "./utils/logger-mock.js";

globalLoggerSetup();

/**
 * Several suites mkdtemp into tests/temp, which is gitignored and holds no
 * tracked files, so it does not exist on a fresh checkout. Without this, a first
 * run fails with a hundred ENOENT errors and the cause is invisible.
 *
 * It only passed because jest runs suites in parallel and one worker happened to
 * create the directory before another used it. Creating it once here removes the
 * race and the need for the mkdir -p in CI.
 */
fs.mkdirSync(path.join(process.cwd(), "tests", "temp"), { recursive: true });

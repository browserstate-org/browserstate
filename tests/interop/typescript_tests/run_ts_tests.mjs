#!/usr/bin/env node
import { createState, verifyState } from './test_browser_state.mjs';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2));
const mode = args.mode;
const browser = args.browser;
const session = args.session;

if (!mode || !browser || !session) {
    console.error("Usage: node run_ts_tests.mjs --mode <create|verify> --browser <chromium|webkit|firefox> --session <session_id>");
    process.exit(1);
}

(async () => {
    try {
        if (mode === 'create') {
            await createState(browser, session);
        } else if (mode === 'verify') {
            await verifyState(browser, session);
        } else {
            console.error("Invalid mode. Use 'create' or 'verify'.");
            process.exit(1);
        }
    } catch (error) {
        console.error("Test failed:", error);
        process.exit(1);
    }
})();

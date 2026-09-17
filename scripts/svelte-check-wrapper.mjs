#!/usr/bin/env node
import { spawnSync } from 'child_process';
import path from 'path';

// Filter out flags that some package managers append (like --silent) which svelte-check doesn't accept
const forbidden = new Set(['--silent', '--silent=true', '--silent=false']);
const inputArgs = process.argv.slice(2).filter((arg) => !forbidden.has(arg));

// Ensure --tsconfig is provided by default if not present
const hasTsconfig = inputArgs.some((a) => a === '--tsconfig' || a.startsWith('--tsconfig='));
if (!hasTsconfig) inputArgs.unshift('--tsconfig', './tsconfig.json');

// Fail on warnings (e.g. state_referenced_locally) so pnpm check gates regressions.
// Suppress false positives with `// svelte-ignore` comments in svelte files.
const hasFailOnWarnings = inputArgs.includes('--fail-on-warnings');
if (!hasFailOnWarnings) inputArgs.push('--fail-on-warnings');

// Resolve local svelte-check binary -- on Windows prefer the .CMD shim
const binName = process.platform === 'win32' ? 'svelte-check.CMD' : 'svelte-check';
const binPath = path.join(process.cwd(), 'node_modules', '.bin', binName);

// Use shell on Windows to execute the .CMD shim correctly
const useShell = process.platform === 'win32';
const result = spawnSync(binPath, inputArgs, { stdio: 'inherit', shell: useShell });

process.exit(result.status ?? 1);

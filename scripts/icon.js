/// @ts-check

import { readdir, watch, writeFile } from 'node:fs/promises';
import path from 'node:path';

const types_file = '__icons.d.ts'; // remember to gitignore it
const icons_dir = `./src/lib/icons`;
const watch_ctrl = new AbortController();

async function generate_types() {
	const files = await readdir(icons_dir);
	const comment = `// this file is generated — do not edit it\n\n`;
	const svg_files_union = files
		.filter((f) => path.extname(f).toLocaleLowerCase() == '.svg')
		.map((t) => `'${path.parse(t).name}'\n`)
		.join('\t| ');
	const content = `${comment}type IconName =\n\t| ${svg_files_union.trimEnd()};\n`;
	await writeFile(path.join(icons_dir, types_file), content, 'utf8');
}

async function run_watcher() {
	try {
		let timer;
		const watcher = watch(icons_dir, { signal: watch_ctrl.signal });
		for await (const event of watcher) {
			if (event.filename == types_file) continue;
			clearTimeout(timer);
			timer = setTimeout(generate_types, 700);
		}
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			console.log('\nIcon type-gen aborted gracefully.');
		} else {
			console.error('\nIcon type-gen error:', err);
		}
	}
}

const shutdown = () => {
	watch_ctrl.abort();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

generate_types();
run_watcher();

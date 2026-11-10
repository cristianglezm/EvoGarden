import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const WORKERS = ['simulation', 'flower', 'species'];

/**
 * What is wrong with the files of a production build, as sentences. A web worker that is not created
 * as `new Worker(new URL('./x.ts', import.meta.url))` is not compiled: Vite copies the TypeScript file
 * as it is, the browser cannot run it, and the page only hears an error with no message. The development
 * server compiles on the fly and hides it, and `vite build` succeeds either way.
 */
export function checkBuildAssets(fileNames) {
    const problems = [];
    for (const name of WORKERS) {
        if (!fileNames.some(f => new RegExp(`^${name}\\.worker-.+\\.js$`).test(f))) {
            problems.push(`There is no compiled ${name} worker (${name}.worker-*.js).`);
        }
    }
    for (const file of fileNames.filter(f => /\.tsx?$/.test(f))) {
        problems.push(
            `A TypeScript file was copied as it is, not compiled: ${file}. A worker is compiled only when it is created as new Worker(new URL('./x.ts', import.meta.url)) with the URL written inside the call.`
        );
    }
    return problems;
}

// `npm run build` runs this after the build (postbuild): a build that cannot start fails here, not in the browser.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const dir = resolve(process.argv[2] ?? 'dist/assets');
    if (!existsSync(dir)) {
        console.error(`Build check: ${dir} does not exist.`);
        process.exit(1);
    }
    const problems = checkBuildAssets(readdirSync(dir));
    if (problems.length > 0) {
        console.error(`Build check failed:\n- ${problems.join('\n- ')}`);
        process.exit(1);
    }
    console.log('Build check: the workers are compiled.');
}

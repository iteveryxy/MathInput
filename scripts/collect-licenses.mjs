import { readFileSync, readdirSync, mkdirSync, cpSync, writeFileSync, existsSync, statSync, utimesSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const destination = resolve(process.argv[2] || 'release', 'licenses');
mkdirSync(destination, { recursive: true });
const packages = [];
function collect(name, version, manifestPath, license, source, explicitLicense) {
  const root = dirname(manifestPath);
  const directory = name.replaceAll(/[^a-zA-Z0-9_.-]/g, '_') + '-' + version;
  const files = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && /^(license|copying|notice)([.\-_]|$)/i.test(entry.name)).map((entry) => join(root, entry.name));
  if (explicitLicense && existsSync(resolve(root, explicitLicense))) files.push(resolve(root, explicitLicense));
  const copied = [];
  for (const file of new Set(files)) {
    mkdirSync(join(destination, directory), { recursive: true });
    const target = join(destination, directory, basename(file));
    cpSync(file, target);
    const minimumZipDate = new Date('1980-01-02T00:00:00Z');
    if (statSync(target).mtime < minimumZipDate) utimesSync(target, minimumZipDate, minimumZipDate);
    copied.push(directory + '/' + basename(file));
  }
  packages.push({ name, version, license, source, notices: copied });
}
for (const name of ['mathlive', '@cortex-js/compute-engine', '@tauri-apps/api']) {
  const manifestPath = resolve('node_modules', name, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  collect(name, manifest.version, manifestPath, manifest.license, manifest.repository?.url);
}
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--offline', '--locked', '--format-version', '1', '--manifest-path', 'src-tauri/Cargo.toml'], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, windowsHide: true }));
for (const pkg of metadata.packages) if (pkg.source) collect(pkg.name, pkg.version, pkg.manifest_path, pkg.license, pkg.repository || pkg.source, pkg.license_file);
writeFileSync(join(destination, 'packages.json'), JSON.stringify(packages, null, 2));
console.log(`Collected license metadata for ${packages.length} packages`);

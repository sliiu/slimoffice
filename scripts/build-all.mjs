import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildPresentDist } from "./build-present-dist.mjs";

const root = new URL("..", import.meta.url).pathname;

const suites = ["present", "document", "sheet"];

const pkgs = [];
for (const suite of suites) {
  for (const name of readdirSync(join(root, suite))) {
    const dir = join(root, suite, name);
    if (!statSync(dir).isDirectory()) continue;
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const deps = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).filter((d) => d.startsWith("@sliiu/"));
    pkgs.push({ suite, name, dir, id: manifest.name, deps });
  }
}

const byId = new Map(pkgs.map((p) => [p.id, p]));
const ordered = [];
const seen = new Set();
const visit = (p) => {
  if (seen.has(p.id)) return;
  seen.add(p.id);
  for (const dep of p.deps) {
    const target = byId.get(dep);
    if (target) visit(target);
  }
  ordered.push(p);
};
for (const p of pkgs) visit(p);

for (const { suite, name, dir } of ordered) {
  buildPresentDist(dir);
  console.log(`${suite}/${name}`);
}

import { writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");
const plugins = join(root, ".opencode", "plugins");
const commands = join(root, ".opencode", "commands");

rmSync(dist, { recursive: true, force: true });
rmSync(join(plugins, "opencode-speak.js"), { force: true });

execSync("bun build src/index.ts --outdir dist --target bun --format esm", {
  cwd: root,
  stdio: "inherit",
});

execSync("tsc --emitDeclarationOnly", {
  cwd: root,
  stdio: "inherit",
});

mkdirSync(plugins, { recursive: true });
cpSync(join(dist, "index.js"), join(plugins, "opencode-speak.js"));

mkdirSync(commands, { recursive: true });
writeFileSync(
  join(commands, "voice.md"),
  "---\ndescription: Toggle voice mode on/off\n---\n",
);

console.log("done — dist/ built, voice.md created, copied to .opencode/plugins/");

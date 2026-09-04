import { copyFile, mkdir, stat } from "fs/promises";
import { resolve, join } from "path";

const vaultPath = process.argv[2];
if (!vaultPath) throw new Error("用法：npm run deploy -- <Obsidian 仓库路径>");

const vault = resolve(vaultPath);
const obsidian = join(vault, ".obsidian");
if (!(await stat(obsidian)).isDirectory()) throw new Error(`${vault} 不是 Obsidian 仓库`);

const target = join(obsidian, "plugins", "ob-show-me-anything");
await mkdir(target, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
	await copyFile(resolve(file), join(target, file));
}
console.log(`已部署到 ${target}`);

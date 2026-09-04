import { copyFile, mkdir } from "fs/promises";
import { resolve } from "path";

const target = resolve("release", "ob-show-me-anything");
await mkdir(target, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
	await copyFile(resolve(file), resolve(target, file));
}
console.log(`发布文件已同步到 ${target}`);

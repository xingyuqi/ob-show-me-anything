import { copyFile, mkdir, readFile } from "fs/promises";
import { resolve } from "path";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));
if (packageJson.version !== manifest.version || versions[manifest.version] !== manifest.minAppVersion) {
	throw new Error("package.json、manifest.json 和 versions.json 的版本不一致");
}

const target = resolve("release", "ob-show-me-anything");
await mkdir(target, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
	const source = resolve(file);
	const destination = resolve(target, file);
	await copyFile(source, destination);
	if (!(await readFile(source)).equals(await readFile(destination))) throw new Error(`${file} 同步失败`);
}
console.log(`发布文件已同步到 ${target}`);

// Синхронизирует версию Electron-пакета только в рабочей копии CI.
// Исходная версия релизной линии хранится в VERSION.
import fs from "node:fs";

const version = process.argv[2]?.trim();
if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
  throw new Error(`Некорректная версия: ${version || "не указана"}`);
}

const path = "desktop/package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.version = version;
fs.writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
console.log(`Electron package version: ${version}`);
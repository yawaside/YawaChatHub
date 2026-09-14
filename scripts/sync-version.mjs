#!/usr/bin/env node
/**
 * CI-шаг: копирует версию из корневого VERSION в webview2/*.csproj
 * (<Version>, <AssemblyVersion>, <FileVersion>) перед dotnet publish.
 * Падает с ненулевым кодом, если VERSION кривой или теги версий не найдены.
 */
import { readFileSync, writeFileSync } from "node:fs";

const version = readFileSync("VERSION", "utf8").trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`VERSION должен быть вида X.Y.Z, получено: "${version}"`);
  process.exit(1);
}

const CSPROJ = "webview2/YawaChatHub.WebView2.csproj";
let csproj = readFileSync(CSPROJ, "utf8");
csproj = csproj
  .replace(/<Version>[^<]*<\/Version>/, `<Version>${version}</Version>`)
  .replace(/<AssemblyVersion>[^<]*<\/AssemblyVersion>/, `<AssemblyVersion>${version}.0</AssemblyVersion>`)
  .replace(/<FileVersion>[^<]*<\/FileVersion>/, `<FileVersion>${version}.0</FileVersion>`);

if (!csproj.includes(`<Version>${version}</Version>`)) {
  console.error("В csproj не найден <Version> — проверьте файл");
  process.exit(1);
}

writeFileSync(CSPROJ, csproj);
console.log(`csproj синхронизирован с VERSION: ${version}`);

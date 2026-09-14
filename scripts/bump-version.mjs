#!/usr/bin/env node
/**
 * Увеличение версии: minor/patch — одна цифра 0..9, при переполнении
 * перенос в старший разряд.
 *   1.2.0 → 1.2.1 → … → 1.2.9 → 1.3.0 → … → 1.9.9 → 2.0.0
 *
 * Обновляет корневой VERSION и <Version> в webview2/*.csproj.
 * Запуск: node scripts/bump-version.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

export function bumpVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  if (!m) throw new Error(`VERSION должен быть вида X.Y.Z, получено: "${v}"`);
  let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  patch++;
  if (patch > 9) {
    patch = 0;
    minor++;
    if (minor > 9) {
      minor = 0;
      major++;
    }
  }
  return `${major}.${minor}.${patch}`;
}

const CSPROJ = "webview2/YawaChatHub.WebView2.csproj";

export function syncCsproj(version) {
  let csproj = readFileSync(CSPROJ, "utf8");
  csproj = csproj
    .replace(/<Version>[^<]*<\/Version>/, `<Version>${version}</Version>`)
    .replace(/<AssemblyVersion>[^<]*<\/AssemblyVersion>/, `<AssemblyVersion>${version}.0</AssemblyVersion>`)
    .replace(/<FileVersion>[^<]*<\/FileVersion>/, `<FileVersion>${version}.0</FileVersion>`);
  writeFileSync(CSPROJ, csproj);
}

/* Скрипт всегда исполняется напрямую из CI и локально.
   (Раньше здесь стояла проверка import.meta.url === file://argv[1],
   которая на Windows никогда не срабатывала из-за диска "D:" в пути —
   поэтому версия не увеличивалась и новые теги не создавались.) */
const current = readFileSync("VERSION", "utf8").trim();
const next = bumpVersion(current);
writeFileSync("VERSION", next + "\n");
syncCsproj(next);
console.log(`Версия: ${current} → ${next}`);

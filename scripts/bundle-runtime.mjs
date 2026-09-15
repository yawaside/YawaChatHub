/**
 * Готовит ВСТРОЕННЫЙ рантайм для релизного exe WebView2-хоста:
 *
 *   webview2/runtime/node.exe            — Node.js (копия текущего process.execPath)
 *   webview2/runtime/tiktok-bridge.zip   — мост TikTok LIVE: bridge.js, манифесты
 *                                          и готовый node_modules (tiktok-live-connector)
 *
 * Оба файла перечислены в webview2/YawaChatHub.WebView2.csproj как ресурсы и
 * оказываются внутри YawaChatHub.exe. При первом подключении TikTok хост
 * разворачивает их в %LOCALAPPDATA%\YawaChatHub — на ПК пользователя
 * Node.js (равно как Python/Java) ставить НЕ нужно.
 *
 * Запускать перед dotnet publish: локально (npm run bundle:runtime) и в CI
 * (.github/workflows/release.yml). Без runtime/*.exe+.zip хост, как раньше,
 * ищет системный Node — это dev-режим.
 *
 * Релизный exe только win-x64, поэтому скрипт работает на Windows
 * (zip создаётся штатным bsdtar — tar.exe есть из коробки с Windows 10).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bridgeDir = path.join(root, "tiktok-bridge");
const runtimeDir = path.join(root, "webview2", "runtime");

if (process.platform !== "win32") {
  console.error("bundle-runtime: релизный exe собирается только на Windows (win-x64).");
  process.exit(1);
}

// 1. зависимости моста — строго по tiktok-bridge/package-lock.json,
//    чтобы zip везде получался одинаковым.
//    shell: true обязателен: на Windows npm — это npm.cmd, а execFile без
//    shell для .cmd/.bat с Node 18.20+/20.12+ запрещён (EINVAL).
console.log("bundle-runtime: npm ci в tiktok-bridge …");
execFileSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
  cwd: bridgeDir,
  stdio: "inherit",
  shell: true,
});

// 2. чистый каталог runtime
rmSync(runtimeDir, { recursive: true, force: true });
mkdirSync(runtimeDir, { recursive: true });

// 3. Рантайм Node.js — та же версия, что собирает проект (setup-node в CI,
//    локальный Node дома). Имя файла специально как у хоста — YawaChatHub.exe:
//    диспетчер задач сворачивает процессы с одинаковым именем образа в одну
//    ветку, и фоновый модуль TikTok не висит отдельным «Node.js» рядом с
//    приложением. Иначе пользователь видел три разрозненные ветки.
copyFileSync(process.execPath, path.join(runtimeDir, "YawaChatHub.exe"));

// 4. zip моста штатным bsdtar (C:\Windows\System32\tar.exe)
execFileSync(
  "tar.exe",
  [
    "-a",
    "-c",
    "-f",
    path.join(runtimeDir, "tiktok-bridge.zip"),
    "-C",
    bridgeDir,
    "bridge.js",
    "package.json",
    "package-lock.json",
    "node_modules",
  ],
  { stdio: "inherit" },
);

for (const f of ["YawaChatHub.exe", "tiktok-bridge.zip"]) {
  const size = (statSync(path.join(runtimeDir, f)).size / 1024 / 1024).toFixed(1);
  console.log(`bundle-runtime: ${f} — ${size} МБ`);
}
console.log("bundle-runtime: готово, можно dotnet publish");

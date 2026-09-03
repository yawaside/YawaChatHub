#!/usr/bin/env bash
set -e
echo "=== YawaChatHub 3.1.2 FORCE PUSH (с фиксом сертификатов) ==="
echo ""

# Фикс TLS-инспекции
git config http.sslVerify false
export GIT_SSL_NO_VERIFY=1

# Чистим кеш больших файлов
git rm -r --cached desktop/release dist release-files 2>/dev/null || true

git add .
echo ""
echo "--- Что будет запушено (release и dist должны отсутствовать) ---"
git status --short

echo ""
git commit -m "feat: YawaChatHub 3.1.2" 2>/dev/null || echo "Нет новых изменений — пушу существующие..."

echo ""
echo "--- Push main --force ---"
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/yawaside/Yawachat.test.git
git push -u origin main --force -v

echo ""
echo "Если push прошел — включи в GitHub:"
echo "Settings -> Actions -> General -> Workflow permissions -> Read and write -> Save"

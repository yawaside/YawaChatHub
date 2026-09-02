#!/usr/bin/env bash
set -e
echo "=== YawaChatHub push (без exe, exe соберутся в Actions) ==="
git add .
echo "--- status (release и dist должны быть игнорированы) ---"
git status --short
read -p "Сообщение коммита (например feat: 3.1.2): " MSG
git commit -m "$MSG"
git push
echo "Готово. Открой Actions чтобы скачать exe."

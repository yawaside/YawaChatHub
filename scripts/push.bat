@echo off
REM Правильная заливка YawaChatHub на GitHub (без exe, exe соберутся в Actions)
echo === YawaChatHub push ===
git add .
echo --- status (release и dist должны быть игнорированы) ---
git status --short
echo --- commit ---
set /p MSG="Сообщение коммита (например feat: 3.1.2): "
git commit -m "%MSG%"
echo --- push main ---
git push
echo Готово. Открой Actions чтобы скачать exe.
pause

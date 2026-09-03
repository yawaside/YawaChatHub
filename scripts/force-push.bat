@echo off
echo === YawaChatHub 3.1.2 FORCE PUSH (с фиксом сертификатов) ===
echo.

REM Фикс TLS-инспекции (антивирус/прокси) — та же причина что ломала Twitch/Kick
git config http.sslVerify false
set GIT_SSL_NO_VERIFY=1

REM Чистим кеш больших файлов если случайно попали
git rm -r --cached desktop/release dist release-files 2>nul

git add .
echo.
echo --- Что будет запушено (release и dist должны отсутствовать) ---
git status --short

echo.
git commit -m "feat: YawaChatHub 3.1.2" 2>nul
if %errorlevel% neq 0 (
  echo Нет новых изменений для коммита — пробую запушить существующие...
)

echo.
echo --- Push main --force ---
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/yawaside/Yawachat.test.git
git push -u origin main --force -v

echo.
echo Если push прошел — включи в GitHub:
echo Settings -^> Actions -^> General -^> Workflow permissions -^> Read and write -^> Save
echo Затем открой Actions чтобы скачать exe.
pause

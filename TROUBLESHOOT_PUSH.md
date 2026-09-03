# Не получается запушить — решение

Ты уже видел в приложении:
```
Kick API (Node https): нет (код 0, unable to verify the first certificate)
Twitch IRC: ошибка: unable to verify the first certificate
```
Та же причина ломает `git push` — на компе стоит антивирус / корпоративный прокси с TLS-инспекцией.

## 1. Посмотри точную ошибку

В Git Bash выполни:
```bash
git push -v
```
Скопируй последние 10 строк — по ним сразу понятно что делать.

## 2. Частые ошибки и фиксы

### A) `SSL certificate problem / unable to get local issuer / unable to verify the first certificate`

Это твой случай. Фикс (временно отключаем проверку сертификата для git):

**Git Bash:**
```bash
git config --global http.sslVerify false
export GIT_SSL_NO_VERIFY=1
git push -u origin main --force
# после успешного пуша можно вернуть:
# git config --global http.sslVerify true
```

**Windows CMD:**
```cmd
git config --global http.sslVerify false
set GIT_SSL_NO_VERIFY=1
git push -u origin main --force
```

**PowerShell:**
```powershell
git config --global http.sslVerify false
$env:GIT_SSL_NO_VERIFY=1
git push -u origin main --force
```

### B) `Authentication failed / remote: Support for password authentication was removed`

GitHub больше не принимает пароль. Нужен Personal Access Token (PAT).

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → выбери `repo` → Generate
2. Скопируй токен

Затем:
```bash
git remote set-url origin https://yawaside:ТОКЕН_СЮДА@github.com/yawaside/Yawachat.test.git
git push -u origin main --force
```

### C) `! [rejected] main -> main (non-fast-forward) / fetch first`

В репозитории на GitHub уже есть коммиты, а у тебя локально другие.

Вариант 1 — полностью перезаписать (рекомендуется для 3.1.2):
```bash
git push -u origin main --force
```

Вариант 2 — сохранить историю с GitHub:
```bash
git pull --rebase origin main
git push
```

### D) `File ... is 160 MB; exceeds GitHub's file size limit of 100 MB`

Ты пытаешься запушить `desktop/release/YawaChatHub.exe`. НЕ НУЖНО.

```bash
git rm -r --cached desktop/release dist release-files 2>/dev/null; echo ok
git add .
git commit -m "chore: remove large binaries"
git push
```
Exe соберутся сами в Actions → Releases.

### E) `remote origin already exists`

```bash
git remote remove origin
git remote add origin https://github.com/yawaside/Yawachat.test.git
```

## 3. Чистая заливка с нуля (рекомендуемый сценарий для 3.1.2)

Это полностью пересоздаст репозиторий без мусора и больших файлов:

**Git Bash:**
```bash
cd /путь/к/папке/проекта

rm -rf .git
git init
git config http.sslVerify false
export GIT_SSL_NO_VERIFY=1

git add .
git status
# убедись что НЕТ desktop/release и dist — они должны быть игнорированы

git commit -m "feat: YawaChatHub 3.1.2"

git branch -M main
git remote add origin https://github.com/yawaside/Yawachat.test.git
git push -u origin main --force
```

## 4. После пуша

1. Включи права: GitHub → Settings → Actions → General → Workflow permissions → Read and write → Save
2. Открой Actions — должен запуститься `build · tag · release`
3. Через 5-8 минут в Releases появятся `YawaChatHub.exe` и `YawaChatHub-Setup.exe`

## 5. Если ничего не помогает

Пришли скриншот/текст из Git Bash после `git push -v` — скажу точную команду.

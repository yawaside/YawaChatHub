#!/usr/bin/env bash
# Публичный changelog: только функции, исправления и изменения интерфейса.
# Технические коммиты (ci/build/chore/refactor/docs) в релиз не попадают.
set -euo pipefail

VERSION="${1:-$(tr -d '[:space:]' < VERSION 2>/dev/null || true)}"
if [ -z "$VERSION" ]; then
  echo "Не указана версия" >&2
  exit 1
fi

# Для подготовленной вручную версии берём готовый раздел без изменений.
if [ -f CHANGELOG.md ] && grep -q "^## YawaChatHub v${VERSION}$" CHANGELOG.md; then
  awk -v h="## YawaChatHub v${VERSION}" '
    $0 == h { print; found=1; next }
    found && /^## / { exit }
    found { print }
  ' CHANGELOG.md
  exit 0
fi

PREV_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
echo "## YawaChatHub v${VERSION}"
echo
echo "**Дата:** $(date -u +%Y-%m-%d)"
echo
echo "### Изменения"
echo

RANGE="HEAD"
if [ -n "$PREV_TAG" ]; then RANGE="${PREV_TAG}..HEAD"; fi
ADDED=0
while IFS= read -r subject; do
  # Conventional commits: публикуются только видимые пользователю категории.
  kind="${subject%%:*}"
  case "$kind" in
    feat|fix|ui|perf|feat\(*\)|fix\(*\)|ui\(*\)|perf\(*\))
      text="${subject#*:}"
      text="${text# }"
      echo "- ${text^}"
      ADDED=1
      ;;
  esac
done < <(git log --no-merges --pretty=format:'%s' "$RANGE")

if [ "$ADDED" -eq 0 ]; then
  echo "- Функциональные и интерфейсные улучшения приложения."
fi
echo
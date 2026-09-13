using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace YawaChatHub;

/// <summary>
/// Чтение чата TikTok Live через скрытое окно WebView2.
///
/// ПОЧЕМУ ТАК. Публичный webcast-API (`webcast/im/fetch`) отдаёт чат только
/// «подписанному» запросу: нужны cookies (ttwid, msToken) и подпись X-Bogus,
/// которую генерирует JS самого TikTok. Без них ответ приходит ПУСТЫМ —
/// именно поэтому канал подключался, а сообщения не шли. Просить у
/// пользователя cookie вручную — плохой путь.
///
/// Решение: открываем страницу эфира в невидимом окне WebView2. Браузер сам
/// получает cookies, сам подписывает запросы и сам поднимает WebSocket чата,
/// а мы читаем уже готовые сообщения из DOM и отдаём их в ленту. Пользователь
/// вводит только имя канала.
/// </summary>
public static class TikTokLive
{
    /// <summary>
    /// Открыть скрытое окно и читать чат канала, пока не отменят.
    /// Вызывается из коннектора; всю работу с UI выполняет владелец окна.
    /// </summary>
    public static async Task RunAsync(
        Form owner,
        string channel,
        Action<string, string> onMessage,
        Action<bool, int> onStatus,
        CancellationToken ct)
    {
        LiveReaderWindow? window = null;
        try
        {
            // окно создаётся строго в UI-потоке приложения
            window = owner.Invoke(() => new LiveReaderWindow(channel, onMessage, onStatus));
            await owner.Invoke(() => window!.StartAsync());

            // АДАПТИВНЫЙ ПЕРЕЗАПУСК: блокировка видео (Media) иногда ломает
            // плеер TikTok, и чат тогда вообще не монтируется. Если за 25 секунд
            // ни одного сообщения — перезагружаем страницу уже БЕЗ блокировки:
            // работоспособность чата важнее экономии CPU.
            try { await Task.Delay(25000, ct); }
            catch (OperationCanceledException) { }

            if (!ct.IsCancellationRequested)
            {
                var w = window;
                bool needsReload;
                try
                {
                    needsReload = (bool)owner.Invoke(new Func<bool>(() => w != null && !w.HasChat && w.MessageCount == 0));
                }
                catch { needsReload = false; }

                if (needsReload && w != null)
                {
                    try
                    {
                        var replacement = owner.Invoke(new Func<LiveReaderWindow?>(() =>
                        {
                            try { w.ForceClose(); } catch { }
                            return null; // создаём ниже, отдельным вызовом
                        }));
                        _ = replacement; // старое окно закрыто

                        var fresh = owner.Invoke(new Func<LiveReaderWindow>(
                            () => new LiveReaderWindow(channel, onMessage, onStatus) { BlockMedia = false }));
                        owner.BeginInvoke(new Action(async () =>
                        {
                            try { await fresh.StartAsync(); } catch { }
                        }));
                        window = fresh;

                        File.AppendAllText(
                            Path.Combine(Program.AppDir, "tiktok.log"),
                            $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [{channel}] чат не найден за 25 сек — перезапуск без блокировки видео{Environment.NewLine}");
                    }
                    catch { /* остаёмся на старом окне */ }
                }
            }

            await Task.Delay(Timeout.Infinite, ct);
        }
        catch (OperationCanceledException) { /* обычная остановка коннектора */ }
        finally
        {
            var w = window;
            if (w != null)
            {
                try { owner.BeginInvoke(() => { try { w.ForceClose(); } catch { } }); } catch { }
            }
        }
    }

    /// <summary>
    /// Невидимое окно со страницей эфира. Opacity = 0 — страница живёт и
    /// рендерится (WebSocket чата работает), но пользователю не видна.
    /// </summary>
    private sealed class LiveReaderWindow : Form
    {
        private readonly WebView2 _web = new() { Dock = DockStyle.Fill };
        private readonly string _channel;
        private readonly Action<string, string> _onMessage;
        private readonly Action<bool, int> _onStatus;
        private bool _diagWritten;
        private bool _hasChat;
        private int _msgs;
        /// Блокировать видео/аудио по сети. Экономит CPU, но иногда мешает
        /// монтированию чата — тогда перезапускаемся с false (см. RunAsync).
        public bool BlockMedia = true;

        /// Смонтировался ли контейнер чата (для адаптивного перезапуска).
        public bool HasChat => _hasChat;
        /// Сколько сообщений уже прочитано (0 = чат, вероятно, не работает).
        public int MessageCount => _msgs;

        /// Диагностика: видно, читается ли чат вообще (%LOCALAPPDATA%\YawaChatHub\tiktok.log).
        private static string LogPath => Path.Combine(Program.AppDir, "tiktok.log");
        private void Log(string line)
        {
            try { File.AppendAllText(LogPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {line}\n"); }
            catch { }
        }

        public LiveReaderWindow(string channel, Action<string, string> onMessage, Action<bool, int> onStatus)
        {
            _channel = channel;
            _onMessage = onMessage;
            _onStatus = onStatus;

            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Opacity = 0;
            // окно внутри экрана: Chromium не «замораживает» отрисовку
            var scr = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
            Bounds = new Rectangle(scr.Right - 460, scr.Bottom - 360, 450, 350);
            Controls.Add(_web);
        }

        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                // служебное окно: без панели задач, не активируется, не ловит мышь
                cp.ExStyle |= 0x80 | 0x8000000 | 0x20;
                return cp;
            }
        }

        public async Task StartAsync()
        {
            Show();
            await _web.EnsureCoreWebView2Async(await Program.WebViewEnvAsync());

            var core = _web.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDefaultScriptDialogsEnabled = false;
            try { core.IsMuted = true; } catch { }
            // ВАЖНО: НЕ включаем MemoryUsageTargetLevel.Low для TikTok-ридера.
            // Low-режим разрешает Chromium выгрузить память рендерера на диск —
            // страница «замерзает» и чат перестаёт приходить. Основное окно
            // в трее использует Low, а этот ридер должен оставаться активным.

            // Блокируем тяжёлые видео- и аудиопотоки (Media) TikTok:
            // нам нужен только текст чата, а блокировка видео экономит CPU и RAM.
            // Стили, скрипты и картинки НЕ трогаем — без них React-приложение
            // TikTok не монтирует контейнер чата. Отключается адаптивно (BlockMedia=false),
            // если чат так и не появился.
            if (BlockMedia)
            {
                core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.Media);
                core.WebResourceRequested += (s, e) =>
                {
                    if (e.ResourceContext == CoreWebView2WebResourceContext.Media)
                    {
                        e.Response = core.Environment.CreateWebResourceResponse(null, 204, "No Content", "");
                    }
                };
            }

            core.WebMessageReceived += (_, e) =>
            {
                try
                {
                    using var doc = JsonDocument.Parse(e.WebMessageAsJson);
                    var root = doc.RootElement;
                    var type = root.TryGetProperty("t", out var t) ? t.GetString() : "";

                    if (type == "msg")
                    {
                        var author = root.TryGetProperty("a", out var a) ? a.GetString() ?? "" : "";
                        var text = root.TryGetProperty("m", out var m) ? m.GetString() ?? "" : "";
                        if (text.Length > 0)
                        {
                            _msgs++;
                            if (_msgs == 1) Log($"[msg] {_channel}: первое сообщение получено");
                            _onMessage(author, text);
                        }
                    }
                    else if (type == "state")
                    {
                        var live = root.TryGetProperty("live", out var l) && l.ValueKind == JsonValueKind.True;
                        var viewers = root.TryGetProperty("v", out var v) && v.TryGetInt32(out var vi) ? vi : 0;
                        _hasChat |= root.TryGetProperty("chat", out var ch) && ch.ValueKind == JsonValueKind.True;
                        _onStatus(live, viewers);
                    }
                    else if (type == "diag" && !_diagWritten)
                    {
                        // одна запись на канал: показывает, загрузилась ли страница
                        _diagWritten = true;
                        var title = root.TryGetProperty("title", out var ti) ? ti.GetString() ?? "" : "";
                        var url = root.TryGetProperty("url", out var u) ? u.GetString() ?? "" : "";
                        var items = root.TryGetProperty("items", out var it) && it.TryGetInt32(out var ii) ? ii : 0;
                        Log($"[diag] канал {_channel}: «{title}» ({url}), узлов чата: {items}");
                    }
                }
                catch { /* мусорные сообщения игнорируем */ }
            };

            await core.AddScriptToExecuteOnDocumentCreatedAsync(ReaderScript);
            core.Navigate($"https://www.tiktok.com/@{_channel}/live");
            Log($"[nav] {_channel}: открыта страница эфира");


        }

        public void ForceClose()
        {
            try { _web.Dispose(); } catch { }
            try { Close(); } catch { }
            try { Dispose(); } catch { }
        }

        /// <summary>
        /// Скрипт-читатель. Работает с готовым DOM чата, поэтому не зависит от
        /// внутреннего формата webcast и его подписей. Новые сообщения ловит
        /// MutationObserver, дубликаты отсекаются по ключу «автор+текст».
        /// </summary>
        private const string ReaderScript = """
            (() => {
              if (window.__yawaTikTok) return;
              window.__yawaTikTok = true;

              const send = (o) => { try { chrome.webview.postMessage(o); } catch (e) {} };
              const seen = new Set();

              // TikTok постоянно меняет вёрстку, поэтому не привязываемся к
              // контейнеру чата: периодически сканируем ВЕСЬ документ и берём
              // узлы, похожие на сообщения чата. Таким образом чат читается
              // при любой структуре страницы.
              const CHAT_SELECTORS = [
                '[data-e2e="chat-message"]',
                '[data-e2e="comment-item"]',
                '[class*="DivChatMessageContainer"]',
                '[class*="DivChatItemContainer"]',
                '[class*="DivCommentItemContainer"]',
                '[class*="ChatMessage"]',
                '[class*="CommentItem"]',
                'div[data-tid*="chat"] > div',
              ];

              const MESSAGE_NODES =
                '[data-e2e="chat-message"], [data-e2e="comment-item"], [data-e2e*="chat-message"], ' +
                '[class*="ChatMessageContainer"], [class*="ChatItemContainer"], [class*="CommentItemContainer"], ' +
                '[class*="ChatMessage"], [class*="CommentItem"], [class*="chat-message"], [class*="comment-item"], ' +
                '[class*="chat_item"], [class*="chat-item"]';

              const VIEWER_SELECTORS = [
                '[data-e2e="live-people-count"]',
                '[data-e2e="live-viewer-count"]',
                '[class*="PeopleCount"]',
                '[class*="ViewerCount"]',
              ];

              const parseCount = (raw) => {
                const s = (raw || '').trim().toLowerCase().replace(/[^\d.,kкmм]/gi, '');
                const m = s.match(/([\d.,]+)\s*([kкmм])?/);
                if (!m) return 0;
                const num = parseFloat(m[1].replace(',', '.'));
                if (isNaN(num)) return 0;
                const suf = m[2];
                return suf === 'k' || suf === 'к' ? Math.round(num * 1000)
                     : suf === 'm' || suf === 'м' ? Math.round(num * 1000000)
                     : Math.round(num);
              };

              const extract = (node) => {
                // автор: элемент с ником или первый span
                const nickEl =
                  node.querySelector('[data-e2e="message-owner-name"]') ||
                  node.querySelector('[class*="Nickname"], [class*="nickname"], [class*="UserName"], [class*="user-name"]') ||
                  node.querySelector('span');
                const nick = (nickEl?.textContent || '').trim().replace(/[:：]\s*$/, '');
                // текст без ника и без служебных хвостов
                let lines = (node.innerText || node.textContent || '')
                  .split('\n')
                  .map((l) => l.trim())
                  .filter((l) => l.length > 0);
                if (nick && lines.length && lines[0].startsWith(nick.slice(0, 18))) lines.shift();
                return { nick, text: lines.join(' ').trim() };
              };

              let pushed = 0;
              const push = (node) => {
                if (!node || node.nodeType !== 1) return;
                const { nick, text } = extract(node);
                if (!text || text.length > 500) return;
                const key = nick + '|#|' + text;
                if (seen.has(key)) return;
                seen.add(key);
                if (seen.size > 600) seen.clear();
                send({ t: 'msg', a: nick, m: text });
                pushed++;
              };

              let chatRoot = null;

              const findChatRoot = () => {
                const explicit = document.querySelector(
                  '[data-e2e="live-chat-room"], [data-e2e="chat-room"], ' +
                  '[class*="DivChatRoom"], [class*="ChatRoom"]'
                );
                if (explicit) return explicit;
                const first = document.querySelector(MESSAGE_NODES);
                return first ? first.parentElement : null;
              };

              // Помечаем историю ТОЛЬКО внутри контейнера чата, не сканируя
              // весь огромный DOM TikTok.
              const markAllHistory = () => {
                try {
                  const root = chatRoot || findChatRoot();
                  if (!root) return;
                  root.querySelectorAll(MESSAGE_NODES).forEach((n) => {
                    const { nick, text } = extract(n);
                    if (text) seen.add(nick + '|#|' + text);
                  });
                } catch (e) {}
              };

              let initialJsonViewers = null;
              const getJsonViewers = () => {
                if (initialJsonViewers != null) return initialJsonViewers;
                initialJsonViewers = 0;
                try {
                  const script = document.getElementById('SIGI_STATE') ||
                                 document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
                  if (script && script.textContent) {
                    const data = JSON.parse(script.textContent);
                    const stack = [data];
                    let inspected = 0;
                    while (stack.length && inspected++ < 3000) {
                      const o = stack.pop();
                      if (!o || typeof o !== 'object') continue;
                      const v = o.userCount ?? o.viewerCount;
                      if (typeof v === 'number') { initialJsonViewers = v; break; }
                      for (const child of Object.values(o))
                        if (child && typeof child === 'object') stack.push(child);
                    }
                  }
                } catch (e) {}
                return initialJsonViewers;
              };

              const viewerNode = () => {
                for (const sel of VIEWER_SELECTORS) {
                  const el = document.querySelector(sel);
                  if (el && el.textContent) return el;
                }
                return null;
              };

              const state = () => {
                const el = viewerNode();
                // DOM меняется в реальном времени; большой JSON — лишь fallback первого кадра.
                let viewers = el ? parseCount(el.textContent || '') : getJsonViewers();
                const hasChat = document.querySelector(MESSAGE_NODES) != null;
                const hasVideo = !!document.querySelector('video');
                const live = hasChat || hasVideo || !!el || viewers > 0;
                send({ t: 'state', live, v: viewers, chat: hasChat });
              };

              let reported = false;
              let liveReady = false;
              let settleTimer = 0;
              let observer = null;

              const onMutations = (records) => {
                const added = [];
                for (const r of records) {
                  r.addedNodes.forEach((n) => {
                    try {
                      if (n.nodeType !== 1) return;
                      if (n.matches && n.matches(MESSAGE_NODES)) added.push(n);
                      if (n.querySelectorAll) added.push(...n.querySelectorAll(MESSAGE_NODES));
                    } catch (e) {}
                  });
                }
                if (!added.length) return;

                if (!liveReady) {
                  clearTimeout(settleTimer);
                  settleTimer = setTimeout(() => { markAllHistory(); liveReady = true; }, 1500);
                  return;
                }
                added.forEach(push);
              };

              // Находим контейнер чата и наблюдаем ТОЛЬКО его. Наблюдение
              // всего body реагировало на тысячи изменений интерфейса TikTok.
              const attachChat = () => {
                const root = findChatRoot();
                if (!root || root === chatRoot) return;
                try { observer?.disconnect(); } catch (e) {}
                chatRoot = root;
                liveReady = false;
                markAllHistory();
                observer = new MutationObserver(onMutations);
                try { observer.observe(chatRoot, { childList: true, subtree: true }); } catch (e) {}
                clearTimeout(settleTimer);
                settleTimer = setTimeout(() => { markAllHistory(); liveReady = true; }, 1500);
              };

              // CSS скрывает визуальные слои без постоянного удаления/recreate
              // React-узлов страницы; сетевые media-запросы уже блокирует хост.
              const suppressVisuals = () => {
                if (document.getElementById('yawa-tiktok-lite')) return;
                const style = document.createElement('style');
                style.id = 'yawa-tiktok-lite';
                style.textContent = 'video,audio,canvas{display:none!important;visibility:hidden!important}';
                (document.head || document.documentElement)?.appendChild(style);
                document.querySelectorAll('video,audio').forEach((v) => { try { v.pause(); } catch(e) {} });
              };

              const boot = () => { suppressVisuals(); attachChat(); };
              document.addEventListener('DOMContentLoaded', boot);
              boot();

              // Контейнер чата может появиться поздно — проверяем редко (5 сек).
              // liveReady выставляет только attachChat после снимка истории и
              // 1.5 сек стабильности. Фиксированный таймер больше не включает
              // приём вслепую: именно он превращал позднюю историю в «новые» сообщения.
              setInterval(attachChat, 5000);
              setTimeout(() => {
                attachChat();
                if (!reported) {
                  reported = true;
                  send({
                    t: 'diag',
                    title: document.title || '',
                    url: location.href,
                    items: chatRoot ? chatRoot.querySelectorAll(MESSAGE_NODES).length : 0,
                  });
                }
              }, 6000);

              // Дешёвая страховка: раз в 2 секунды смотрим ТОЛЬКО контейнер чата
              // (маленькое поддерево, не весь документ) и отдаём то, чего ещё не
              // видели. Покрывает случай, когда MutationObserver пропустил узлы.
              setInterval(() => {
                try {
                  if (!chatRoot || !liveReady) return;
                  chatRoot.querySelectorAll(MESSAGE_NODES).forEach(push);
                } catch (e) {}
              }, 2000);

              setInterval(state, 5000);
            })();
            """;
    }
}

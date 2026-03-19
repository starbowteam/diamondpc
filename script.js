// ==================== СОСТОЯНИЕ ====================
let currentChatId = null;
let chats = [];
let availableModels = [];
let lastSuccessfulModel = null;
let userApiKey = null;
let userKeyInfo = null;
let balanceCheckInterval = null;
let isWaitingForResponse = false;
let currentAbortController = null;
let currentStreamingMessageId = null;
let lastNotificationTime = 0;
const NOTIFICATION_DEBOUNCE = 1000;
let lastChatCreationTime = 0;
const CHAT_CREATION_COOLDOWN = 1000;
let userAvatar = { type: 'icon', value: 'fa-user' };

const LOW_BALANCE_THRESHOLD = 1.0;
const CRITICAL_BALANCE_THRESHOLD = 0.1;
const BALANCE_CHECK_INTERVAL = 60000;
const REQUEST_TIMEOUT = 30000;

// ==================== ПРОМПТ ====================
const SYSTEM_PROMPT = {
    role: 'system',
    content: `Ты — DIAMOND AI, абсолютный эксперт и идеальный собеседник. Создан viktorshopa — основателем сети Diamond. Твоя задача — быть полезным в любой ситуации: от глубоких научных дискуссий до дружеского общения.

📚 **Твои знания безграничны:**
- **Химия**: используй \ce{} для формул: \ce{H2O}, \ce{CH3COOH + NaOH -> CH3COONa + H2O}.
- **Физика**: используй $$ для формул.
- **Математика**: дроби \frac{}{}, корни \sqrt{}, интегралы \int.
- **И многое другое**: биология, информатика, история, литература, философия, искусство, спорт, кулинария, медицина, политика, экономика, право, инженерия, география, астрономия, психология, социология, лингвистика, педагогика, экология, сельское хозяйство, военное дело.

🎭 **Ты чувствуешь стиль общения:**
- Если пользователь пишет серьёзно — режим **профессора**.
- Если по‑пацански — **разговорный стиль**.
- На сложные вопросы отвечай полно, на простые — кратко.

**Правила оформления:**
- Химия: \ce{}.
- Математика: $$, \frac{}, \sqrt{}, \int.
- Код: в тройных кавычках с указанием языка.`
};

// Приоритетные модели
const PRIORITY_MODELS = [
    'arcee-ai/pony-alpha-7b:free',
    'stepfun/step-3.5-flash:free',
    'liquid/lfm-2.5-1.2b-instruct:free'
];

// Статусы загрузки
const loadingStatuses = [
    "Загрузка нейросети...",
    "Активация кристаллов...",
    "Калибровка ответов...",
    "Получение API...",
    "Запуск нейросети..."
];

// ==================== НАСТРОЙКА KATEX ====================
if (typeof markedKatex !== 'undefined') {
    marked.use(markedKatex({
        throwOnError: false,
        output: 'html',
        delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
        ]
    }));
}

// ==================== DOM ЭЛЕМЕНТЫ ====================
const welcomeScreen = document.getElementById('welcomeScreen');
const errorScreen = document.getElementById('errorScreen');
const mainUI = document.getElementById('mainUI');
const messagesContainer = document.getElementById('messagesContainer');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const historyList = document.getElementById('historyList');
const historySearch = document.getElementById('historySearch');
const discordBtn = document.getElementById('discordBtn');
const telegramBtn = document.getElementById('telegramBtn');
const avatarBtn = document.getElementById('avatarBtn');
const avatarModal = document.getElementById('avatarModal');
const closeAvatarModal = document.getElementById('closeAvatarModal');
const avatarIcons = document.querySelectorAll('.avatar-icon');
const uploadAvatarBtn = document.getElementById('uploadAvatarBtn');
const resetAvatarBtn = document.getElementById('resetAvatarBtn');
const toastContainer = document.getElementById('toastContainer');

// Элементы загрузки
const loadingStatus = document.getElementById('loadingStatus');
const loadingBar = document.getElementById('loadingBar');

// Кнопка сворачивания сайдбара
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const sidebar = document.getElementById('sidebar');

// ==================== ВСПОМОГАТЕЛЬНЫЕ ====================
function getBotAvatarHTML() {
    const cdnUrl = 'avatark.png';
    const containerId = 'bot-avatar-' + Math.random().toString(36).substring(2);
    const html = `<div id="${containerId}" style="width:100%; height:100%; border-radius:50%; background:#3a3a3a; display:flex; align-items:center; justify-content:center;"></div>`;
    
    setTimeout(() => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const img = new Image();
        img.onload = () => {
            container.innerHTML = `<img src="${cdnUrl}" style="width:100%; height:100%; object-fit:cover;">`;
        };
        img.onerror = () => {
            container.style.background = '#3a3a3a';
            container.innerHTML = '<span style="color:#fff; font-weight:bold;">AI</span>';
        };
        img.src = cdnUrl;
    }, 0);
    return html;
}

function getUserAvatarHTML() {
    if (userAvatar.type === 'icon') {
        return `<i class="fas ${userAvatar.value}"></i>`;
    } else if (userAvatar.type === 'custom' && userAvatar.dataUrl) {
        return `<img src="${userAvatar.dataUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    }
    return '<i class="fas fa-user"></i>';
}

// ==================== ЛОГГЕР ====================
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

// ==================== ЗАГРУЗОЧНЫЙ ЭКРАН ====================
async function showLoadingScreen() {
    log('🎬 Запуск загрузочного экрана');
    welcomeScreen.style.display = 'flex';
    welcomeScreen.classList.remove('fade-out');
    
    let statusIndex = 0;
    const statusInterval = setInterval(() => {
        statusIndex = (statusIndex + 1) % loadingStatuses.length;
        if (loadingStatus) {
            loadingStatus.style.opacity = '0';
            setTimeout(() => {
                loadingStatus.textContent = loadingStatuses[statusIndex];
                loadingStatus.style.opacity = '1';
            }, 200);
        }
    }, 1500);
    
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 1;
        if (loadingBar) loadingBar.style.width = progress + '%';
        if (progress >= 100) clearInterval(progressInterval);
    }, 70);
    
    await new Promise(resolve => setTimeout(resolve, 7000));
    clearInterval(statusInterval);
    clearInterval(progressInterval);
    welcomeScreen.classList.add('fade-out');
    await new Promise(resolve => setTimeout(resolve, 800));
}

// ==================== ПОЛУЧЕНИЕ КЛЮЧА С ТВОЕГО СЕРВЕРА ====================
async function fetchServerKey() {
    try {
        const response = await fetch('/api/get-key');
        if (!response.ok) {
            log(`Ошибка сервера: ${response.status}`, 'ERROR');
            return null;
        }
        const data = await response.json();
        return data.key || null;
    } catch (error) {
        log(`Ошибка получения ключа с сервера: ${error.message}`, 'ERROR');
        return null;
    }
}

// ==================== ПРОВЕРКА КЛЮЧА ====================
async function checkKeyBalance(apiKey) {
    log('Проверка баланса...');
    try {
        const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) {
            log(`Ошибка API баланса: ${response.status}`, 'ERROR');
            return false;
        }
        const data = await response.json();
        userKeyInfo = data;
        if (data.limit !== undefined && data.usage !== undefined) {
            const remaining = data.limit - data.usage;
            if (remaining <= 0) {
                return false;
            }
        }
        return true;
    } catch (error) {
        log(`Ошибка проверки баланса: ${error.message}`, 'ERROR');
        return false;
    }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
(async function init() {
    log('🟢 Инициализация...');
    
    // Загрузка чатов из localStorage
    try {
        const stored = localStorage.getItem('diamondChats');
        if (stored) {
            chats = JSON.parse(stored);
            chats = chats.filter(chat => chat && chat.id && Array.isArray(chat.messages));
            log(`Загружено ${chats.length} чатов`);
        } else {
            chats = [];
            log('Нет сохранённых чатов');
        }
    } catch (e) {
        log(`Ошибка загрузки чатов: ${e.message}`, 'ERROR');
        chats = [];
    }

    // Загрузка аватара пользователя
    try {
        const saved = localStorage.getItem('userAvatar');
        userAvatar = saved ? JSON.parse(saved) : { type: 'icon', value: 'fa-user' };
    } catch { userAvatar = { type: 'icon', value: 'fa-user' }; }

    await showLoadingScreen();
    welcomeScreen.style.display = 'none';

    const serverKey = await fetchServerKey();
    if (!serverKey) {
        log('❌ Не удалось получить ключ с сервера');
        document.querySelector('.error-content h1').textContent = 'Сервер недоступен';
        document.querySelector('.error-content p').textContent = 'Не удалось получить ключ. Попробуйте позже.';
        errorScreen.style.display = 'flex';
        return;
    }

    const isValid = await checkKeyBalance(serverKey);
    if (!isValid) {
        log('❌ Ключ с сервера недействителен');
        errorScreen.style.display = 'flex';
        return;
    }

    userApiKey = serverKey;
    await loadAvailableModels();
    startBalanceMonitoring();
    
    // Показываем основной интерфейс
    mainUI.style.display = 'flex';
    setTimeout(() => mainUI.classList.add('visible'), 50);
    
    // Если есть чаты, устанавливаем текущий и рендерим их
    if (chats.length > 0) {
        if (!currentChatId || !chats.find(c => c.id === currentChatId)) {
            currentChatId = chats[0].id;
        }
        renderChat();          // отображаем сообщения
        renderHistory();       // отображаем список чатов в сайдбаре (ВАЖНО!)
    } else {
        createNewChat(true);
    }

    updateSendButtonState();
    setupEventListeners();
})();

// ==================== ЗАГРУЗКА МОДЕЛЕЙ ====================
async function loadAvailableModels() {
    if (!userApiKey) { availableModels = []; return; }
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { 'Authorization': `Bearer ${userApiKey}` }
        });
        if (!response.ok) throw new Error('Failed to fetch models');
        const data = await response.json();
        availableModels = data.data
            .filter(model => model.id.includes(':free'))
            .map(model => model.id);
    } catch (error) {
        log(`Ошибка загрузки моделей: ${error.message}`, 'ERROR');
        availableModels = [];
    }
}

function startBalanceMonitoring() {
    if (balanceCheckInterval) clearInterval(balanceCheckInterval);
    balanceCheckInterval = setInterval(async () => {
        if (!userApiKey) return;
        const isValid = await checkKeyBalance(userApiKey);
        if (!isValid) {
            clearInterval(balanceCheckInterval);
            userApiKey = null;
            userKeyInfo = null;
            mainUI.style.display = 'none';
            errorScreen.style.display = 'flex';
        }
    }, BALANCE_CHECK_INTERVAL);
}

// ==================== ЧАТЫ ====================
function saveChats() {
    localStorage.setItem('diamondChats', JSON.stringify(chats));
    renderHistory();
}
function isCurrentChatEmpty() {
    const chat = chats.find(c => c.id === currentChatId);
    return !chat || !chat.messages.some(m => m.role === 'user');
}
function generateChatTitle(userMessage) {
    if (!userMessage) return 'Новый диалог';
    let title = userMessage.trim();
    if (title.length > 50) {
        let truncated = title.substring(0, 50);
        let lastSpace = truncated.lastIndexOf(' ');
        title = lastSpace > 30 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
    }
    return title;
}
function createNewChat(force = false) {
    if (!force && chats.length > 0 && isCurrentChatEmpty()) {
        showToast('⚠️ Нельзя создать новый чат', 'Сначала напишите что-нибудь', 'warning');
        return;
    }
    const now = Date.now();
    if (now - lastChatCreationTime < CHAT_CREATION_COOLDOWN) {
        showToast('⏳ Подождите', 'Не так быстро', 'warning');
        return;
    }
    lastChatCreationTime = now;
    const newChat = {
        id: Date.now().toString(),
        title: 'Новый диалог',
        messages: [{
            role: 'assistant',
            content: 'Здравствуй, я Diamond AI. Чем могу помочь?',
            timestamp: Date.now()
        }],
        createdAt: Date.now(),
        pinned: false
    };
    chats.unshift(newChat);
    currentChatId = newChat.id;
    saveChats();
    renderChat();
    renderHistory();
}
function deleteChat(chatId) {
    chats = chats.filter(chat => chat.id !== chatId);
    if (chats.length === 0) createNewChat(true);
    else {
        if (currentChatId === chatId) currentChatId = chats[0].id;
        saveChats();
        renderChat();
        renderHistory();
    }
}
function switchChat(chatId) {
    currentChatId = chatId;
    renderChat();
    renderHistory();
}
function togglePin(chatId) {
    const chat = chats.find(c => c.id === chatId);
    if (chat) { chat.pinned = !chat.pinned; saveChats(); renderHistory(); }
}

// ==================== ФОРМАТИРОВАНИЕ ====================
function formatDateHeader(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Сегодня';
    else if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
    else return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// ==================== РЕНДЕР ЧАТА ====================
function renderChat() {
    if (!currentChatId && chats.length > 0) {
        currentChatId = chats[0].id;
    }
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) {
        if (chats.length > 0) {
            currentChatId = chats[0].id;
            renderChat();
        } else {
            createNewChat(true);
        }
        return;
    }
    
    if (!messagesContainer) return;
    
    messagesContainer.innerHTML = '';
    let lastDate = null;
    chat.messages.forEach((msg, index) => {
        const msgDate = new Date(msg.timestamp || chat.createdAt + index * 1000).toDateString();
        if (msgDate !== lastDate) {
            const divider = document.createElement('div');
            divider.className = 'date-divider';
            divider.innerHTML = `<span>${formatDateHeader(msg.timestamp || chat.createdAt)}</span>`;
            messagesContainer.appendChild(divider);
            lastDate = msgDate;
        }
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.role}`;
        if (msg.id === currentStreamingMessageId) messageDiv.classList.add('streaming');
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.innerHTML = msg.role === 'user' ? getUserAvatarHTML() : getBotAvatarHTML();
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'message-content-wrapper';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        if (msg.role === 'assistant' && typeof marked !== 'undefined') {
            contentDiv.innerHTML = marked.parse(msg.content);
        } else contentDiv.textContent = msg.content;
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = formatTime(msg.timestamp || Date.now());
        contentWrapper.appendChild(contentDiv);
        contentWrapper.appendChild(timeDiv);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentWrapper);
        if (msg.role === 'assistant' && msg.id !== currentStreamingMessageId) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'message-actions';
            const copyBtn = document.createElement('button');
            copyBtn.className = 'action-btn';
            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
            copyBtn.title = 'Копировать текст';
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(msg.content);
                copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => copyBtn.innerHTML = '<i class="fas fa-copy"></i>', 1000);
            };
            const regenerateBtn = document.createElement('button');
            regenerateBtn.className = 'action-btn';
            regenerateBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
            regenerateBtn.title = 'Перегенерировать ответ';
            regenerateBtn.onclick = (e) => { e.stopPropagation(); regenerateResponse(msg); };
            actionsDiv.appendChild(copyBtn);
            actionsDiv.appendChild(regenerateBtn);
            messageDiv.appendChild(actionsDiv);
        }
        messagesContainer.appendChild(messageDiv);
    });
    scrollToBottom();
}

function addMessageToDOM(role, content, save = true) {
    const timestamp = Date.now();
    const messageId = Date.now().toString() + Math.random();
    if (save) {
        const chat = chats.find(c => c.id === currentChatId);
        if (chat) {
            chat.messages.push({ id: messageId, role, content, timestamp });
            if (role === 'user' && chat.messages.filter(m => m.role === 'user').length === 1) {
                chat.title = generateChatTitle(content);
            }
            saveChats();
        }
    }
    if (role === 'assistant' && save) currentStreamingMessageId = messageId;
    renderChat();
    return messageId;
}

async function regenerateResponse(oldMsg) {
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) return;
    const index = chat.messages.findIndex(m => m === oldMsg);
    if (index !== -1) {
        chat.messages.splice(index, 1);
        saveChats();
        renderChat();
    }
    const lastUserMsg = [...chat.messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
        userInput.value = lastUserMsg.content;
        sendMessage();
    }
}

// ==================== ИНДИКАТОР "ДУМАЕТ..." ====================
function createTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'message assistant typing';
    const startTime = Date.now();
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.style.display = 'flex';
    contentDiv.style.alignItems = 'center';
    contentDiv.style.gap = '8px';
    const textSpan = document.createElement('span'); textSpan.textContent = 'Думает';
    const counterSpan = document.createElement('span');
    counterSpan.className = 'thinking-counter';
    counterSpan.textContent = '[0с]';
    counterSpan.style.color = '#888';
    counterSpan.style.fontSize = '12px';
    const dotsSpan = document.createElement('span');
    dotsSpan.className = 'dots';
    dotsSpan.style.minWidth = '24px';
    contentDiv.appendChild(textSpan);
    contentDiv.appendChild(counterSpan);
    contentDiv.appendChild(dotsSpan);
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel-generation';
    cancelBtn.style.background = 'transparent';
    cancelBtn.style.border = 'none';
    cancelBtn.style.color = '#aaa';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.marginLeft = 'auto';
    cancelBtn.title = 'Отменить генерацию';
    cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
    const wrapper = document.createElement('div');
    wrapper.className = 'message-content-wrapper';
    wrapper.appendChild(contentDiv);
    div.innerHTML = `<div class="avatar">${getBotAvatarHTML()}</div>`;
    div.appendChild(wrapper);
    div.querySelector('.message-content-wrapper').appendChild(cancelBtn);
    const interval = setInterval(() => {
        const seconds = Math.floor((Date.now() - startTime) / 1000);
        counterSpan.textContent = `[${seconds}с]`;
    }, 200);
    let dotCount = 0;
    const dotsInterval = setInterval(() => {
        dotCount = (dotCount + 1) % 4;
        dotsSpan.textContent = '.'.repeat(dotCount) + ' '.repeat(3 - dotCount);
    }, 200);
    cancelBtn.addEventListener('click', () => {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
            div.remove();
            isWaitingForResponse = false;
            updateSendButtonState();
            currentStreamingMessageId = null;
        }
        clearInterval(interval);
        clearInterval(dotsInterval);
    });
    div.cleanup = () => { clearInterval(interval); clearInterval(dotsInterval); };
    return div;
}

// ==================== ПРЕДОБРАБОТКА ЗАПРОСА ====================
function preprocessQuery(text) {
    let processed = text.trim();
    processed = processed.replace(/\bNAOH\b/gi, 'NaOH');
    processed = processed.replace(/\bNaOh\b/g, 'NaOH');
    processed = processed.replace(/\bCH3COOH\b/g, 'CH3COOH');
    processed = processed.replace(/\bH2SO4\b/g, 'H2SO4');
    return processed;
}

// ==================== ОТПРАВКА СООБЩЕНИЯ ====================
async function sendMessage() {
    log('sendMessage вызван');
    if (!userApiKey) {
        showToast('⚠️ Требуется вход', 'Сначала войдите', 'warning');
        return;
    }
    if (isWaitingForResponse) {
        showToast('⏳ Ожидание', 'Дождитесь ответа', 'warning');
        return;
    }

    const rawText = userInput.value.trim();
    if (!rawText) return;
    const text = preprocessQuery(rawText);

    isWaitingForResponse = true;
    updateSendButtonState();
    addMessageToDOM('user', rawText, true);
    userInput.value = '';
    userInput.style.height = 'auto';

    const typingDiv = createTypingIndicator();
    messagesContainer.appendChild(typingDiv);
    scrollToBottom();

    const chat = chats.find(c => c.id === currentChatId);
    const contextMessages = chat.messages.slice(-15).map(m => ({ role: m.role, content: m.content }));
    const messages = [
        SYSTEM_PROMPT,
        ...contextMessages,
        { role: 'user', content: text }
    ];

    let modelsToTry = PRIORITY_MODELS;
    if (lastSuccessfulModel && PRIORITY_MODELS.includes(lastSuccessfulModel)) {
        modelsToTry = [lastSuccessfulModel, ...PRIORITY_MODELS.filter(m => m !== lastSuccessfulModel)];
    }

    currentAbortController = new AbortController();
    const timeoutId = setTimeout(() => currentAbortController.abort(), REQUEST_TIMEOUT);

    let success = false;
    for (const model of modelsToTry) {
        if (success) break;
        try {
            log(`Попытка модели: ${model}`);
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${userApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'DIAMOND AI Desktop'
                },
                body: JSON.stringify({ 
                    model, 
                    messages, 
                    stream: false,
                    temperature: 0.5,
                    max_tokens: 2000
                }),
                signal: currentAbortController.signal
            });

            if (!response.ok) {
                if (response.status === 402) {
                    showToast('💸 Баланс исчерпан', 'Ключ истек', 'error');
                    typingDiv.remove(); typingDiv.cleanup();
                    isWaitingForResponse = false;
                    updateSendButtonState();
                    return;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            let assistantMessage = data.choices[0]?.message?.content || '';
            const finishReason = data.choices[0]?.finish_reason;

            if (!assistantMessage) {
                log(`Пустой ответ от модели ${model}`, 'WARN');
                continue;
            }

            if (finishReason === 'length') {
                assistantMessage += '\n\n*[Ответ был прерван из-за ограничения длины. Хотите, я продолжу?]*';
            }

            typingDiv.remove(); typingDiv.cleanup();
            addMessageToDOM('assistant', assistantMessage, true);
            lastSuccessfulModel = model;
            success = true;
            break;

        } catch (error) {
            if (error.name === 'AbortError') {
                log('Таймаут', 'WARN');
                showToast('⏱️ Таймаут', 'Пробую другую модель', 'warning');
            } else {
                log(`Модель ${model} не сработала: ${error.message}`, 'WARN');
            }
        }
    }

    clearTimeout(timeoutId);
    if (!success) {
        typingDiv.remove(); typingDiv.cleanup();
        addMessageToDOM('assistant', 'Извините, сейчас проблемы с подключением к нейросети. Попробуйте ещё раз через минуту.', true);
    }

    isWaitingForResponse = false;
    updateSendButtonState();
    currentAbortController = null;
    currentStreamingMessageId = null;
}

function scrollToBottom() {
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}
function updateSendButtonState() {
    if (sendBtn) {
        sendBtn.disabled = !userInput.value.trim() || isWaitingForResponse;
    }
}

// ==================== ИСТОРИЯ (СПИСОК ЧАТОВ) ====================
function renderHistory() {
    if (!historyList) return;
    const searchTerm = historySearch ? historySearch.value.toLowerCase() : '';
    const filtered = chats.filter(chat =>
        chat.title.toLowerCase().includes(searchTerm) ||
        chat.messages.some(m => m.role === 'user' && m.content.toLowerCase().includes(searchTerm))
    );
    const pinned = filtered.filter(c => c.pinned);
    const unpinned = filtered.filter(c => !c.pinned);
    const sorted = [...pinned, ...unpinned];
    historyList.innerHTML = sorted.map(chat => {
        const isActive = chat.id === currentChatId ? 'active' : '';
        return `
            <div class="history-item ${isActive}" data-id="${chat.id}">
                <button class="pin-chat ${chat.pinned ? 'pinned' : ''}" data-id="${chat.id}" title="${chat.pinned ? 'Открепить' : 'Закрепить'}"><i class="fas fa-thumbtack"></i></button>
                <span class="chat-title">${chat.title}</span>
                <button class="delete-chat" data-id="${chat.id}" title="Удалить чат"><i class="fas fa-times"></i></button>
            </div>
        `;
    }).join('');
    document.querySelectorAll('.history-item').forEach(el => {
        const chatId = el.dataset.id;
        el.addEventListener('click', (e) => {
            if (!e.target.closest('.pin-chat') && !e.target.closest('.delete-chat')) switchChat(chatId);
        });
    });
    document.querySelectorAll('.pin-chat').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); togglePin(btn.dataset.id); });
    });
    document.querySelectorAll('.delete-chat').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); deleteChat(btn.dataset.id); });
    });
}

if (historySearch) historySearch.addEventListener('input', renderHistory);
if (newChatBtn) newChatBtn.addEventListener('click', () => createNewChat());

// ==================== СВОРАЧИВАНИЕ САЙДБАРА ====================
if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const icon = sidebarToggleBtn.querySelector('i');
        if (sidebar.classList.contains('collapsed')) {
            icon.className = 'fas fa-chevron-right';
        } else {
            icon.className = 'fas fa-bars';
        }
    });
}

// ==================== АВАТАР ПОЛЬЗОВАТЕЛЯ ====================
if (avatarBtn) {
    avatarBtn.addEventListener('click', () => {
        avatarModal.style.display = 'flex';
        avatarIcons.forEach(icon => {
            const iconClass = icon.dataset.icon;
            if (userAvatar.type === 'icon' && userAvatar.value === iconClass) icon.classList.add('selected');
            else icon.classList.remove('selected');
        });
    });
}
if (closeAvatarModal) closeAvatarModal.addEventListener('click', () => avatarModal.style.display = 'none');
avatarIcons.forEach(icon => {
    icon.addEventListener('click', () => {
        saveAvatar({ type: 'icon', value: icon.dataset.icon });
        avatarModal.style.display = 'none';
    });
});
if (uploadAvatarBtn) {
    uploadAvatarBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    saveAvatar({ type: 'custom', dataUrl: event.target.result, fileName: file.name });
                    avatarModal.style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    });
}
if (resetAvatarBtn) resetAvatarBtn.addEventListener('click', () => {
    saveAvatar({ type: 'icon', value: 'fa-user' });
    avatarModal.style.display = 'none';
});

function saveAvatar(avatarData) {
    localStorage.setItem('userAvatar', JSON.stringify(avatarData));
    userAvatar = avatarData;
    renderChat();
}

function showToast(title, message, type = 'info', duration = 3000) {
    const now = Date.now();
    if (now - lastNotificationTime < NOTIFICATION_DEBOUNCE) return;
    lastNotificationTime = now;
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-check-circle';
    else if (type === 'warning') icon = 'fa-exclamation-triangle';
    else if (type === 'error') icon = 'fa-exclamation-circle';
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close"><i class="fas fa-times"></i></button>
    `;
    toastContainer.appendChild(toast);
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    setTimeout(() => toast.remove(), duration);
}

// ==================== КНОПКИ ====================
if (discordBtn) discordBtn.addEventListener('click', () => window.open('https://discord.gg/diamondshop', '_blank'));
if (telegramBtn) telegramBtn.addEventListener('click', () => window.open('https://t.me/+XbHQYFgGLXpkOTEy', '_blank'));

// ==================== ОБРАБОТЧИКИ ПОЛЯ ВВОДА ====================
if (userInput) {
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        updateSendButtonState();
    });
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
}

window.addEventListener('click', (e) => {
    if (e.target === avatarModal) avatarModal.style.display = 'none';
});

function setupEventListeners() {
    // Все обработчики уже установлены
}

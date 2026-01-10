// State
let socket;
let firstMsg = true;
let saveQueue = Promise.resolve();
let saveScheduled = false;

wisk.sync.eventLog = [];

// Event System - Core
wisk.sync.newChange = function(event) {
    if (!event || !event.path || !event.value || event.value.data === undefined) {
        console.error('Invalid event:', event);
        return;
    }

    event.value.timestamp ??= Date.now();
    event.value.agent ??= wisk.sync.agent;

    wisk.sync.eventLog.push(event);
};

function applyEvent(document, event) {
    const pathParts = event.path.split('.');
    const actualValue = event.value.data;

    // Case 0: Full document restore (snapshot)
    if (event.action === 'restore') {
        document.data = actualValue;
        document.lastUpdated = event.value.timestamp;
        return;
    }

    // Case 1: Element reordering
    if (event.path === 'data.elementOrder') {
        if (!document.data) document.data = {};
        document.data.elementOrder = actualValue;

        if (Array.isArray(document.data.elements)) {
            const elementsById = new Map(document.data.elements.map(e => [e.id, e]));
            document.data.elements = actualValue
                .map(id => elementsById.get(id))
                .filter(Boolean);
        }
        document.lastUpdated = event.value.timestamp;
        return;
    }

    // Case 2: New element creation
    if (event.path === 'data.elements') {
        if (!document.data) document.data = {};
        if (!document.data.elements) document.data.elements = [];
        document.data.elements.push(actualValue);
        document.lastUpdated = event.value.timestamp;
        return;
    }

    // Case 3: Generic path traversal
    let current = document;

    for (let i = 0; i < pathParts.length - 1; i++) {
        const key = pathParts[i];

        // 'elements' array uses ID lookup, not index
        if (key === 'elements' && Array.isArray(current.elements)) {
            const elementId = pathParts[++i];
            const element = current.elements.find(e => e.id === elementId);
            if (!element) {
                console.warn(`Element ${elementId} not found, skipping event`);
                return;
            }
            current = element;
            continue;
        }

        // Create missing intermediate objects (preserve existing arrays)
        if (current[key] == null || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }

    // Set the final value
    const lastKey = pathParts[pathParts.length - 1];

    if (lastKey === 'elements' || lastKey === 'deletedElements') {
        if (!Array.isArray(current[lastKey])) {
            current[lastKey] = [];
        }
        current[lastKey].push(actualValue);
    } else {
        current[lastKey] = actualValue;
    }

    document.lastUpdated = event.value.timestamp;
}

// Event System - Persistence
async function saveModification() {
    if (!wisk.sync.eventLog?.length) {
        return;
    }

    const eventsToSave = wisk.sync.eventLog.slice();
    wisk.sync.eventLog = [];

    // Deep clone for rollback on failure
    const documentBackup = JSON.parse(JSON.stringify(wisk.editor.document));

    // Apply events to in-memory document
    eventsToSave.forEach(event => {
        applyEvent(wisk.editor.document, event);
    });

    // Store in syncLogs for future server sync
    wisk.editor.document.data.sync ??= { syncLogs: [], isPushed: false, lastSync: 0 };
    wisk.editor.document.data.sync.syncLogs ??= [];
    wisk.editor.document.data.sync.syncLogs.push(...eventsToSave);

    try {
        await wisk.db.setPage(wisk.editor.pageId, wisk.editor.document);
    } catch (error) {
        console.error('Failed to save, rolling back:', error);
        wisk.editor.document = documentBackup;
        wisk.sync.eventLog = eventsToSave.concat(wisk.sync.eventLog);
        throw error;
    }
}

wisk.sync.enqueueSave = function(context = 'unknown') {
    if (saveScheduled) {
        return saveQueue;
    }
    saveScheduled = true;

    saveQueue = saveQueue.then(async () => {
        saveScheduled = false;
        try {
            await wisk.sync.saveModification();
        } catch (error) {
            console.error(`Save failed (${context}):`, error);
        }
    });

    return saveQueue;
};

// WebSockets
function initializeWebSocket() {
    return new Promise((resolve, reject) => {
        socket = new WebSocket(wisk.editor.wsBackendUrl + '/v1/live');

        socket.addEventListener('open', () => {
            console.log('WebSocket connected');
            resolve();
        });

        socket.addEventListener('message', event => {
            handleIncomingMessage(event.data);
        });

        socket.addEventListener('error', () => {
            alert('Connection with server failed. Click OK to reload the page.');
            location.reload();
        });

        socket.addEventListener('close', () => {
            alert('Connection with server closed. Click OK to reload the page.');
            location.reload();
        });
    });
}

function sendMessage(message) {
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(message);
    } else {
        console.log('WebSocket not open. State:', socket?.readyState ?? 'uninitialized');
    }
}

async function sendAuth() {
    const user = await document.querySelector('auth-component').getUserInfo();
    sendMessage(JSON.stringify({
        id: wisk.editor.pageId,
        token: user.token,
    }));
}

function handleIncomingMessage(message) {
    const m = JSON.parse(message);
    console.log('Received:', m);

    if (firstMsg) {
        initEditor(m);
        firstMsg = false;
    }

    if (!('uuid' in m)) {
        wisk.editor.handleChanges(m);
    }
}

function startMessageLoop(interval = 5000) {
    return setInterval(() => sendMessage('hello'), interval);
}

function stopMessageLoop(intervalId) {
    clearInterval(intervalId);
}

// Page Initialization
async function sync() {
    wisk.utils.showLoading('Syncing with server...');

    const pages = await wisk.db.getAllPages();
    const offlinePages = [];

    for (const pageId of pages) {
        if (pageId.startsWith('of-')) {
            const page = await wisk.db.getPage(pageId);
            offlinePages.push(page);
        }
    }

    console.log('Offline pages:', offlinePages);
}

async function live() {
    console.log('PAGE LIVE', wisk.editor.pageId);

    if (wisk.editor.readonly) {
        // TODO: Clean up wisk.site integration
        const subdomain = window.location.hostname.split('.')[0];
        const fetchUrl = `${wisk.editor.backendUrl}/v1/new?doc=${getURLParam('uwu')}&subdomain=${subdomain}`;

        const response = await fetch(fetchUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (response.status !== 200) {
            window.location.href = '/404.html';
            return;
        }

        const data = await response.json();
        initEditor(data);
        return;
    }

    try {
        // await initializeWebSocket();
        // await sendAuth();
    } catch (error) {
        console.error('Error:', error);
    }
}

// Network Status
window.addEventListener('online', () => console.log('Online'));
window.addEventListener('offline', () => console.log('Offline'));

wisk.sync.saveModification = saveModification;
wisk.sync.applyEvent = applyEvent;

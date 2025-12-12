// sync.js
let socket;
let firstMsg = true;

// events
wisk.sync.eventLog = [];

async function sync() {
    wisk.utils.showLoading('Syncing with server...');
    console.log('PAGE', wisk.editor.pageId);

    var pages = await wisk.db.getAllPages();
    // upload all offline pages and update their IDs
    var offlinePages = [];
    for (var i = 0; i < pages.length; i++) {
        if (pages[i].startsWith('of-')) {
            var offlinePage = await wisk.db.getPage(pages[i]);
            offlinePages.push(offlinePage);
        }
    }

    console.log('Offline pages:', offlinePages);
}

function initializeWebSocket() {
    return new Promise((resolve, reject) => {
        socket = new WebSocket(wisk.editor.wsBackendUrl + '/v1/live');

        socket.addEventListener('open', event => {
            console.log('Connected to WebSocket server');
            resolve();
        });

        socket.addEventListener('message', event => {
            handleIncomingMessage(event.data);
        });

        socket.addEventListener('error', event => {
            alert('Connection with server failed. Click OK to reload the page.');
            location.reload();
        });

        socket.addEventListener('close', event => {
            alert('Connection with server closed. Click OK to reload the page.');
            location.reload();
        });
    });
}

function sendMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
    } else {
        console.log('Connection is not open. ReadyState:', socket ? socket.readyState : 'socket not initialized');
    }
}

function startMessageLoop(interval = 5000) {
    return setInterval(() => {
        sendMessage('hello');
    }, interval);
}

function stopMessageLoop(intervalId) {
    clearInterval(intervalId);
}

async function sendAuth() {
    var user = await document.querySelector('auth-component').getUserInfo();
    sendMessage(
        JSON.stringify({
            id: wisk.editor.pageId,
            token: user.token,
        })
    );
}

async function live() {
    console.log('PAGE LIVE', wisk.editor.pageId);

    if (wisk.editor.readonly) {
        // TODO
        // FIXX THIS THIS IS REALLY BAD
        // the way im adding wisk.site
        // but i have to ship early
        const subdomain = window.location.hostname.split('.')[0]; // Extract subdomain
        var fetchUrl = wisk.editor.backendUrl + '/v1/new?doc=' + getURLParam('uwu') + '&subdomain=' + subdomain; // Add subdomain
        var fetchOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        };

        var response = await fetch(fetchUrl, fetchOptions);

        if (response.status !== 200) {
            window.location.href = '/404.html';
            return;
        }

        var data = await response.json();
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

async function saveUpdates() {
    console.log('Saving updates:', wisk.editor.document);
    await wisk.db.setPage(wisk.editor.pageId, wisk.editor.document);

    //// send to server
    //sendMessage(
    //    JSON.stringify({
    //        changes: changes,
    //        allElements: allElements,
    //        newDeletedElements: newDeletedElements,
    //    })
    //);
}

wisk.sync.saveUpdates = saveUpdates;

wisk.sync.newChange = function(event) {
    if (!event || !event.path || !event.value || event.value.data === undefined) {
        console.error('invalid event: ', event);
        return;
    }
    if(!event.value.timestamp) {
        event.value.timestamp = Date.now();
    }
    if(!event.value.agent) {
        event.value.agent = wisk.sync.agent;
    }
    wisk.sync.eventLog.push(event);

    console.log('New change event logged:', event);
    console.log('Current event log:', wisk.sync.eventLog);
}

function applyEvent(document, event) {
    const pathParts = event.path.split('.');
    let current = document;
    let i = 0;

    if (event.path === 'data.elementOrder') {
        const newOrder = event.value.data;
        if (!document.data) document.data = {};
        document.data.elementOrder = newOrder;
        if (document.data.elements && Array.isArray(document.data.elements)) {
            const orderedElements = [];
            newOrder.forEach(id => {
                const elem = document.data.elements.find(e => e.id === id);
                if (elem) orderedElements.push(elem);
            });
            document.data.elements = orderedElements;
        }

        document.lastUpdated = event.value.timestamp;
        console.log('Applied element order event');
        return;
    }

    if (event.path === 'data.elements' && pathParts.length === 2) {
        if (!document.data) document.data = {};
        if (!document.data.elements) {
            document.data.elements = [];
        }
        document.data.elements.push(event.value.data);
        document.lastUpdated = event.value.timestamp;
        console.log('Applied element creation event for:', event.value.data.id);
        return;
    }

    // Navigate to the parent of the target property
    while (i < pathParts.length - 1) {
        const key = pathParts[i];

        // Handle array operations for elements
        if (key === 'elements' && current[key] && Array.isArray(current[key])) {
            i++;
            const elementId = pathParts[i];
            const element = current.elements.find(e => e.id === elementId);

            if (!element) {
                console.warn(`Element ${elementId} not found, skipping event`);
                return;
            }

            current = element;
            i++;
            continue;
        }

        // Normal object navigation with safety checks
        if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
            current[key] = {};
            console.log(`Created missing intermediate object: ${pathParts.slice(0, i + 1).join('.')}`);
        }

        current = current[key];
        i++;
    }
    const lastKey = pathParts[pathParts.length - 1];
    const actualValue = event.value.data;

    // Special handling for array operations
    if (lastKey === 'deletedElements' && Array.isArray(current[lastKey])) {
        current[lastKey].push(actualValue);
        console.log(`Applied event: pushed to deletedElements`);
    } else if (lastKey === 'elements' && Array.isArray(current[lastKey])) {
        current[lastKey].push(actualValue);
        console.log(`Applied event: added new element`);
    } else {
        if (lastKey === 'deletedElements' || lastKey === 'elements') {
            if (!current[lastKey]) {
                current[lastKey] = [];
            }
            current[lastKey].push(actualValue);
        } else {
            current[lastKey] = actualValue;
        }
        console.log(`Applied event to ${event.path}`);
    }
    document.lastUpdated = event.value.timestamp;

    console.log('Applied event:', event);
}

async function saveModification() {
    console.log('Saving modifications. Event log:', wisk.sync.eventLog);

    if (!wisk.sync.eventLog || wisk.sync.eventLog.length === 0) {
        console.log('No events to save');
        return;
    }
    if (!wisk.editor.document) {
        console.error('Cannot save: wisk.editor.document is not initialized');
        return;
    }
    if (!wisk.editor.document.data) {
        wisk.editor.document.data = {};
    }

    // Store event count before modifications for accurate rollback
    const eventCount = wisk.sync.eventLog.length;

    // Apply all pending events to the in-memory document
    wisk.sync.eventLog.forEach(event => {
        applyEvent(wisk.editor.document, event);
    });
    if (!wisk.editor.document.data.sync) {
        wisk.editor.document.data.sync = {
            syncLogs: [],
            isPushed: false,
            lastSync: 0
        };
    }
    if (!wisk.editor.document.data.sync.syncLogs) {
        wisk.editor.document.data.sync.syncLogs = [];
    }
    wisk.editor.document.data.sync.syncLogs.push(...wisk.sync.eventLog);
    try {
        await wisk.db.setPage(wisk.editor.pageId, wisk.editor.document);

        console.log('Saved document with', eventCount, 'events');
        console.log('Total events in syncLogs:', wisk.editor.document.data.sync.syncLogs.length);
        wisk.sync.eventLog = [];
    } catch (error) {
        console.error('Failed to save document, preserving eventLog:', error);
        if (wisk.editor.document.data.sync.syncLogs.length >= eventCount) {
            wisk.editor.document.data.sync.syncLogs.splice(-eventCount);
        }
        throw error;
    }
}

wisk.sync.saveModification = saveModification;
wisk.sync.applyEvent = applyEvent;

function handleIncomingMessage(message) {
    var m = JSON.parse(message);
    console.log('Received:', m);

    if (firstMsg) {
        initEditor(m);
        firstMsg = false;
    }

    if (!('uuid' in m)) {
        wisk.editor.handleChanges(m);
    }
}

window.addEventListener('online', () => {
    console.log('User is online');
});

window.addEventListener('offline', () => {
    console.log('User is offline');
});

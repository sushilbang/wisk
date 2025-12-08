class LinkPreviewElement extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.link = '';
        this.metadata = null;
        this.render();
        this.isVirtualKeyboard = this.checkIfVirtualKeyboard();
        this.debounceTimer = null;
    }

    checkIfVirtualKeyboard() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    connectedCallback() {
        // this.editable = this.shadowRoot.querySelector('#editable');
        // this.bindEvents();

        // Make the entire preview clickable
        const outer = this.shadowRoot.querySelector('.outer');
        if (outer) {
            outer.addEventListener('click', () => {
                if (this.link) {
                    let url = this.link;
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        url = 'https://' + url;
                    }
                    window.open(url, '_blank');
                }
            });
        }
    }

    setValue(path, value) {
        if (path === 'value.append') {
            this.link += value.textContent;
        } else {
            const newLink = value.textContent || '';

            // If link changed, reset metadata
            if (newLink !== this.link) {
                this.metadata = null;
            }

            this.link = newLink;

            if (value.metadata) {
                this.metadata = value.metadata;
                this.updatePreviewWithMetadata(this.metadata);
            } else if (this.link && this.link.trim()) {
                this.updateLinkPreview();
            } else {
                this.resetPreview();
            }
        }
    }

    getValue() {
        return {
            textContent: this.link,
            metadata: this.metadata,
        };
    }

    updatePreviewWithMetadata(metadata) {
        const titleElement = this.shadowRoot.querySelector('.link-preview-title');
        const descElement = this.shadowRoot.querySelector('.link-preview-description');
        const imageElement = this.shadowRoot.querySelector('.link-preview-image');
        const metaElement = this.shadowRoot.querySelector('.link-preview-meta');

        titleElement.textContent = metadata.title || 'No title available';

        if (metadata.description) {
            descElement.textContent = metadata.description;
            descElement.style.display = 'block';
        } else {
            descElement.style.display = 'none';
        }

        if (metadata.favicon) {
            imageElement.src = metadata.favicon;
            imageElement.onerror = () => {
                imageElement.src = '';
            };
        }

        let metaInfo = [];
        if (metadata.siteName) metaInfo.push(metadata.siteName);
        if (metadata.author) metaInfo.push(`By ${metadata.author}`);
        if (metadata.publishDate) {
            const date = new Date(metadata.publishDate);
            metaInfo.push(date.toLocaleDateString());
        }

        if (metaInfo.length > 0) {
            metaElement.textContent = metaInfo.join(' • ');
            metaElement.style.display = 'block';
        } else {
            metaElement.style.display = 'none';
        }
    }

    async updateLinkPreview() {
        // Don't fetch if no link
        if (!this.link || !this.link.trim()) {
            this.resetPreview();
            return;
        }

        // Don't fetch if we already have metadata for this exact link
        if (this.metadata) {
            return;
        }

        this.showLoadingState();

        try {
            let url = this.link;
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }

            // console.log('[LinkPreview] Fetching metadata for:', url);

            const response = await fetch('https://render.wisk.cc/fetch-metadata', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url }),
            });

            if (!response.ok) {
                throw new Error('Failed to fetch metadata');
            }

            const metadata = await response.json();

            if (metadata.error) {
                throw new Error(metadata.error);
            }

            // console.log('[LinkPreview] Received metadata:', metadata);

            this.metadata = metadata;
            this.updatePreviewWithMetadata(metadata);
            this.sendUpdates();
        } catch (error) {
            console.error('Error fetching metadata:', error);
            this.showErrorState();
            this.metadata = null;
        }
    }

    resetPreview() {
        const titleElement = this.shadowRoot.querySelector('.link-preview-title');
        const descElement = this.shadowRoot.querySelector('.link-preview-description');
        const imageElement = this.shadowRoot.querySelector('.link-preview-image');
        const metaElement = this.shadowRoot.querySelector('.link-preview-meta');

        titleElement.textContent = 'Enter a URL to preview';
        descElement.style.display = 'none';
        imageElement.src = '';
        metaElement.style.display = 'none';
        this.metadata = null;
    }

    showLoadingState() {
        const titleElement = this.shadowRoot.querySelector('.link-preview-title');
        const descElement = this.shadowRoot.querySelector('.link-preview-description');
        const imageElement = this.shadowRoot.querySelector('.link-preview-image');
        const metaElement = this.shadowRoot.querySelector('.link-preview-meta');

        titleElement.textContent = 'Loading...';
        descElement.style.display = 'none';
        imageElement.src = '';
        metaElement.style.display = 'none';
    }

    showErrorState() {
        const titleElement = this.shadowRoot.querySelector('.link-preview-title');
        const descElement = this.shadowRoot.querySelector('.link-preview-description');
        const imageElement = this.shadowRoot.querySelector('.link-preview-image');
        const metaElement = this.shadowRoot.querySelector('.link-preview-meta');

        titleElement.textContent = 'Unable to load preview';
        descElement.style.display = 'none';
        imageElement.src = '';
        metaElement.style.display = 'none';
    }

    handleSpecialKeys(event) {
        const keyHandlers = {
            Enter: () => this.handleEnterKey(event),
            Backspace: () => this.handleBackspace(event),
            Tab: () => this.handleTab(event),
            ArrowLeft: () => this.handleArrowKey(event, 'next-up', 0),
            ArrowRight: () => this.handleArrowKey(event, 'next-down', this.editable.innerText.length),
        };

        const handler = keyHandlers[event.key];
        return handler ? handler() : false;
    }

    handleEnterKey(event) {
        if (!this.isVirtualKeyboard) {
            event.preventDefault();
            wisk.editor.createNewBlock(this.id, 'text-element', { textContent: '' }, { x: 0 });
            return true;
        }
        return false;
    }

    handleBackspace(event) {
        if (this.editable.innerText.length === 0) {
            event.preventDefault();
            wisk.editor.deleteBlock(this.id);
            return true;
        }
        return false;
    }

    handleTab(event) {
        event.preventDefault();
        return true;
    }

    handleArrowKey(event, direction, targetOffset) {
        const currentOffset = this.getCurrentOffset();
        if (currentOffset === targetOffset) {
            event.preventDefault();
            if (direction === 'next-up') {
                var prevElement = wisk.editor.prevElement(this.id);
                if (prevElement != null) {
                    const prevComponentDetail = wisk.plugins.getPluginDetail(prevElement.component);
                    if (prevComponentDetail.textual) {
                        wisk.editor.focusBlock(prevElement.id, { x: prevElement.value.textContent.length });
                    }
                }
            } else if (direction === 'next-down') {
                var nextElement = wisk.editor.nextElement(this.id);
                if (nextElement != null) {
                    const nextComponentDetail = wisk.plugins.getPluginDetail(nextElement.component);
                    if (nextComponentDetail.textual) {
                        wisk.editor.focusBlock(nextElement.id, { x: 0 });
                    }
                }
            }
            return true;
        }
        return false;
    }

    getCurrentOffset() {
        const selection = this.shadowRoot.getSelection();
        return selection.rangeCount ? selection.getRangeAt(0).startOffset : 0;
    }

    onValueUpdated(event) {
        const text = this.editable.innerText;
        if (this.handleSpecialKeys(event)) {
            return;
        }

        if (this.link !== text) {
            this.metadata = null;
        }

        this.link = text;
        this.sendUpdates();

        if (!this.metadata && text) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.updateLinkPreview();
            }, 500);
        }
    }

    sendUpdates() {
        setTimeout(() => {
            wisk.editor.justUpdates(this.id);
        }, 0);
    }

    render() {
        const style = `
            <style>
            * {
                box-sizing: border-box;
                padding: 0;
                margin: 0;
                font-family: var(--font);
            }
            .link {
                outline: none;
                padding: 0;
                border: none;
                font-family: var(--font-mono);
                font-size: 12px;
            }
            #editable {
                width: 100%;
            }
            .outer {
                border: 1px solid var(--border-1);
                border-radius: var(--radius-large);
                overflow: hidden;
                transition: all 0.15s ease;
                background: var(--bg-1);
                cursor: pointer;
            }
            .link-preview {
                display: flex;
                flex-direction: column;
            }
            .preview-header {
                padding: 16px;
                background: var(--bg-2);
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .preview-title-row {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .link-preview-image {
                width: 20px;
                height: 20px;
                object-fit: contain;
                flex-shrink: 0;
                border-radius: 4px;
            }
            .link-preview-content {
                flex: 1;
                min-width: 0;
            }
            .link-preview-title {
                word-break: break-word;
                color: var(--fg-1);
                font-weight: 600;
                font-size: 14px;
                line-height: 1.4;
            }
            .link-preview-description {
                font-size: 13px;
                color: var(--fg-2);
                margin-bottom: 8px;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                line-height: 1.5;
            }
            .link-preview-meta {
                font-size: 12px;
                color: var(--fg-3);
                margin-bottom: 8px;
            }
            .table-controls {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 0;
                font-size: 12px;
            }
            .url-display {
                display: flex;
                align-items: center;
                gap: 4px;
                flex: 1;
                min-width: 0;
                padding: 6px 8px;
                background: var(--bg-1);
                border-radius: var(--radius);
            }
            .open {
                padding: 6px 12px;
                background-color: transparent;
                color: var(--fg-accent);
                border: none;
                border-radius: var(--radius);
                outline: none;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.15s ease;
                font-weight: 500;
            }
            .open:hover {
                background-color: var(--bg-3);
            }
            </style>
        `;
        const content = `
            <div class="outer">
                <div class="link-preview">
                    <div class="preview-header">
                        <div class="preview-title-row">
                            <img class="link-preview-image" src="" alt="">
                            <div class="link-preview-title">Link Preview</div>
                        </div>
                        <div class="link-preview-description"></div>
                        <div class="link-preview-meta"></div>
                        <!-- <div class="table-controls">
                            <div class="url-display">
                                <span class="link" style="color: var(--fg-3);">🔗</span>
                                <div class="link" id="editable" contenteditable="${!wisk.editor.readonly}" spellcheck="false" style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.link}</div>
                            </div>
                            <button class="open">Open</button>
                        </div> -->
                    </div>
                </div>
            </div>
        `;
        this.shadowRoot.innerHTML = style + content;
    }

    bindEvents() {
        const eventType = this.isVirtualKeyboard ? 'input' : 'keyup';
        this.editable.addEventListener(eventType, this.onValueUpdated.bind(this));
        this.editable.addEventListener('focus', () => {
            if (this.editable.innerText.trim() === '') {
                this.editable.classList.add('empty');
            }
        });

        this.shadowRoot.querySelector('.open').addEventListener('click', () => {
            const url = this.link;
            window.open('https://' + url, '_blank');
        });
    }
}

customElements.define('link-preview-element', LinkPreviewElement);

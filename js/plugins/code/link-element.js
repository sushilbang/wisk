class LinkElement extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes() {
        return ['url', 'title', 'icon', 'display'];
    }

    connectedCallback() {
        // console.log('[LinkElement] connectedCallback', {
        //     url: this.url,
        //     title: this.title,
        //     display: this.displayMode,
        //     isInternal: this.isInternal
        // });

        this.render();
        this.bindEvents();

        if (this.isInternal) {
            // console.log('[LinkElement] Scheduling title fetch for internal link');
            setTimeout(() => this.fetchInternalPageTitle(), 100);
        }
    }

    disconnectedCallback() {
        // console.log('[LinkElement] disconnectedCallback');
    }

    attributeChangedCallback(name, oldVal, newVal) {
        // console.log('[LinkElement] attributeChangedCallback', { name, oldVal, newVal });
        
        if (oldVal !== newVal && this.isConnected) {
            this.render();
            this.bindEvents();
        }
    }

    get url() {
        return this.getAttribute('url') || '';
    }

    get title() {
        return this.getAttribute('title') || '';
    }

    get icon() {
        return this.getAttribute('icon') || '';
    }

    get displayMode() {
        return this.getAttribute('display') || 'inline';
    }

    get isInternal() {
        if (!this.url) return false;
        if (this.url.startsWith('https://app.wisk.cc')) return true;
        
        try {
            const urlObj = new URL(this.url);
            const currentOrigin = window.location.origin;
            
            if (urlObj.origin === currentOrigin && urlObj.searchParams.has('id')) return true;
        } catch {}
        
        return false;
    }

    async fetchInternalPageTitle() {
        
        if (!this.isInternal) {
            return;
        }

        try {
            const urlObj = new URL(this.url);
            const pageId = urlObj.searchParams.get('id');
            
            // console.log('[LinkElement] Fetching page ID:', pageId);
            
            if (!pageId) {
                return;
            }

            // Fetch from wisk.db (IndexedDB)
            const pageData = await wisk.db.getPage(pageId);
            

            if (!pageData || !pageData.data || !pageData.data.config) {
                return;
            }

            // Get title from config.name
            const pageTitle = pageData.data.config.name || 'Untitled';
            
            // Get emoji from first element if available, otherwise default to page.svg
            let pageIcon = '/js/plugins/icons/page.svg'; // DEFAULT
            
            if (pageData.data.elements && 
                pageData.data.elements.length > 0 && 
                pageData.data.elements[0].value && 
                pageData.data.elements[0].value.emoji) {
                pageIcon = pageData.data.elements[0].value.emoji;
            }


            // Only update if changed to avoid unnecessary re-renders
            if (this.title !== pageTitle) {
                this.setAttribute('title', pageTitle);
            }
            
            if (this.icon !== pageIcon) {
                this.setAttribute('icon', pageIcon);
            }
            
            // Update parent document
            if (this.id && typeof wisk.editor.justUpdates === 'function') {
                wisk.editor.justUpdates(this.id);
            }

            // console.log('[LinkElement] ✓ Title fetch complete');

        } catch (error) {
            console.error('[LinkElement] ✗ Error fetching page title:', error);
        }
    }

    // Static method to refresh all internal links on page
    static refreshAllInternalLinks() {
        const allLinks = document.querySelectorAll('link-element');
        
        allLinks.forEach((link, index) => {
            if (link.isInternal) {
                // console.log(`[LinkElement] Refreshing link ${index + 1}:`, link.url);
                link.fetchInternalPageTitle();
            }
        });
    }

    getValue() {
        const value = {
            url: this.url,
            display: this.displayMode
        };

        // Store title for all links (not just internal)
        if (this.title) {
            value.title = this.title;
        }

        if (this.isInternal && this.icon) {
            value.icon = this.icon;
        }

        // console.log('[LinkElement] getValue:', value);
        return value;
    }

    setValue(path, value) {
        // console.log('[LinkElement] setValue:', { path, value });

        if (value.url) this.setAttribute('url', value.url);
        if (value.title) this.setAttribute('title', value.title);
        if (value.icon) this.setAttribute('icon', value.icon);
        if (value.display) this.setAttribute('display', value.display);

        // ALWAYS fetch latest title for internal links
        if (this.isInternal) {
            // console.log('[LinkElement] setValue: scheduling title fetch for internal link');
            setTimeout(() => this.fetchInternalPageTitle(), 100);
        }
    }

    getTextContent() {
        // Use title for display when available, fallback to URL
        const displayText = this.title || this.url;
        return {
            html: displayText,
            text: displayText,
            markdown: `[${displayText}](${this.url})`
        };
    }

    focus(identifier) {
        const editable = this.shadowRoot.querySelector('[contenteditable="true"]');
        if (editable) {
            editable.focus();
            if (identifier && typeof identifier.x === 'number') {
                try {
                    // Try shadowRoot.getSelection() first (Chrome), fall back to window.getSelection() (Firefox, Safari)
                    const sel = this.shadowRoot.getSelection?.() || window.getSelection() || document.getSelection();

                    if (!sel) {
                        console.warn('[LinkElement] Selection API not available');
                        return;
                    }

                    const range = document.createRange();
                    const textNode = editable.firstChild;
                    if (textNode) {
                        const pos = Math.min(identifier.x, textNode.length);
                        range.setStart(textNode, pos);
                        range.setEnd(textNode, pos);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                } catch (error) {
                    console.warn('[LinkElement] Failed to set cursor position:', error);
                }
            }
        }
    }

    bindEvents() {
        const wrapper = this.shadowRoot.querySelector('.link-wrapper');
        if (wrapper) {
            wrapper.onclick = (e) => {
                if (e.target.closest('[contenteditable="true"]')) return;
                this.openLink();
            };
        }

        const openBtn = this.shadowRoot.querySelector('.open-btn');
        if (openBtn) {
            openBtn.onclick = (e) => {
                e.stopPropagation();
                this.openLink();
            };
        }

        const editable = this.shadowRoot.querySelector('[contenteditable="true"]');
        if (editable) {
            editable.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    wisk.editor.createNewBlock(this.id, 'text-element', { textContent: '' }, { x: 0 });
                }
                if (e.key === 'Backspace' && editable.innerText.length === 0) {
                    e.preventDefault();
                    wisk.editor.deleteBlock(this.id);
                }
            };

            editable.oninput = () => {
                const newTitle = editable.innerText;
                // console.log('[LinkElement] Title manually edited to:', newTitle);
                this.setAttribute('title', newTitle);
                
                // Update the linked page's title if internal
                if (this.isInternal) {
                    this.updateLinkedPageTitle(newTitle);
                }
                
                wisk.editor.justUpdates(this.id);
            };
        }
    }

    async updateLinkedPageTitle(newTitle) {
        try {
            const urlObj = new URL(this.url);
            const pageId = urlObj.searchParams.get('id');
            
            if (!pageId) return;

            const pageData = await wisk.db.getPage(pageId);
            
            if (pageData && pageData.data && pageData.data.config) {
                pageData.data.config.name = newTitle;
                pageData.lastUpdated = Date.now();
                await wisk.db.setPage(pageId, pageData);
            }
        } catch (error) {
            console.error('[LinkElement] ✗ Error updating linked page title:', error);
        }
    }

    openLink() {
        
        if (!this.url) return;

        if (this.isInternal) {
            window.location.href = this.url;
        } else {
            let url = this.url;
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }
            window.open(url, '_blank');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    render() {
        // console.log('[LinkElement] render:', {
        //     displayMode: this.displayMode,
        //     isInternal: this.isInternal,
        //     title: this.title,
        //     icon: this.icon
        // });

        const isBlock = this.displayMode === 'block';

        if (isBlock) {
            if (this.isInternal) {
                // Emoji or icon handling
                let iconHtml;
                const iconValue = this.icon || '/js/plugins/icons/page.svg'; // DEFAULT
                
                if (iconValue && !iconValue.endsWith('.svg') && !iconValue.startsWith('/')) {
                    iconHtml = `<span class="emoji">${iconValue}</span>`;
                } else {
                    iconHtml = `<img src="${iconValue}" alt="">`;
                }

                const displayTitle = this.escapeHtml(this.title || 'Untitled');

                this.shadowRoot.innerHTML = `
                    <style>
                        :host { display: block; }
                        * { box-sizing: border-box; margin: 0; padding: 0; font-family: var(--font); }
                        .link-wrapper {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            padding: 12px;
                            border-radius: var(--radius);
                            cursor: pointer;
                            transition: background 0.15s;
                        }
                        .link-wrapper:hover { background: var(--bg-2); }
                        .icon {
                            width: 20px;
                            height: 20px;
                            flex-shrink: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .icon img { 
                            width: 100%; 
                            height: 100%; 
                            object-fit: contain;
                            filter: var(--themed-svg);
                        }
                        .icon .emoji { font-size: 18px; line-height: 1; }
                        .title {
                            flex: 1;
                            outline: none;
                            color: var(--fg-1);
                            min-width: 0;
                        }
                        .title:empty:before {
                            content: 'Untitled';
                            color: var(--fg-3);
                        }
                        /* .open-btn {
                            opacity: 0;
                            padding: 4px 8px;
                            background: var(--bg-3);
                            border: none;
                            border-radius: var(--radius);
                            cursor: pointer;
                            font-size: 12px;
                            color: var(--fg-2);
                            transition: opacity 0.15s;
                        }
                        .link-wrapper:hover .open-btn { opacity: 1; }
                        .open-btn:hover { background: var(--bg-accent); color: var(--fg-accent); } */
                    </style>
                    <div class="link-wrapper">
                        <div class="icon">${iconHtml}</div>
                        <div class="title">${displayTitle}</div>
                        <!-- <button class="open-btn">Open</button> -->
                    </div>
                `;
            } else {
                // External link rendering
                const displayUrl = this.escapeHtml(this.url);

                this.shadowRoot.innerHTML = `
                    <style>
                        :host { display: block; }
                        * { box-sizing: border-box; margin: 0; padding: 0; font-family: var(--font); }
                        .link-wrapper {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            padding: 12px;
                            border: 1px solid var(--border-1);
                            border-radius: var(--radius);
                            cursor: pointer;
                            transition: background 0.15s;
                        }
                        .link-wrapper:hover { background: var(--bg-2); }
                        .link-icon {
                            width: 16px;
                            height: 16px;
                            flex-shrink: 0;
                            color: var(--fg-2);
                        }
                        .url {
                            flex: 1;
                            color: var(--fg-accent);
                            text-decoration: underline;
                            word-break: break-all;
                            min-width: 0;
                        }
                        .open-btn {
                            opacity: 0;
                            padding: 4px 8px;
                            background: var(--bg-3);
                            border: none;
                            border-radius: var(--radius);
                            cursor: pointer;
                            font-size: 12px;
                            color: var(--fg-2);
                            transition: opacity 0.15s;
                        }
                        .link-wrapper:hover .open-btn { opacity: 1; }
                        .open-btn:hover { background: var(--bg-accent); color: var(--fg-accent); }
                    </style>
                    <div class="link-wrapper">
                        <svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 7 0 0 0 7.07 7.07l1.71-1.71"/>
                        </svg>
                        <span class="url">${displayUrl}</span>
                        <button class="open-btn">Open ↗</button>
                    </div>
                `;
            }
        } else {
            // Inline link rendering - use title when available, fallback to URL
            const displayText = this.escapeHtml(this.title || this.url);

            this.shadowRoot.innerHTML = `
                <style>
                    :host {
                        display: inline;
                        cursor: pointer;
                        pointer-events: auto;
                    }
                    .link-wrapper {
                        color: var(--fg-accent);
                        text-decoration: underline;
                        display: inline;
                    }
                    .link-wrapper:hover { opacity: 0.8; }
                </style>
                <span class="link-wrapper">${displayText}</span>
            `;
        }
    }
}

customElements.define('link-element', LinkElement);

// Auto-refresh all links when page loads
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        LinkElement.refreshAllInternalLinks();
    }, 500);
});

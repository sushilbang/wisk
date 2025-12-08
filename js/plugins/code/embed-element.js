class EmbedElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.link = '';
    this.updateTimer = null;
    this.isVirtualKeyboard = this.checkIfVirtualKeyboard();
    this.render();
  }

  checkIfVirtualKeyboard() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  connectedCallback() {
    // this.editable = this.shadowRoot.querySelector('#editable');
    this.iframe = this.shadowRoot.querySelector('iframe');
    // this.bindEvents();
  }

  extractSrcFromIframe(iframeCode) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(iframeCode, 'text/html');
    const iframe = doc.querySelector('iframe');
    if (iframe && iframe.src) {
      return iframe.src.replace(/^https?:\/\//, '');
    }
    return null;
  }

  setValue(path, value) {
    console.log('[Embed] setValue called with:', path, value);

    let content = value.textContent || '';

    // Handle iframe embed code
    if (content && content.includes('<iframe')) {
      const extracted = this.extractSrcFromIframe(content);
      if (extracted) {
        console.log('[Embed] Extracted URL from iframe code:', extracted);
        content = extracted;
      }
    }

    // Store link directly (editable is commented out)
    if (path === 'value.append') {
      this.link += content;
    } else {
      this.link = content;
    }

    // Update iframe immediately
    setTimeout(() => {
      this.updateIframeSource();
    }, 0);
  }

  getValue() {
    return {
      textContent: this.link,
    };
  }

  convertToEmbedUrl(url) {
    // YouTube
    // youtube.com/watch?v=VIDEO_ID → youtube.com/embed/VIDEO_ID
    // youtu.be/VIDEO_ID → youtube.com/embed/VIDEO_ID
    if (url.includes('youtube.com/watch')) {
      const videoId = url.match(/[?&]v=([^&]+)/);
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId[1]}`;
      }
    }
    if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1]?.split(/[?&]/)[0];
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
      }
    }

    // Google Maps
    // Convert various Google Maps URLs to embed format
    if (url.includes('google.com/maps')) {
      // If already embed format, use as is
      if (url.includes('/embed')) {
        return url.startsWith('http') ? url : 'https://' + url;
      }
      // Otherwise, extract place or coordinates and convert
      // For now, just add embed if it's a maps URL
      return url.startsWith('http') ? url : 'https://' + url;
    }

    // Google Drive
    // drive.google.com/file/d/FILE_ID/view → drive.google.com/file/d/FILE_ID/preview
    if (url.includes('drive.google.com/file')) {
      const fileId = url.match(/\/d\/([^/]+)/);
      if (fileId) {
        return `https://drive.google.com/file/d/${fileId[1]}/preview`;
      }
    }

    // GitHub Gist
    // gist.github.com/USERNAME/GIST_ID → gist.github.com/USERNAME/GIST_ID with .pibb extension for embedding
    // Actually, Gists don't embed well in iframes, we'll just use the URL
    if (url.includes('gist.github.com')) {
      return url.startsWith('http') ? url : 'https://' + url;
    }

    // Default: return URL as is
    return url.startsWith('http') ? url : 'https://' + url;
  }

  updateIframeSource() {
    if (!this.iframe) return;

    let url = this.link.trim();

    // Remove https:// prefix if present (user might type it)
    url = url.replace(/^https?:\/\//, '');

    // Convert to embed URL if it's a supported service
    url = this.convertToEmbedUrl(url);

    console.log('[Embed] Updating iframe source to:', url);

    if (url && url !== 'https://') {
      this.iframe.src = url;
      this.iframe.style.display = 'block';
    } else {
      this.iframe.src = '';
      this.iframe.style.display = 'none';
    }
  }

  focus(identifier) {
    if (this.editable) {
      this.editable.focus();
    }
  }

  handleSpecialKeys(event) {
    const keyHandlers = {
      Enter: () => this.handleEnterKey(event),
      Backspace: () => this.handleBackspace(event),
      Tab: () => this.handleTab(event),
      ArrowLeft: () => this.handleArrowKey(event, 'next-up', 0),
      ArrowRight: () => this.handleArrowKey(event, 'next-down', this.editable.innerText.length),
      ArrowUp: () => this.handleVerticalArrow(event, 'next-up'),
      ArrowDown: () => this.handleVerticalArrow(event, 'next-down'),
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

  handleVerticalArrow(event, direction) {
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

    this.link = text;
    this.sendUpdates();

    // Update iframe with debounce
    clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => {
      this.updateIframeSource();
    }, 500);
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

        :host {
          display: block;
        }

        .embed-container {
          display: flex;
          flex-direction: column;
          gap: 0;
          width: 100%;
          border: 1px solid var(--border-1);
          border-radius: var(--radius-large);
          overflow: hidden;
          transition: all 0.15s ease;
        }

        .embed-input {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 12px 14px;
          border: none;
          border-bottom: 1px solid var(--border-1);
          border-radius: 0;
          background: var(--bg-2);
          transition: all 0.15s ease;
          font-size: 12px;
        }

        .embed-input:hover {
          background: var(--bg-3);
        }

        .embed-input:focus-within {
          background: var(--bg-1);
        }

        .embed-prefix {
          color: var(--fg-3);
          font-size: 12px;
          user-select: none;
        }

        #editable {
          flex: 1;
          outline: none;
          border: none;
          background: transparent;
          color: var(--fg-1);
          font-size: 12px;
          min-width: 100px;
          font-family: var(--font-mono);
        }

        #editable.empty:before {
          content: 'Paste a link...';
          color: var(--fg-3);
          pointer-events: none;
          font-family: var(--font);
        }

        iframe {
          width: 100%;
          height: 450px;
          border: none;
          border-radius: 0;
          display: none;
          background: #000;
        }
      </style>
    `;

    const content = `
      <div class="embed-container">
        <!-- <div class="embed-input">
          <span class="embed-prefix">🔗</span>
          <div id="editable" contenteditable="${!wisk.editor.readonly}"></div>
        </div> -->
        <iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" allowfullscreen></iframe>
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

    this.editable.addEventListener('blur', () => {
      this.editable.classList.remove('empty');
    });

    this.editable.addEventListener('input', () => {
      if (this.editable.innerText.trim() === '') {
        this.editable.classList.add('empty');
      } else {
        this.editable.classList.remove('empty');
      }
    });
  }
}

customElements.define('embed-element', EmbedElement);

class EmbedElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.link = '';
    this.render();
  }

  connectedCallback() {
    this.iframe = this.shadowRoot.querySelector('iframe');
    this.container = this.shadowRoot.querySelector('.embed-container');
    this.bindEvents();
    this.updateIframeSource();
  }

  bindEvents() {
    // Make container focusable for keyboard events
    this.container.setAttribute('tabindex', '0');

    this.container.addEventListener('keydown', (event) => {
      this.handleKeyDown(event);
    });
  }

  handleKeyDown(event) {
    switch (event.key) {
      case 'Backspace':
      case 'Delete':
        event.preventDefault();
        wisk.editor.deleteBlock(this.id);
        break;
      case 'Enter':
        event.preventDefault();
        wisk.editor.createNewBlock(this.id, 'text-element', { textContent: '' }, { x: 0 });
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        const prevElement = wisk.editor.prevElement(this.id);
        if (prevElement) {
          wisk.editor.focusBlock(prevElement.id, { x: prevElement.value?.textContent?.length || 0 });
        }
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        const nextElement = wisk.editor.nextElement(this.id);
        if (nextElement) {
          wisk.editor.focusBlock(nextElement.id, { x: 0 });
        }
        break;
    }
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
    // Focus the container for keyboard events
    if (this.container) {
      this.container.focus();
    }
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
          outline: none;
        }

        .embed-container:focus {
          border-color: var(--fg-accent);
          box-shadow: 0 0 0 2px var(--bg-accent);
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
        <iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" allowfullscreen></iframe>
      </div>
    `;

    this.shadowRoot.innerHTML = style + content;
  }
}

customElements.define('embed-element', EmbedElement);

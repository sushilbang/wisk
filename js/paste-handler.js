/*
Unified paste handler for wisk: consolidates all paste handling logic for the application.
*/

class WiskPasteHandler {
    // check if the clipboard data contains wisk internal format
    static isWiskClipboardFormat(htmlData) {
        return htmlData && htmlData.includes('__WISK_CLIPBOARD__');
    }
    // parse wisk clipboard format and return element data
    static parseWiskClipboard(htmlData) {
        if(!htmlData) return null;

        const match = htmlData.match(/__WISK_CLIPBOARD__(.+?)__WISK_CLIPBOARD_END__/);
        if(!match) return null;

        try {
            const wiskData = JSON.parse(match[1]);
            if(wiskData.__wisk_elements__ && wiskData.elements) {
                return wiskData.elements;
            }
        } catch (error) {
            console.error('Failed to parse wisk clipboard data: ', error);
        }

        return null;
    }
    // get indent level for a list item element
    static getIndentLevel(element) {
        let indent = 0;
        let parent = element.parentElement;
        while(parent) {
            if(parent.tagName === 'UL' || parent.tagName === 'OL') {
                indent++;
            }
            parent = parent.parentElement;
        }
        return Math.max(0, indent - 1);
    }
    // process list items into structured format
    static processListItems(items) {
        return Array.from(items).map(li => ({
            text: li.textContent.trim(),
            indent: WiskPasteHandler.getIndentLevel(li),
        }));
    }
    // check if node is already part of an already processed list
    static isPartOfProcessedList(node) {
        let parent = node.parentElement;
        while(parent) {
            if(parent._processed) return true;
            parent = parent.parentElement;
        }
        return false;
    }
    // process a dom node into a wisk element structure
    static processNode(node, structuredElements) {
        if(node.nodeType !== Node.ELEMENT_NODE) return;

        let element = null;

        switch(node.tagName.toLowerCase()) {
            case 'h1': {
                element = {
                    elementName: 'heading1-element', value: node.textContent.trim()
                };
            };
            break;
            case 'h2': {
                element = {
                    elementName: 'heading2-element', value: node.textContent.trim()
                };
            };
            break;
            case 'h3': {
                element = {
                    elementName: 'heading3-element', value: node.textContent.trim()
                };
            };
            break;
            case 'h4': {
                element = {
                    elementName: 'heading4-element', value: node.textContent.trim()
                };
            };
            break;
            case 'h5': {
                element = {
                    elementName: 'heading5-element', value: node.textContent.trim()
                };
            };
            break;
            case 'ul':
            case 'ol': {
                node._processed = true;
                const isCheckboxList = Array.from(node.querySelectorAll('li')).some(
                    li => li.textContent.startsWith('[ ]') || li.textContent.startsWith('[x]') || li.querySelector('input[type="checkbox"]')
                );

                if(isCheckboxList && node.tagName.toLowerCase() === 'ul') {
                    element = {
                        elementName: 'checkbox-element',
                        value: Array.from(node.querySelectorAll('li')).map(li => {
                            const isChecked = li.textContent.startsWith('[x]') || li.querySelector('input[type="checkbox"]')?.checked;
                            return {
                                text: li.textContent.replace(/^\[[\sx]\]\s*/, '').trim(),
                                checked: isChecked,
                                indent: WiskPasteHandler.getIndentLevel(li),
                            };
                        }),
                    };
                } else {
                    element = {
                        elementName: node.tagName.toLowerCase() === 'ul' ? 'list-element' : 'numbered-list-element',
                        value: WiskPasteHandler.processListItems(node.querySelectorAll('li')),
                    };
                }
            };
            break;
            case 'li': {
                if(!WiskPasteHandler.isPartOfProcessedList(node)) {
                    const isCheckbox = node.textContent.startsWith('[ ]') || node.textContent.startsWith('[x]') || node.querySelector('input[type="checkbox"]');

                    if(isCheckbox) {
                        element = {
                            elementName: 'checkbox-element',
                            value: [
                                {
                                    text: node.textContent.replace(/^\[[\sx]\]\s*/, '').trim(),
                                    checked: node.textContent.startsWith('[x]') || node.querySelector('input[type="checkbox"]')?.checked,
                                    indent: WiskPasteHandler.getIndentLevel(node),
                                },
                            ],
                        };
                    } else {
                        element = {
                            elementName: 'list-element',
                            value: [
                                {
                                    text: node.textContent.trim(),
                                    indent: WiskPasteHandler.getIndentLevel(node),
                                },
                            ],
                        };
                    }
                }
            };
            break;
            case 'blockquote': {
                element = {
                    elementName: 'quote-element',
                    value: node.textContent.trim()
                };
            };
            break;
            case 'pre':
            case 'code': {
                element = {
                    elementName: 'code-element',
                    value: node.textContent.trim()
                };
            };
            break;
            case 'hr': {
                element = {
                    elementName: 'divider-element',
                    value: '',
                };
            };
            break;
            case 'img': {
                if(node.src) {
                    element = {
                        elementName: 'image-element',
                        value: node.src,
                    };
                }
            };
            break;
            case 'p': {
                if(node.textContent.trim()) {
                    element = {
                        elementName: 'text-element',
                        value: node.textContent.trim(),
                    };
                }
            };
            break;
        }

        if(element) {
            structuredElements.push(element);
        }

        node.childNodes.forEach(childNode => {
            WiskPasteHandler.processNode(childNode, structuredElements);
        });
    }
    // flatten structured elements into format expected by wisk
    static flattenElements(structuredElements) {
        const flattenedElements = [];

        structuredElements.forEach(element => {
            if(Array.isArray(element.value)) {
                element.value.forEach(item => {
                    if(typeof item === 'object') {
                        const newElement = {
                            elementName: element.elementName,
                            value: {
                                textContent: item.text || '',
                                indent: typeof item.indent === 'number' ? item.indent : 0,
                            },
                        };

                        if(element.elementName === 'checkbox-element') {
                            newElement.value.checked = !!item.checked;
                        }

                        flattenedElements.push(newElement);
                    } else {
                        flattenedElements.push({
                            elementName: element.elementName,
                            value: {
                                textContent: item,
                            },
                        });
                    }
                });
            } else if(element.elementName === 'image-element') {
                flattenedElements.push({
                    elementName: element.elementName,
                    value: {
                        imageUrl: element.value,
                        textContent: '',
                    },
                });
            } else {
                flattenedElements.push({
                    elementName: element.elementName,
                    value: {
                        textContent: element.value,
                    },
                });
            }
        });

        return flattenedElements;
    }
    // parse html clipboard data into wisk elements
    static parseHtmlToElements(htmlData) {
        if(!htmlData) return [];

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlData, 'text/html');
        const structuredElements = [];

        WiskPasteHandler.processNode(doc.body, structuredElements);

        return WiskPasteHandler.flattenElements(structuredElements);
    }
    // clean plain text for insertion (remove inlines, extra whitespaces)
    static cleanPlainText(text) {
        if(!text) return '';
        return text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    // insert plain text at cursor position
    static insertPlainText(text) {
        const cleanedText = WiskPasteHandler.cleanPlainText(text);
        if(cleanedText) {
            document.execCommand('insertText', false, cleanedText);
        }
    }
    // handle paste event for a text element: returns the parsed element array, or null if wisk clipboard format (let editor.js handle as selection is tightly bound with paste handling there)
    static handleTextElementPaste(event, elementId) {
        const clipboardData = event.clipboardData || window.clipboardData;
        const htmlData = clipboardData.getData('text/html');

        // check if this is a wisk clipboard format (multi-element paste)
        // let the document level paste handler deal with it
        if(WiskPasteHandler.isWiskClipboardFormat(htmlData)) {
            return null;
        }

        if(htmlData) {
            event.preventDefault();
            const flattenedElements = WiskPasteHandler.parseHtmlToElements(htmlData);
            console.log('Flattened Elements: ', JSON.parse(JSON.stringify(flattenedElements)));

            if(flattenedElements.length === 0) {
                const text = clipboardData.getData('text') || clipboardData.getData('text/plain');
                if(text) {
                    WiskPasteHandler.insertPlainText(text);
                }
                return [];
            }
            var inx = 0;
            if(flattenedElements[0].value.textContent != '') {
                wisk.editor.updateBlock(elementId, 'value.append', flattenedElements[0].value);
                inx = 1;
            }
            var lastId = elementId;
            for(var i = inx; i < flattenedElements.length; i++) {
                lastId = wisk.editor.createBlockNoFocus(lastId, flattenedElements[i].elementName, flattenedElements[i].value);
            }

            return flattenedElements;
        } else {
            const text = clipboardData.getData('text') || clipboardData.getData('text/plain');
            if(text) {
                event.preventDefault();
                WiskPasteHandler.insertPlainText(text);
            }
        }
        return [];
    }
    // handle document level paste event for wisk clipboard format: returns the parsed elements if it is wisk format, null otherwise
    static handleWiskClipboardPaste(event) {
        const clipboardData = event.clipboardData;
        if(!clipboardData) return null;

        const html = clipboardData.getData('text/html');
        return WiskPasteHandler.parseWiskClipboard(html);
    }
    // handle image paste from clipboard (screenshots, copied images)
    static async handleImagePaste(event) {
        const clipboardData = event.clipboardData;
        if(!clipboardData || !clipboardData.items) return null;

        for(const item of clipboardData.items) {
            if(item.type.startsWith('image/')) {
                event.preventDefault();
                const file = item.getAsFile();
                if(!file) return null;

                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        resolve({
                            elementName: 'image-element',
                            value: {
                                imageUrl: e.target.result,
                                textContent: '',
                            },
                        });
                    };
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(file);
                });
            }
        }

        return null;
    }

    // detect if pasted text is a URL
    static isURL(text) {
        if(!text) return false;
        const trimmed = text.trim();
        try {
            const url = new URL(trimmed);
            return url.protocol === 'http:' || url.protocol === 'https:'
        } catch (error) {
            return false;
        }
    }

    // check if URL is an image
    static isImageURL(url) {
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
        const lowerURL = url.toLowerCase();
        return imageExtensions.some(ext => lowerURL.includes(ext));
    }

    // check if URL is a video
    static isVideoURL(url) {
        const videoPatterns = [
            /youtube\.com\/watch/,
            /youtu\.be\//,
            /vimeo\.com\//,
            /dailymotion\.com\//,
        ];
        return videoPatterns.some(pattern => pattern.test(url));
    }
}
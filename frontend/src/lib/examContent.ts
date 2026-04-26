function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function maybeParseJson(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function extractPlainText(node: unknown): string {
    if (typeof node === 'string') {
        return node;
    }

    if (!node || typeof node !== 'object') {
        return '';
    }

    if (Array.isArray(node)) {
        return node.map(extractPlainText).filter(Boolean).join(' ');
    }

    const record = node as Record<string, unknown>;
    const directText = record.text;
    if (typeof directText === 'string' && directText.trim()) {
        return directText;
    }

    return [record.content, record.doc, record.raw_html, record.raw]
        .map(extractPlainText)
        .filter(Boolean)
        .join(' ')
        .trim();
}

function applyMarks(text: string, node: Record<string, unknown>): string {
    const marks = Array.isArray(node.marks) ? node.marks : [];

    return marks.reduce((current, mark) => {
        if (!mark || typeof mark !== 'object') {
            return current;
        }

        const markType = (mark as Record<string, unknown>).type;
        switch (markType) {
            case 'bold':
                return `<strong>${current}</strong>`;
            case 'italic':
                return `<em>${current}</em>`;
            case 'code':
                return `<code>${current}</code>`;
            case 'strike':
                return `<s>${current}</s>`;
            default:
                return current;
        }
    }, text);
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function htmlToText(html: string): string {
    return decodeHtmlEntities(
        html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li|blockquote|h[1-6]|pre)>/gi, '\n')
            .replace(/<[^>]*>/g, ' ')
    )
        .replace(/\s+/g, ' ')
        .trim();
}

function renderTipTapNode(node: unknown): string {
    if (!node || typeof node !== 'object') {
        return '';
    }

    if (Array.isArray(node)) {
        return node.map(renderTipTapNode).join('');
    }

    const record = node as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    const children = Array.isArray(record.content) ? record.content.map(renderTipTapNode).join('') : '';

    switch (type) {
        case 'doc':
            return children;
        case 'paragraph':
            return `<p>${children || ''}</p>`;
        case 'heading': {
            const level = typeof record.attrs === 'object' && record.attrs
                ? Number((record.attrs as Record<string, unknown>).level ?? 2)
                : 2;
            const safeLevel = Math.min(6, Math.max(1, Number.isFinite(level) ? level : 2));
            return `<h${safeLevel}>${children || ''}</h${safeLevel}>`;
        }
        case 'bulletList':
            return `<ul>${children}</ul>`;
        case 'orderedList':
            return `<ol>${children}</ol>`;
        case 'listItem':
            return `<li>${children}</li>`;
        case 'blockquote':
            return `<blockquote>${children}</blockquote>`;
        case 'codeBlock':
            return `<pre><code>${children || escapeHtml(extractPlainText(record))}</code></pre>`;
        case 'hardBreak':
            return '<br />';
        case 'horizontalRule':
            return '<hr />';
        case 'text': {
            const text = typeof record.text === 'string' ? escapeHtml(record.text) : '';
            return applyMarks(text, record);
        }
        default:
            if (typeof record.text === 'string') {
                return applyMarks(escapeHtml(record.text), record);
            }
            return children;
    }
}

export function toExamContentHtml(content: unknown): string {
    if (typeof content === 'string') {
        const parsed = maybeParseJson(content);
        if (parsed !== content) {
            return toExamContentHtml(parsed);
        }

        const trimmed = content.trim();
        if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
            return trimmed;
        }

        return trimmed ? `<p>${escapeHtml(trimmed)}</p>` : '';
    }

    if (!content || typeof content !== 'object') {
        return '';
    }

    const record = content as Record<string, unknown>;

    if (typeof record.raw_html === 'string' && record.raw_html.trim()) {
        return record.raw_html;
    }

    if (typeof record.html === 'string' && record.html.trim()) {
        return record.html;
    }

    if (typeof record.text === 'string' && !Array.isArray(record.content)) {
        return `<p>${escapeHtml(record.text)}</p>`;
    }

    if (typeof record.raw === 'string' && record.raw.trim()) {
        return `<p>${escapeHtml(record.raw)}</p>`;
    }

    if (record.doc && typeof record.doc === 'object') {
        const renderedDoc = renderTipTapNode(record.doc);
        if (renderedDoc.trim()) {
            return renderedDoc;
        }
    }

    if (record.json && typeof record.json === 'object') {
        const renderedJson = renderTipTapNode(record.json);
        if (renderedJson.trim()) {
            return renderedJson;
        }
    }

    const rendered = renderTipTapNode(record);
    if (rendered.trim()) {
        return rendered;
    }

    const plainText = extractPlainText(record);
    return plainText ? `<p>${escapeHtml(plainText)}</p>` : '';
}

export function toExamContentText(content: unknown): string {
    if (typeof content === 'string') {
        const parsed = maybeParseJson(content);
        if (parsed !== content) {
            return toExamContentText(parsed);
        }
    }

    const html = toExamContentHtml(content);
    if (html.trim()) {
        return htmlToText(html);
    }

    return extractPlainText(content).trim();
}

export interface ExamChoiceContent {
    id?: string;
    html: string;
    text: string;
}

function getRawChoices(options: unknown): unknown[] {
    const parsed = typeof options === 'string' ? maybeParseJson(options) : options;

    if (Array.isArray(parsed)) {
        return parsed;
    }

    if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>;
        if (Array.isArray(record.choices)) {
            return record.choices;
        }
        if (Array.isArray(record.options)) {
            return record.options;
        }
    }

    return [];
}

export function getExamChoiceContent(options: unknown): ExamChoiceContent[] {
    return getRawChoices(options)
        .map((choice) => {
            const id = choice && typeof choice === 'object' && typeof (choice as { id?: unknown }).id === 'string'
                ? (choice as { id: string }).id
                : undefined;
            const html = toExamContentHtml(choice);
            const text = toExamContentText(choice);
            if (!html.trim() && !text.trim()) {
                return null;
            }
            return {
                id,
                html: html.trim() || escapeHtml(text),
                text: text.trim() || htmlToText(html),
            };
        })
        .filter((choice): choice is ExamChoiceContent => Boolean(choice));
}

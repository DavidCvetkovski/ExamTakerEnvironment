'use client';

import { useEffect, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { toExamContentHtml } from '@/lib/examContent';
import './TipTapEditor.css';

const lowlight = createLowlight(common);

interface ReadOnlyTipTapProps {
    /** TipTap JSON, legacy text/raw content, or HTML-backed content. */
    content?: unknown;
}

type TipTapContent = Record<string, unknown> | string;

const EMPTY_CONTENT = '<p><em>Empty question</em></p>';

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function maybeParseJson(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function isTipTapDocument(value: unknown): value is Record<string, unknown> {
    return (
        isRecord(value) &&
        value.type === 'doc' &&
        Array.isArray(value.content)
    );
}

function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'br', 'hr', 'span'],
        ALLOWED_ATTR: ['class'],
    });
}

function toReadOnlyTipTapContent(content: unknown): TipTapContent {
    if (!content) return EMPTY_CONTENT;

    if (typeof content === 'string') {
        const parsed = maybeParseJson(content);
        if (parsed !== content) return toReadOnlyTipTapContent(parsed);
    }

    if (isTipTapDocument(content)) return content;

    if (isRecord(content)) {
        if (isTipTapDocument(content.doc)) return content.doc;
        if (isTipTapDocument(content.json)) return content.json;
    }

    const html = sanitizeHtml(toExamContentHtml(content));
    return html.trim() ? html : EMPTY_CONTENT;
}

/**
 * Read-only TipTap renderer. Used wherever we need full-fidelity question content
 * outside the authoring page (e.g., question picker preview).
 */
export default function ReadOnlyTipTap({ content }: ReadOnlyTipTapProps) {
    const renderableContent = useMemo(() => toReadOnlyTipTapContent(content), [content]);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({ codeBlock: false }),
            CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'python' }),
        ],
        content: renderableContent,
        editable: false,
        immediatelyRender: false,
    });

    useEffect(() => {
        if (!editor) return;
        editor.commands.setContent(renderableContent as never);
    }, [editor, renderableContent]);

    if (!editor) return null;

    return (
        <div className="tiptap-editor-wrapper tiptap-readonly">
            <EditorContent editor={editor} className="tiptap-content" />
        </div>
    );
}

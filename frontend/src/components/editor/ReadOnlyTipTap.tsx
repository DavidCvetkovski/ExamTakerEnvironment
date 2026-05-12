'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import './TipTapEditor.css';

const lowlight = createLowlight(common);

interface ReadOnlyTipTapProps {
    /** TipTap JSON document. Falls back to "Empty" when absent. */
    content?: Record<string, unknown> | null;
}

/**
 * Read-only TipTap renderer. Used wherever we need full-fidelity question content
 * outside the authoring page (e.g., question picker preview).
 */
export default function ReadOnlyTipTap({ content }: ReadOnlyTipTapProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({ codeBlock: false }),
            CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'python' }),
        ],
        content: content && Object.keys(content).length > 0 ? content : '<p><em>Empty question</em></p>',
        editable: false,
        immediatelyRender: false,
    });

    useEffect(() => {
        if (!editor) return;
        if (content && Object.keys(content).length > 0) {
            const current = JSON.stringify(editor.getJSON());
            const next = JSON.stringify(content);
            if (current !== next) editor.commands.setContent(content as never);
        }
    }, [content, editor]);

    if (!editor) return null;

    return (
        <div className="tiptap-editor-wrapper tiptap-readonly">
            <EditorContent editor={editor} className="tiptap-content" />
        </div>
    );
}

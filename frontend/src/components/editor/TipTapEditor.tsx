'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { useAuthoringStore } from '@/stores/useAuthoringStore';

// Register common languages (python, java, javascript, c, etc.)
const lowlight = createLowlight(common);

import './TipTapEditor.css';

export default function TipTapEditor() {
    const { tiptapJson, updateTipTap } = useAuthoringStore();

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                codeBlock: false,
            }),
            CodeBlockLowlight.configure({
                lowlight,
                defaultLanguage: 'python',
            }),
        ],
        content: tiptapJson && Object.keys(tiptapJson).length > 0 ? tiptapJson : '<p>Start writing your question here...</p>',
        onUpdate: ({ editor }) => {
            const json = editor.getJSON();
            updateTipTap(json);
        },
        immediatelyRender: false,
    });

    // Reactive content update when tiptapJson changes (e.g., after fetch)
    useEffect(() => {
        if (editor && tiptapJson && Object.keys(tiptapJson).length > 0) {
            const currentJson = editor.getJSON();
            if (JSON.stringify(currentJson) !== JSON.stringify(tiptapJson)) {
                editor.commands.setContent(tiptapJson);
            }
        }
    }, [tiptapJson, editor]);

    if (!editor) return null;

    return (
        <div className="tiptap-editor-wrapper">
            {/* Toolbar */}
            <div className="tiptap-toolbar">
                <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={editor.isActive('bold') ? 'is-active' : ''}
                    title="Bold"
                >
                    <strong>B</strong>
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={editor.isActive('italic') ? 'is-active' : ''}
                    title="Italic"
                >
                    <em>I</em>
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
                    title="Heading"
                >
                    H2
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={editor.isActive('bulletList') ? 'is-active' : ''}
                    title="Bullet List"
                >
                    • List
                </button>
                <span className="toolbar-divider" />
                <button
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                    className={editor.isActive('codeBlock') ? 'is-active' : ''}
                    title="Code Block"
                >
                    {'</>'}
                </button>
            </div>

            {/* Editor Content */}
            <EditorContent editor={editor} className="tiptap-content" />
        </div>
    );
}

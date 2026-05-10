'use client';

import { useState, useEffect, useRef } from 'react';
import { Button, Badge } from '@/components/ui';

const QUICK_REFERENCE = [
    { token: '// comment', required: false, description: 'Comment line — stripped before parsing.' },
    { token: '#BLUEPRINT', required: false, description: 'Opens the blueprint header block.' },
    { token: 'Title:', required: false, description: 'Blueprint display name.' },
    { token: 'Course:', required: false, description: 'Course code stored in blueprint metadata.' },
    { token: 'Duration:', required: false, description: 'Exam duration in minutes (integer ≥ 1).' },
    { token: 'Description:', required: false, description: 'Blueprint description.' },
    { token: '#BLOCK <name>', required: false, description: 'Section separator. Questions after this belong to this block.' },
    { token: '---', required: false, description: 'Question separator (optional but improves readability).' },
    { token: '#Q <stem>', required: true, description: 'Start of a question. Stem continues on subsequent non-keyword lines.' },
    { token: 'TYPE:', required: true, description: 'MCQ (single correct), MCQ_MULTI (multiple correct), ESSAY.' },
    { token: 'LEVEL:', required: false, description: 'Bloom\'s level: Remember, Understand, Apply, Analyze, Evaluate, Create.' },
    { token: 'DIFFICULTY:', required: false, description: 'Easy, Medium, or Hard. Defaults to Medium.' },
    { token: 'POINTS:', required: false, description: 'Integer ≥ 1. Defaults to 1.' },
    { token: 'SUBJECT:', required: false, description: 'Subject/topic area (e.g. Statistics, Calculus). Comma-separated for multiple.' },
    { token: 'A) text *', required: false, description: 'Answer option. Append " *" to mark as correct.' },
    { token: 'MODEL_ANSWER:', required: false, description: 'Opens model answer block for ESSAY. Ends at END_MODEL_ANSWER.' },
];

const FULL_EXAMPLE = `// This line is a comment and will be ignored

#BLUEPRINT
Title: Final Exam — Statistics 101
Course: STAT101
Duration: 90
Description: End-of-semester summative assessment.

#BLOCK Part A: Multiple Choice

---

#Q What is the arithmetic mean of the values 2, 4, and 6?
TYPE: MCQ
LEVEL: Remember
DIFFICULTY: Easy
POINTS: 1
SUBJECT: Descriptive Statistics

A) 2
B) 4 *
C) 6
D) 8

---

#Q Select ALL values that are recognised measures of central tendency.
TYPE: MCQ_MULTI
LEVEL: Remember
DIFFICULTY: Easy
POINTS: 2
SUBJECT: Descriptive Statistics

A) Mean *
B) Range
C) Median *
D) Standard Deviation
E) Mode *

---

#BLOCK Part B: Open Questions

---

#Q Explain the central limit theorem and its significance.
TYPE: ESSAY
LEVEL: Understand
DIFFICULTY: Medium
POINTS: 10
SUBJECT: Inferential Statistics

MODEL_ANSWER:
The central limit theorem states that the sampling distribution
of the mean approaches a normal distribution as sample size
increases, regardless of the population's distribution.
END_MODEL_ANSWER`;

const FAQ = [
    {
        q: 'What if I omit the #BLUEPRINT header?',
        a: 'Items are still imported into the selected bank. No draft blueprint is created — the "create blueprint" toggle will produce a blueprint with an auto-generated title.',
    },
    {
        q: 'Where do imported questions go?',
        a: 'All imported items are added as new DRAFT versions in your default item bank. Use the Library tab to browse, filter, and edit them.',
    },
    {
        q: 'What happens if I import duplicate questions?',
        a: 'Duplicate stems produce a warning but the import still proceeds. Each import creates new Learning Objects — no deduplication is performed.',
    },
    {
        q: 'Are LaTeX formulas supported?',
        a: 'Yes. LaTeX math (e.g. $\\mu = \\bar{x}$) inside stems is preserved as-is and will render via KaTeX once that feature ships.',
    },
    {
        q: 'What is the maximum number of questions?',
        a: 'Up to 200 questions per import. Split larger exams into multiple pastes.',
    },
];

interface Props {
    onClose: () => void;
}

type Tab = 'reference' | 'example' | 'faq';

export default function FormatGuideModal({ onClose }: Props) {
    const [tab, setTab] = useState<Tab>('reference');
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
        >
            <div className="w-full max-w-2xl rounded-2xl border border-shell-border bg-shell-surface shadow-elevated flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-shell-border shrink-0">
                    <h2 className="text-h3 text-foreground font-semibold">Import Format Guide</h2>
                    <button
                        onClick={onClose}
                        className="text-shell-muted-dim hover:text-foreground transition-colors focus-ring rounded"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-6 pt-3 shrink-0">
                    {(['reference', 'example', 'faq'] as Tab[]).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-ring ${
                                tab === t
                                    ? 'bg-brand text-white'
                                    : 'text-shell-muted hover:text-foreground hover:bg-shell-input'
                            }`}
                        >
                            {t === 'reference' ? 'Quick Reference' : t === 'example' ? 'Full Example' : 'FAQ'}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {tab === 'reference' && (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left border-b border-shell-border">
                                    <th className="pb-2 text-shell-muted font-medium w-36">Token</th>
                                    <th className="pb-2 text-shell-muted font-medium w-20">Required</th>
                                    <th className="pb-2 text-shell-muted font-medium">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {QUICK_REFERENCE.map((row) => (
                                    <tr key={row.token} className="border-b border-shell-border/50">
                                        <td className="py-2 pr-4">
                                            <code className="text-brand text-xs bg-shell-input px-1.5 py-0.5 rounded font-mono">
                                                {row.token}
                                            </code>
                                        </td>
                                        <td className="py-2 pr-4">
                                            {row.required
                                                ? <Badge tone="danger" size="sm">Yes</Badge>
                                                : <Badge tone="neutral" size="sm">No</Badge>
                                            }
                                        </td>
                                        <td className="py-2 text-foreground">{row.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {tab === 'example' && (
                        <pre className="text-xs font-mono bg-shell-input rounded-xl p-4 overflow-x-auto text-foreground leading-relaxed whitespace-pre">
                            {FULL_EXAMPLE}
                        </pre>
                    )}

                    {tab === 'faq' && (
                        <div className="space-y-4">
                            {FAQ.map((item) => (
                                <div key={item.q} className="border border-shell-border rounded-xl p-4 bg-shell-input/30">
                                    <p className="font-medium text-foreground mb-1">{item.q}</p>
                                    <p className="text-sm text-shell-muted">{item.a}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-shell-border shrink-0 flex justify-between items-center">
                    <a
                        href="/import-template.txt"
                        download
                        className="text-sm text-brand hover:underline focus-ring rounded"
                    >
                        Download template (.txt)
                    </a>
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </div>
    );
}

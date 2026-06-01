'use client';

import { useState, ReactNode } from 'react';
import Modal from '@/components/ui/Modal';

// An "i" button that opens an explanatory modal: what the section is, why it
// exists, and a concrete example. Used in every integrations section header so
// an admin who has never wired Canvas/Osiris/QTI knows what to do.

interface InfoSection {
    heading: string;
    body: ReactNode;
}

export interface IntegrationInfoContent {
    title: string;
    sections: InfoSection[];
}

function InfoIcon({ size = 15 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 7v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="8" cy="4.8" r="0.85" fill="currentColor" />
        </svg>
    );
}

export default function IntegrationInfo({ content }: { content: IntegrationInfoContent }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={`About ${content.title}`}
                title={`About ${content.title}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-shell-border text-shell-muted hover:text-brand hover:border-brand transition-colors"
            >
                <InfoIcon />
            </button>
            <Modal isOpen={open} onClose={() => setOpen(false)} title={content.title} size="lg">
                <div className="space-y-5">
                    {content.sections.map((s) => (
                        <section key={s.heading}>
                            <h3 className="text-meta font-semibold uppercase tracking-eyebrow text-shell-muted-dim mb-1.5">
                                {s.heading}
                            </h3>
                            <div className="text-body text-foreground space-y-2 leading-relaxed">
                                {s.body}
                            </div>
                        </section>
                    ))}
                </div>
            </Modal>
        </>
    );
}

// Small helpers so the content below reads cleanly and stays token-compliant.
function Code({ children }: { children: ReactNode }) {
    return (
        <code className="rounded-md bg-shell-input px-1.5 py-0.5 text-meta text-foreground">
            {children}
        </code>
    );
}
function Steps({ items }: { items: ReactNode[] }) {
    return (
        <ol className="list-decimal pl-5 space-y-1 text-shell-muted">
            {items.map((it, i) => (
                <li key={i}>{it}</li>
            ))}
        </ol>
    );
}

export const LTI_INFO: IntegrationInfoContent = {
    title: 'LTI 1.3 — Canvas single sign-on & deep linking',
    sections: [
        {
            heading: 'What it is',
            body: (
                <p className="text-shell-muted">
                    LTI 1.3 is the IMS standard that lets a Learning Management System
                    (Canvas) launch OpenVision exams without a second login. A student
                    clicks an assignment in Canvas and lands directly in the exam, already
                    authenticated.
                </p>
            ),
        },
        {
            heading: 'Why it is here',
            body: (
                <p className="text-shell-muted">
                    Universities run their courses from Canvas. This bridge means
                    instructors place OpenVision exams inside their existing Canvas course,
                    rosters resolve automatically, and grades can flow back — no manual
                    account or link juggling.
                </p>
            ),
        },
        {
            heading: 'How to set it up',
            body: (
                <Steps
                    items={[
                        <>In Canvas, create a Developer Key (LTI). Copy its Client ID,
                        issuer, and the auth/token/JWKS URLs.</>,
                        <>Register a platform below with those values, plus the deployment
                        IDs Canvas assigns.</>,
                        <>Point Canvas at our endpoints: login <Code>/api/lti/login</Code>,
                        launch <Code>/api/lti/launch</Code>, JWKS <Code>/api/lti/jwks</Code>.</>,
                        <>The first launch from a Canvas course records an <em>unmapped</em>
                        context and resource link — bind those to an OpenVision course and
                        scheduled session below.</>,
                    ]}
                />
            ),
        },
        {
            heading: 'Example',
            body: (
                <p className="text-shell-muted">
                    A lecturer adds “Midterm” in Canvas, picks it via deep linking, and binds
                    it to your scheduled session <Code>CS-202 Midterm</Code>. Students launch
                    from Canvas; when results are published you push grades back to the Canvas
                    gradebook from the Grade passbacks table.
                </p>
            ),
        },
    ],
};

export const SIS_INFO: IntegrationInfoContent = {
    title: 'SIS / Osiris — rosters, accommodations, grades',
    sections: [
        {
            heading: 'What it is',
            body: (
                <p className="text-shell-muted">
                    A Student Information System (Osiris at VU) is the system of record for
                    enrolments and grades. This panel imports CSVs exported from it and
                    exports a grade CSV back in a compatible shape.
                </p>
            ),
        },
        {
            heading: 'Why it is here',
            body: (
                <p className="text-shell-muted">
                    It avoids retyping hundreds of students by hand and keeps OpenVision in
                    step with the official roster. Accommodations imported here reuse the
                    same audited write path as the manual editor.
                </p>
            ),
        },
        {
            heading: 'Roster CSV',
            body: (
                <>
                    <p className="text-shell-muted">Columns (exact header):</p>
                    <p><Code>course_code,vunet_id,email,first_name,last_name,role,is_active</Code></p>
                    <p className="text-shell-muted">
                        <Code>role</Code> is <Code>student</Code> or <Code>constructor</Code>;
                        unknown users are provisioned with an unusable password. Tick “Create
                        missing courses” if a code isn’t in OpenVision yet.
                    </p>
                </>
            ),
        },
        {
            heading: 'Accommodation CSV',
            body: (
                <>
                    <p><Code>vunet_id,provision_time_multiplier,enlarged_display</Code></p>
                    <p className="text-shell-muted">
                        Multiplier is 1.0–3.0 (1.5 = 90 min for a 60 min exam). The
                        <Code>enlarged_display</Code> column is accepted for format
                        compatibility but display options are now self-service for students
                        during the exam.
                    </p>
                </>
            ),
        },
        {
            heading: 'Grade export',
            body: (
                <p className="text-shell-muted">
                    Requires at least a course or scheduled-session filter (no unbounded
                    dumps). Exports published results only, grades — never student answers.
                </p>
            ),
        },
    ],
};

export const QTI_INFO: IntegrationInfoContent = {
    title: 'QTI 2.1 — portable question packages',
    sections: [
        {
            heading: 'What it is',
            body: (
                <p className="text-shell-muted">
                    QTI (Question &amp; Test Interoperability) is the IMS XML standard for
                    exchanging questions between assessment tools. A package is a ZIP with an
                    <Code>imsmanifest.xml</Code> and one XML file per item.
                </p>
            ),
        },
        {
            heading: 'Why it is here',
            body: (
                <p className="text-shell-muted">
                    So your content isn’t trapped in OpenVision. You can export a bank to move
                    or back it up, and import question sets authored elsewhere instead of
                    retyping them.
                </p>
            ),
        },
        {
            heading: 'Supported types',
            body: (
                <p className="text-shell-muted">
                    Multiple choice, multiple response, and essay. Unsupported interactions
                    (hotspot, drag-and-drop, adaptive) are <em>reported</em> per item on
                    import, never silently dropped.
                </p>
            ),
        },
        {
            heading: 'How to use it',
            body: (
                <Steps
                    items={[
                        <>Export: select individual questions, paste an item bank ID, or paste
                        a blueprint ID and download the <Code>.zip</Code>.</>,
                        <>Import: upload a <Code>.zip</Code> or single <Code>.xml</Code>, run a
                        <strong> Dry run</strong> first to validate it without saving anything.</>,
                        <>If the report looks right, set a target bank ID and
                        <strong> Commit import</strong> to create the questions as drafts.</>,
                    ]}
                />
            ),
        },
        {
            heading: 'Example',
            body: (
                <p className="text-shell-muted">
                    Export bank <Code>bebb4cfd-…</Code>, hand the ZIP to a colleague on another
                    system, or re-import it into a fresh bank here. Round-tripping preserves
                    prompts, choices, and correct answers.
                </p>
            ),
        },
    ],
};

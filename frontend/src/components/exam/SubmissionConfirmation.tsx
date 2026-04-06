'use client';

import Link from 'next/link';

interface SubmissionConfirmationProps {
    submittedAt: string | null;
    returnPath: string;
}

/**
 * Post-submission confirmation page shown after the student
 * successfully submits their exam.
 */
export default function SubmissionConfirmation({ submittedAt, returnPath }: SubmissionConfirmationProps) {
    const formattedTime = submittedAt
        ? new Date(submittedAt.endsWith('Z') ? submittedAt : `${submittedAt}Z`).toLocaleString()
        : 'Just now';
    const returnLabel = returnPath === '/my-exams' ? 'Back to My Exams' : 'Back to Session Manager';

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-8">
            <div className="max-w-md w-full text-center space-y-8">
                {/* Success Icon */}
                <div className="w-20 h-20 mx-auto bg-emerald-500/20 border-2 border-emerald-400 rounded-full flex items-center justify-center">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-10 h-10 text-emerald-400"
                    >
                        <path
                            fillRule="evenodd"
                            d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
                            clipRule="evenodd"
                        />
                    </svg>
                </div>

                {/* Message */}
                <div className="space-y-3">
                    <h1 className="text-2xl font-bold text-emerald-400">Exam Submitted Successfully</h1>
                    <p className="text-gray-400">
                        Your answers have been recorded. Use the button below to return to your home screen.
                    </p>
                </div>

                {/* Details */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-3 text-left">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Submitted at</span>
                        <span className="text-gray-300">{formattedTime}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Status</span>
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs font-semibold">
                            SUBMITTED
                        </span>
                    </div>
                </div>

                <div className="space-y-3">
                    <Link
                        href={returnPath}
                        className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
                    >
                        {returnLabel}
                    </Link>
                    <p className="text-xs text-gray-500">
                        Results will be available once your instructor publishes them.
                    </p>
                </div>
            </div>
        </div>
    );
}

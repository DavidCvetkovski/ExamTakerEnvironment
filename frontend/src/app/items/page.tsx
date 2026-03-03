'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuthStore } from '@/stores/useAuthStore';
import { useLibraryStore } from '@/stores/useLibraryStore';

export default function ItemsLibraryPage() {
    const router = useRouter();
    const user = useAuthStore(state => state.user);
    const { items, isLoading, error, fetchItems, createItem } = useLibraryStore();
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const handleCreateNew = async () => {
        setIsCreating(true);
        try {
            const newId = await createItem();
            router.push(`/author?lo_id=${newId}`);
        } catch (err) {
            console.error(err);
        } finally {
            setIsCreating(false);
        }
    };

    const StatusBadge = ({ status }: { status: string }) => {
        const colors: Record<string, string> = {
            DRAFT: 'bg-gray-100 text-gray-800 border-gray-200',
            READY_FOR_REVIEW: 'bg-yellow-50 text-yellow-800 border-yellow-200',
            APPROVED: 'bg-green-50 text-green-800 border-green-200',
            RETIRED: 'bg-red-50 text-red-800 border-red-200',
        };
        const color = colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
        return (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${color}`}>
                {status.replace(/_/g, ' ')}
            </span>
        );
    };

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8">
                <main className="w-full max-w-6xl space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Question Library</h1>
                            <p className="mt-1 text-sm text-gray-500">Manage and create learning objects</p>
                        </div>
                        <div className="mt-4 sm:mt-0 flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={() => router.push('/blueprint')}
                                className="inline-flex items-center justify-center rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
                            >
                                <svg className="-ml-0.5 mr-1.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Test Blueprints
                            </button>
                            <button
                                onClick={handleCreateNew}
                                disabled={isCreating}
                                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 transition-colors"
                            >
                                {isCreating ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <svg className="-ml-0.5 mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                        </svg>
                                        Create New Question
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Table Area */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        {error && (
                            <div className="p-4 bg-red-50 border-b border-red-100 text-red-600 text-sm">
                                {typeof error === 'string' ? error : 'An error occurred while loading items.'}
                            </div>
                        )}

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preview</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                                        <th scope="col" className="relative px-6 py-3">
                                            <span className="sr-only">Edit</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {isLoading && items.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">
                                                Loading library items...
                                            </td>
                                        </tr>
                                    ) : items.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">
                                                No questions found. Click "Create New Question" to get started.
                                            </td>
                                        </tr>
                                    ) : (
                                        items.map((item) => (
                                            <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900 truncate max-w-[200px]" title={item.latest_content_preview}>
                                                        {item.latest_content_preview || 'Empty Question'}
                                                    </div>
                                                    <div className="text-xs text-gray-500 font-mono mt-0.5" title={item.id}>
                                                        ID: {item.id.substring(0, 8)}...
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-600">
                                                        {item.latest_question_type === 'MULTIPLE_CHOICE' ? 'MCQ' : 'Essay'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-600 flex items-center gap-1.5">
                                                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                                        </svg>
                                                        v{item.latest_version_number}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <StatusBadge status={item.latest_status} />
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {new Date(item.created_at).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button
                                                        onClick={() => router.push(`/author?lo_id=${item.id}`)}
                                                        className="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                                        </svg>
                                                        Edit
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}

import { api } from '@/lib/api';

/** Fetch a binary endpoint with auth and trigger a browser download. */
export async function downloadFile(
    url: string,
    filename: string,
    params?: Record<string, unknown>
): Promise<void> {
    const res = await api.get(url, { params, responseType: 'blob' });
    const href = URL.createObjectURL(res.data as Blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
}

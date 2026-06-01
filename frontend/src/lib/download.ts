import { api } from '@/lib/api';

function triggerDownload(blob: Blob, filename: string): void {
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
}

/** GET a binary endpoint with auth and trigger a browser download. */
export async function downloadFile(
    url: string,
    filename: string,
    params?: Record<string, unknown>
): Promise<void> {
    const res = await api.get(url, { params, responseType: 'blob' });
    triggerDownload(res.data as Blob, filename);
}

/** POST a JSON body to a binary endpoint and trigger a browser download. */
export async function downloadPost(
    url: string,
    filename: string,
    body: unknown
): Promise<void> {
    const res = await api.post(url, body, { responseType: 'blob' });
    triggerDownload(res.data as Blob, filename);
}

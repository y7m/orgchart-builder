import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { PhotoLoader, initials, setPhotoLoader, usePhoto } from '../src/datasource/photos';

const b64 = btoa('fakejpeg');

const batchFetch = (handler: (ids: string[]) => { status: number; headers?: Record<string, string> }[]) =>
  vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init!.body)) as { requests: { id: string; url: string }[] };
    const ids = body.requests.map((r) => decodeURIComponent(r.url.split('/')[2]));
    const res = handler(ids);
    return new Response(JSON.stringify({
      responses: body.requests.map((r, i) => ({
        id: r.id, status: res[i].status, headers: res[i].headers ?? { 'Content-Type': 'image/jpeg' },
        body: res[i].status === 200 ? b64 : { error: { code: 'ImageNotFound' } },
      })),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

afterEach(() => setPhotoLoader(null));

describe('PhotoLoader', () => {
  it('batches 20 per $batch request, <=4 concurrent; 404 => null', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const inner = batchFetch((ids) => ids.map((id) => ({ status: Number(id) % 2 ? 404 : 200 })));
    const f = vi.fn(async (u: string, i?: RequestInit) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      try { return await inner(u, i); } finally { inFlight--; }
    });
    let n = 0;
    const revoke = vi.fn();
    const l = new PhotoLoader({ getToken: async () => 't', fetch: f, createObjectURL: () => `blob:${n++}`, revokeObjectURL: revoke });
    const ids = Array.from({ length: 130 }, (_, i) => String(i));
    l.request(ids);
    l.request(ids); // deduped
    await l.idle();
    expect(f).toHaveBeenCalledTimes(7); // ceil(130/20)
    expect(maxInFlight).toBeLessThanOrEqual(4);
    const firstBody = JSON.parse(String(f.mock.calls[0][1]!.body));
    expect(firstBody.requests).toHaveLength(20);
    expect(firstBody.requests[0].url).toBe('/users/0/photos/96x96/$value');
    expect(String(f.mock.calls[0][0])).toBe('https://graph.microsoft.com/v1.0/$batch');
    expect(l.get('0')).toMatch(/^blob:/);
    expect(l.get('1')).toBeNull();
    l.clear();
    expect(revoke).toHaveBeenCalledTimes(65);
    expect(l.get('0')).toBeUndefined();
  });

  it('retries throttled items with Retry-After', async () => {
    let calls = 0;
    const f = batchFetch((ids) => ids.map(() => (calls++ === 0 ? { status: 429, headers: { 'Retry-After': '2' } } : { status: 200 })));
    const sleep = vi.fn(async () => {});
    const l = new PhotoLoader({ getToken: async () => 't', fetch: f, sleep, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    l.request('u1');
    await l.idle();
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(l.get('u1')).toBe('blob:x');
  });

  it('usePhoto triggers lazy load and re-renders', async () => {
    const f = batchFetch((ids) => ids.map(() => ({ status: 200 })));
    const l = new PhotoLoader({ getToken: async () => 't', fetch: f, createObjectURL: () => 'blob:p', revokeObjectURL: () => {} });
    setPhotoLoader(l);
    const P = ({ id }: { id: string }) => {
      const url = usePhoto(id);
      return <span data-testid="p">{url === undefined ? 'loading' : url ?? initials('Ann Lee')}</span>;
    };
    render(<P id="abc" />);
    expect(screen.getByTestId('p')).toHaveTextContent('loading');
    await act(async () => { await l.idle(); });
    expect(screen.getByTestId('p')).toHaveTextContent('blob:p');
  });

  it('initials', () => {
    expect(initials('Ann Marie Lee')).toBe('AL');
    expect(initials('  cher ')).toBe('C');
    expect(initials('')).toBe('?');
  });
});

import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { workerSource } from './worker-source.ts'
import type { WorkerManifest } from './worker-source.ts'

const ORIGIN = 'https://app.test'

type Listener = (event: unknown) => void
type Stores = Map<string, Map<string, string>>

class FakeRequest {
  url: string
  mode = 'cors'
  method = 'GET'
  constructor(input: string | { url: string }) {
    this.url = new URL(
      typeof input === 'string' ? input : input.url,
      ORIGIN,
    ).href
  }
}

function okResponse() {
  return {
    ok: true,
    headers: new Headers({ 'content-type': 'text/javascript' }),
    clone() {
      return this
    },
  }
}

/** Just enough of a service worker scope and the Cache API to run the worker. */
function createWorker(manifest: WorkerManifest, stores: Stores) {
  const fetched: string[] = []
  const listeners = new Map<string, Listener>()
  const fetchFn = (request: FakeRequest) => {
    fetched.push(new URL(request.url).pathname)
    return Promise.resolve(okResponse())
  }
  const open = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const store = stores.get(name) as Map<string, string>
    return {
      keys: () =>
        Promise.resolve([...store.keys()].map((url) => new FakeRequest(url))),
      addAll: async (requests: FakeRequest[] | string[]) => {
        for (const request of requests) {
          const { url } = new FakeRequest(request)
          await fetchFn(new FakeRequest(url))
          store.set(url, url)
        }
      },
      put: (request: FakeRequest) => {
        store.set(request.url, request.url)
        return Promise.resolve()
      },
      match: (request: FakeRequest) => {
        const hit = store.get(request.url)
        return Promise.resolve(hit ? { cached: hit } : undefined)
      },
      delete: (request: FakeRequest) =>
        Promise.resolve(store.delete(request.url)),
    }
  }
  const self = {
    location: { origin: ORIGIN },
    clients: { claim: () => Promise.resolve() },
    addEventListener: (type: string, listener: Listener) =>
      listeners.set(type, listener),
  }
  const caches = {
    open: (name: string) => Promise.resolve(open(name)),
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name: string) => Promise.resolve(stores.delete(name)),
    match: (request: FakeRequest | string, options?: { cacheName: string }) => {
      const hit = stores
        .get(options?.cacheName ?? '')
        ?.get(new FakeRequest(request as string).url)
      return Promise.resolve(hit ? { cached: hit } : undefined)
    },
  }
  runInNewContext(workerSource(manifest), {
    self,
    caches,
    Request: FakeRequest,
    URL,
    Set,
    Promise,
    fetch: fetchFn,
  })
  const run = async (type: string, event: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = []
    const result: { response?: Promise<unknown> } = {}
    listeners.get(type)?.({
      ...event,
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      respondWith: (promise: Promise<unknown>) => (result.response = promise),
    })
    await Promise.all(waits)
    return result.response ? await result.response : undefined
  }
  return { run, fetched }
}

const manifest = (version: string, assets: string[]): WorkerManifest => ({
  version,
  shell: '/_shell.html',
  shellFiles: ['/manifest.webmanifest'],
  assets,
  precache: assets.slice(0, 2),
})

const paths = (store?: Map<string, string>) =>
  [...(store?.keys() ?? [])].map((url) => new URL(url).pathname).sort()

describe('generated worker', () => {
  it('on a second install fetches only the assets it does not have, then prunes', async () => {
    const stores: Stores = new Map()
    const first = createWorker(
      manifest('v1', ['/assets/a-1.js', '/assets/b-1.js', '/assets/lazy-1.js']),
      stores,
    )
    await first.run('install')
    await first.run('activate')
    expect(first.fetched.sort()).toEqual([
      '/_shell.html',
      '/assets/a-1.js',
      '/assets/b-1.js',
      '/manifest.webmanifest',
    ])
    expect([...stores.keys()].sort()).toEqual(['assets', 'shell-v1'])

    // A lazy chunk is cached the first time it is asked for.
    await first.run('fetch', { request: new FakeRequest('/assets/lazy-1.js') })
    expect(paths(stores.get('assets'))).toContain('/assets/lazy-1.js')

    // b changed, a did not, and the lazy chunk is gone from the build.
    const second = createWorker(
      manifest('v2', ['/assets/a-1.js', '/assets/b-2.js']),
      stores,
    )
    await second.run('install')
    expect(second.fetched.sort()).toEqual([
      '/_shell.html',
      '/assets/b-2.js',
      '/manifest.webmanifest',
    ])
    // Until it activates, the old version's files stay.
    expect(paths(stores.get('assets'))).toHaveLength(4)
    await second.run('activate')
    expect([...stores.keys()].sort()).toEqual(['assets', 'shell-v2'])
    expect(paths(stores.get('assets'))).toEqual([
      '/assets/a-1.js',
      '/assets/b-2.js',
    ])
  })

  it('serves hashed assets cache-first and leaves other requests to the network', async () => {
    const stores: Stores = new Map()
    const worker = createWorker(
      manifest('v1', ['/assets/a-1.js', '/assets/b-1.js']),
      stores,
    )
    await worker.run('install')
    worker.fetched.length = 0
    const cached = await worker.run('fetch', {
      request: new FakeRequest('/assets/a-1.js'),
    })
    expect(cached).toEqual({ cached: new URL('/assets/a-1.js', ORIGIN).href })
    expect(worker.fetched).toEqual([])
    // Not a hashed asset or a shell file: the worker stays out of it.
    const other = await worker.run('fetch', {
      request: new FakeRequest('/fonts/x.woff'),
    })
    expect(other).toBeUndefined()
  })
})

import { describe, it, expect } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { setTimeout } from 'timers/promises'
import { createRequestsCaptureHandler, RequestCapturer, type CapturedRequest } from '../src/index'
import { SeededRandom } from '../src/test-utils'
import { executeRequestsRandomly } from './test-helpers'

describe('ランダムタイミングでの通信安定性テスト (Seed固定)', () => {
  // 複数のseedでテストを実行
  const testSeeds = [12345, 67890, 98765, 24680, 13579]

  it.each(testSeeds)('seed %d: ランダムタイミングで複数リクエストを実行しても結果が一定になる', async (seed) => {
    const capturedRequests: CapturedRequest[] = []
    
    // キャプチャラーを作成
    const capturer = new RequestCapturer((requests) => {
      capturedRequests.push(...requests)
    })
    
    // 複数のハンドラーを設定
    const getUserHandler = http.get('https://api.example.com/users/:id', ({ params }) => {
      return HttpResponse.json({ id: params.id, name: `ユーザー${params.id}` })
    })
    
    const getPostsHandler = http.get('https://api.example.com/posts', () => {
      return HttpResponse.json([{ id: 1, title: '投稿1' }])
    })
    
    const postDataHandler = http.post('https://api.example.com/data', async ({ request }) => {
      const body = await request.json()
      return HttpResponse.json({ success: true, receivedData: body })
    })
    
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
    const server = setupServer(captureHandler, getUserHandler, getPostsHandler, postDataHandler)
    server.listen()
    
    try {
      const rng = new SeededRandom(seed)
      
      // 複数のリクエストを定義
      const requests = [
        { url: 'https://api.example.com/users/1' },
        { url: 'https://api.example.com/users/2' },
        { url: 'https://api.example.com/posts' },
        { url: 'https://api.example.com/data', method: 'POST', body: { test: 'data1' } },
        { url: 'https://api.example.com/users/3' },
        { url: 'https://api.example.com/data', method: 'POST', body: { test: 'data2' } }
      ]
      
      // ランダムなタイミングでリクエストを実行
      await executeRequestsRandomly(rng, requests)
      
      // チェックポイントを実行
      capturer.checkpoint()
      
      // 結果の検証（seed固定により常に同じ結果になる）
      expect(capturedRequests).toHaveLength(6)
      
      // 結果をURL・メソッドでグループ化して検証
      // 同じURL・メソッドの場合、リクエストの順序は実行順によって変わる可能性がある
      
      // リクエストをグループ分けして検証
      const postRequests = capturedRequests.filter(req => req.method === 'POST')
      const getRequests = capturedRequests.filter(req => req.method === 'GET')
      
      // POSTリクエストの検証
      expect(postRequests).toHaveLength(2)
      expect(postRequests.every(req => req.url === 'https://api.example.com/data')).toBe(true)
      
      const postBodies = postRequests.map(req => req.body).sort()
      const expectedBodies = ['{"test":"data1"}', '{"test":"data2"}'].sort()
      expect(postBodies).toEqual(expectedBodies)
      
      // GETリクエストの検証
      expect(getRequests).toHaveLength(4)
      const getUrls = getRequests.map(req => req.url).sort()
      const expectedGetUrls = [
        'https://api.example.com/posts',
        'https://api.example.com/users/1',
        'https://api.example.com/users/2',
        'https://api.example.com/users/3'
      ].sort()
      expect(getUrls).toEqual(expectedGetUrls)
      
      // ソート順序の検証（URLでソートされている）
      for (let i = 0; i < capturedRequests.length - 1; i++) {
        const current = capturedRequests[i]
        const next = capturedRequests[i + 1]
        const currentKey = `${current.url}:${current.method}`
        const nextKey = `${next.url}:${next.method}`
        expect(currentKey.localeCompare(nextKey)).toBeLessThanOrEqual(0)
      }
    } finally {
      server.close()
    }
  })

  it.each(testSeeds)('seed %d: 自動チェックポイント機能でもランダムタイミングで一定の結果になる', async (seed) => {
    const capturedGroups: CapturedRequest[][] = []
    
    // 自動チェックポイントを50msで設定
    const capturer = new RequestCapturer((requests) => {
      capturedGroups.push([...requests])
    }, { timeoutMs: 50 })
    
    const userHandler = http.get('https://api.example.com/users/:id', ({ params }) => {
      return HttpResponse.json({ id: params.id, name: `ユーザー${params.id}` })
    })
    
    const postHandler = http.post('https://api.example.com/events', async ({ request }) => {
      const body = await request.json()
      return HttpResponse.json({ eventId: Math.random(), data: body })
    })
    
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
    const server = setupServer(captureHandler, userHandler, postHandler)
    server.listen()
    
    try {
      const rng = new SeededRandom(seed)
      
      // 第1グループのリクエスト
      const firstBatch = [
        { url: 'https://api.example.com/users/1' },
        { url: 'https://api.example.com/events', method: 'POST', body: { event: 'login' } },
        { url: 'https://api.example.com/users/2' }
      ]
      
      await executeRequestsRandomly(rng, firstBatch)
      
      // 自動チェックポイントが実行されるまで待機
      await setTimeout(70)
      
      // 第2グループのリクエスト
      const secondBatch = [
        { url: 'https://api.example.com/users/3' },
        { url: 'https://api.example.com/events', method: 'POST', body: { event: 'logout' } }
      ]
      
      await executeRequestsRandomly(rng, secondBatch)
      
      // 第2グループの自動チェックポイントが実行されるまで待機
      await setTimeout(70)
      
      // 結果の検証
      expect(capturedGroups).toHaveLength(2)
      
      // 第1グループの検証
      expect(capturedGroups[0]).toHaveLength(3)
      expect(capturedGroups[0][0].method).toBe('POST')
      expect(capturedGroups[0][0].url).toBe('https://api.example.com/events')
      expect(capturedGroups[0][0].body).toBe('{"event":"login"}')
      expect(capturedGroups[0][1].method).toBe('GET')
      expect(capturedGroups[0][1].url).toBe('https://api.example.com/users/1')
      expect(capturedGroups[0][2].method).toBe('GET')
      expect(capturedGroups[0][2].url).toBe('https://api.example.com/users/2')
      
      // 第2グループの検証
      expect(capturedGroups[1]).toHaveLength(2)
      expect(capturedGroups[1][0].method).toBe('POST')
      expect(capturedGroups[1][0].url).toBe('https://api.example.com/events')
      expect(capturedGroups[1][0].body).toBe('{"event":"logout"}')
      expect(capturedGroups[1][1].method).toBe('GET')
      expect(capturedGroups[1][1].url).toBe('https://api.example.com/users/3')
    } finally {
      server.close()
    }
  })

  it.each(testSeeds)('seed %d: 大量のリクエストでもランダムタイミングで安定した結果になる', async (seed) => {
    const capturedRequests: CapturedRequest[] = []
    
    // キャプチャラーを作成
    const capturer = new RequestCapturer((requests) => {
      capturedRequests.push(...requests)
    })
    
    // ハンドラーを設定
    const userHandler = http.get('https://api.example.com/users/:id', ({ params }) => {
      return HttpResponse.json({ id: params.id })
    })
    
    const dataHandler = http.post('https://api.example.com/data/:type', async ({ params, request }) => {
      const body = await request.json()
      return HttpResponse.json({ type: params.type, data: body })
    })
    
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
    const server = setupServer(captureHandler, userHandler, dataHandler)
    server.listen()
    
    try {
      const rng = new SeededRandom(seed)
      
      // 大量のリクエストを生成
      const requests = []
      
      // GETリクエストを10個
      for (let i = 1; i <= 10; i++) {
        requests.push({ url: `https://api.example.com/users/${i}` })
      }
      
      // POSTリクエストを5個
      for (let i = 1; i <= 5; i++) {
        requests.push({ 
          url: `https://api.example.com/data/type${i}`, 
          method: 'POST', 
          body: { value: i * 10 } 
        })
      }
      
      // ランダムなタイミングで全リクエストを実行
      await executeRequestsRandomly(rng, requests)
      
      // チェックポイントを実行
      capturer.checkpoint()
      
      // 結果の検証
      expect(capturedRequests).toHaveLength(15)
      
      // POSTリクエストがすべて最初に来ることを確認（URLソート順）
      for (let i = 0; i < 5; i++) {
        expect(capturedRequests[i].method).toBe('POST')
        expect(capturedRequests[i].url).toBe(`https://api.example.com/data/type${i + 1}`)
        expect(capturedRequests[i].body).toBe(`{"value":${(i + 1) * 10}}`)
      }
      
      // GETリクエストが後に来ることを確認（URLソート順）
      // 文字列ソートによる順序: users/1, users/10, users/2, users/3, ..., users/9
      const expectedUserUrls = [
        'https://api.example.com/users/1',
        'https://api.example.com/users/10',
        'https://api.example.com/users/2',
        'https://api.example.com/users/3',
        'https://api.example.com/users/4',
        'https://api.example.com/users/5',
        'https://api.example.com/users/6',
        'https://api.example.com/users/7',
        'https://api.example.com/users/8',
        'https://api.example.com/users/9'
      ]
      
      for (let i = 5; i < 15; i++) {
        expect(capturedRequests[i].method).toBe('GET')
        expect(capturedRequests[i].url).toBe(expectedUserUrls[i - 5])
        expect(capturedRequests[i].body).toBeUndefined()
      }
    } finally {
      server.close()
    }
  })

  it.each(testSeeds)('seed %d: 同時実行的なリクエストでもソート順が安定する', async (seed) => {
    const capturedRequests: CapturedRequest[] = []
    
    // キャプチャラーを作成
    const capturer = new RequestCapturer((requests) => {
      capturedRequests.push(...requests)
    })
    
    // ハンドラーを設定
    const aHandler = http.get('https://api.example.com/a', () => HttpResponse.json({ service: 'a' }))
    const bHandler = http.get('https://api.example.com/b', () => HttpResponse.json({ service: 'b' }))
    const cHandler = http.post('https://api.example.com/a', () => HttpResponse.json({ service: 'a', method: 'post' }))
    const dHandler = http.post('https://api.example.com/b', () => HttpResponse.json({ service: 'b', method: 'post' }))
    
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
    const server = setupServer(captureHandler, aHandler, bHandler, cHandler, dHandler)
    server.listen()
    
    try {
      const rng = new SeededRandom(seed)
      
      // 同じURLに対するGET/POSTリクエストを混在
      const requests = [
        { url: 'https://api.example.com/b', method: 'POST' },
        { url: 'https://api.example.com/a' }, // GET
        { url: 'https://api.example.com/b' }, // GET  
        { url: 'https://api.example.com/a', method: 'POST' }
      ]
      
      // ランダムタイミングで実行
      await executeRequestsRandomly(rng, requests)
      
      // チェックポイントを実行
      capturer.checkpoint()
      
      // 結果の検証（URL優先、同URL内ではメソッド名でソート）
      expect(capturedRequests).toHaveLength(4)
      
      // 期待される順序: a-GET, a-POST, b-GET, b-POST
      expect(capturedRequests[0].url).toBe('https://api.example.com/a')
      expect(capturedRequests[0].method).toBe('GET')
      
      expect(capturedRequests[1].url).toBe('https://api.example.com/a')
      expect(capturedRequests[1].method).toBe('POST')
      
      expect(capturedRequests[2].url).toBe('https://api.example.com/b')
      expect(capturedRequests[2].method).toBe('GET')
      
      expect(capturedRequests[3].url).toBe('https://api.example.com/b')
      expect(capturedRequests[3].method).toBe('POST')
    } finally {
      server.close()
    }
  })
})
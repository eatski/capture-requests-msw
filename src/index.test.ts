import { describe, it, expect } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { createRequestsCaptureHandler, RequestCapturer, type CapturedRequest } from './index'
import { SeededRandom } from './test-utils'

// ランダムな遅延を追加するヘルパー関数
async function randomDelay(rng: SeededRandom, minMs: number = 1, maxMs: number = 50): Promise<void> {
  const delay = rng.nextInt(minMs, maxMs)
  await new Promise(resolve => setTimeout(resolve, delay))
}

// 複数のHTTPリクエストをランダムなタイミングで実行するヘルパー関数
async function executeRequestsRandomly(
  rng: SeededRandom,
  requests: Array<{ url: string; method?: string; body?: any }>
): Promise<Response[]> {
  // リクエストの順序をシャッフル
  const shuffledRequests = rng.shuffle(requests)
  
  // 各リクエストをランダムな遅延で実行
  const responsePromises = shuffledRequests.map(async (req, index) => {
    // 最初のリクエスト以外はランダムな遅延を追加
    if (index > 0) {
      await randomDelay(rng)
    }
    
    const options: RequestInit = {
      method: req.method || 'GET'
    }
    
    if (req.body) {
      options.headers = { 'Content-Type': 'application/json' }
      options.body = JSON.stringify(req.body)
    }
    
    return fetch(req.url, options)
  })
  
  return Promise.all(responsePromises)
}

describe('Capture Requests MSW Library Tests', () => {
  it('リクエストをキャプチャしてfallthroughで他のハンドラーに委譲する', async () => {
    const capturedRequests: CapturedRequest[] = []
    
    // キャプチャラーを作成
    const capturer = new RequestCapturer((requests) => {
      capturedRequests.push(...requests)
    })
    
    // ユーザー側で定義するカスタムハンドラー
    const userHandler = http.get('https://api.example.com/users', () => {
      return HttpResponse.json({ id: 1, name: 'テストユーザー' })
    })
    
    // キャプチャハンドラーを最初に、ユーザーハンドラーを後に配置
    const captureHandler = createRequestsCaptureHandler(capturer)
    const server = setupServer(captureHandler, userHandler)
    server.listen()
    
    try {
      const response = await fetch('https://api.example.com/users')
      const data = await response.json()
      
      // リクエストの処理
      capturer.checkpoint()
      
      // リクエストがキャプチャされている
      expect(capturedRequests).toHaveLength(1)
      expect(capturedRequests[0]).toEqual({
        method: 'GET',
        url: 'https://api.example.com/users'
      })
      
      // ユーザーハンドラーのレスポンスが返されている
      expect(data).toEqual({ id: 1, name: 'テストユーザー' })
    } finally {
      server.close()
    }
  })

  it('POSTリクエストをキャプチャしてfallthroughで他のハンドラーに委譲する', async () => {
    const capturedRequests: CapturedRequest[] = []
    
    // キャプチャラーを作成
    const capturer = new RequestCapturer((requests) => {
      capturedRequests.push(...requests)
    })
    
    // ユーザー側で定義するカスタムハンドラー
    const userHandler = http.post('https://api.example.com/users', async ({ request }) => {
      const body = await request.json() as Record<string, any>
      return HttpResponse.json({ 
        id: 123, 
        ...body,
        createdAt: '2023-01-01T00:00:00Z'
      }, { status: 201 })
    })
    
    // キャプチャハンドラーを最初に、ユーザーハンドラーを後に配置
    const captureHandler = createRequestsCaptureHandler(capturer)
    const server = setupServer(captureHandler, userHandler)
    server.listen()
    
    try {
      const userData = { name: '田中太郎', email: 'tanaka@example.com' }
      const response = await fetch('https://api.example.com/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })
      const data = await response.json()
      
      // リクエストの処理
      capturer.checkpoint()
      
      // リクエストがキャプチャされている
      expect(capturedRequests).toHaveLength(1)
      expect(capturedRequests[0].method).toBe('POST')
      expect(capturedRequests[0].url).toBe('https://api.example.com/users')
      expect(capturedRequests[0].body).toBe(JSON.stringify(userData))
      
      // ユーザーハンドラーのレスポンスが返されている
      expect(response.status).toBe(201)
      expect(data).toEqual({
        id: 123,
        name: '田中太郎',
        email: 'tanaka@example.com',
        createdAt: '2023-01-01T00:00:00Z'
      })
    } finally {
      server.close()
    }
  })

  it('複数のリクエストがキャプチャされて適切なハンドラーに委譲される', async () => {
    const capturedRequests: CapturedRequest[] = []
    
    // キャプチャラーを作成
    const capturer = new RequestCapturer((requests) => {
      capturedRequests.push(...requests)
    })
    
    // ユーザー側で定義する複数のハンドラー
    const getUserHandler = http.get('https://api.example.com/users/:id', ({ params }) => {
      return HttpResponse.json({ id: params.id, name: `ユーザー${params.id}` })
    })
    
    const getPostsHandler = http.get('https://api.example.com/posts', () => {
      return HttpResponse.json([
        { id: 1, title: '投稿1' },
        { id: 2, title: '投稿2' }
      ])
    })
    
    // キャプチャハンドラーを最初に、他のハンドラーを後に配置
    const captureHandler = createRequestsCaptureHandler(capturer)
    const server = setupServer(captureHandler, getUserHandler, getPostsHandler)
    server.listen()
    
    try {
      // 複数のリクエストを実行
      const userResponse = await fetch('https://api.example.com/users/1')
      const postsResponse = await fetch('https://api.example.com/posts')
      
      const userData = await userResponse.json()
      const postsData = await postsResponse.json()
      
      // リクエストの処理
      capturer.checkpoint()
      
      // 両方のリクエストがキャプチャされている
      expect(capturedRequests).toHaveLength(2)
      
      // URLでソートされている
      expect(capturedRequests[0].url).toBe('https://api.example.com/posts')
      expect(capturedRequests[0].method).toBe('GET')
      
      expect(capturedRequests[1].url).toBe('https://api.example.com/users/1')
      expect(capturedRequests[1].method).toBe('GET')
      
      // 適切なハンドラーのレスポンスが返されている
      expect(userData).toEqual({ id: '1', name: 'ユーザー1' })
      expect(postsData).toEqual([
        { id: 1, title: '投稿1' },
        { id: 2, title: '投稿2' }
      ])
    } finally {
      server.close()
    }
  })

  it('キャプチャしたリクエストに対してカスタム処理を実行できる', async () => {
    const processedRequests: any[] = []
    
    // キャプチャラーを作成（カスタム処理付き）
    const capturer = new RequestCapturer((requests) => {
      requests.forEach(request => {
        const url = new URL(request.url)
        processedRequests.push({
          method: request.method,
          pathname: url.pathname,
          hasBody: !!request.body,
          timestamp: Date.now()
        })
      })
    })
    
    // ユーザー側で定義するハンドラー
    const userHandler = http.get('https://api.example.com/data', () => {
      return HttpResponse.json({ message: 'データ取得成功' })
    })
    
    // キャプチャハンドラーを最初に、ユーザーハンドラーを後に配置
    const captureHandler = createRequestsCaptureHandler(capturer)
    const server = setupServer(captureHandler, userHandler)
    server.listen()
    
    try {
      const response = await fetch('https://api.example.com/data')
      const data = await response.json()
      
      // リクエストの処理
      capturer.checkpoint()
      
      // カスタム処理が実行されている
      expect(processedRequests).toHaveLength(1)
      expect(processedRequests[0].method).toBe('GET')
      expect(processedRequests[0].pathname).toBe('/data')
      expect(processedRequests[0].hasBody).toBe(false)
      expect(typeof processedRequests[0].timestamp).toBe('number')
      
      // ユーザーハンドラーのレスポンスが返されている
      expect(data).toEqual({ message: 'データ取得成功' })
    } finally {
      server.close()
    }
  })

  describe('リクエストのグループ化', () => {
    it('複数のリクエストをグループで処理できる', async () => {
      const processedGroups: CapturedRequest[][] = []
      
      // キャプチャラーを作成
      const capturer = new RequestCapturer((requests) => {
        processedGroups.push([...requests])
      })
      
      // ユーザー側で定義するハンドラー
      const userHandler = http.get('https://api.example.com/users/:id', ({ params }) => {
        return HttpResponse.json({ id: params.id, name: `ユーザー${params.id}` })
      })
      
      const postsHandler = http.get('https://api.example.com/posts', () => {
        return HttpResponse.json([{ id: 1, title: '投稿1' }])
      })
      
      // キャプチャハンドラーを作成
      const captureHandler = createRequestsCaptureHandler(capturer)
      const server = setupServer(captureHandler, userHandler, postsHandler)
      server.listen()
      
      try {
        // 複数のリクエストを実行
        await fetch('https://api.example.com/users/1')
        await fetch('https://api.example.com/posts')
        
        // この時点ではまだ処理されていない
        expect(processedGroups).toHaveLength(0)
        
        // リクエストの処理
        capturer.checkpoint()
        
        // 処理が実行されている
        expect(processedGroups).toHaveLength(1)
        expect(processedGroups[0]).toHaveLength(2)
        
        // URLでソートされている
        expect(processedGroups[0][0].url).toBe('https://api.example.com/posts')
        expect(processedGroups[0][1].url).toBe('https://api.example.com/users/1')
      } finally {
        server.close()
      }
    })

    it('処理のタイミングでリクエストがグループ化される', async () => {
      const processedGroups: CapturedRequest[][] = []
      
      // キャプチャラーを作成
      const capturer = new RequestCapturer((requests) => {
        processedGroups.push([...requests])
      })
      
      // ユーザー側で定義するハンドラー
      const userHandler = http.get('https://api.example.com/users/:id', ({ params }) => {
        return HttpResponse.json({ id: params.id, name: `ユーザー${params.id}` })
      })
      
      // キャプチャハンドラーを作成
      const captureHandler = createRequestsCaptureHandler(capturer)
      const server = setupServer(captureHandler, userHandler)
      server.listen()
      
      try {
        // 最初のグループ
        await fetch('https://api.example.com/users/1')
        await fetch('https://api.example.com/users/2')
        capturer.checkpoint()
        
        // 2番目のグループ
        await fetch('https://api.example.com/users/3')
        capturer.checkpoint()
        
        // 2つのグループが処理されている
        expect(processedGroups).toHaveLength(2)
        
        // 最初のグループには2つのリクエスト
        expect(processedGroups[0]).toHaveLength(2)
        expect(processedGroups[0][0].url).toBe('https://api.example.com/users/1')
        expect(processedGroups[0][1].url).toBe('https://api.example.com/users/2')
        
        // 2番目のグループには1つのリクエスト
        expect(processedGroups[1]).toHaveLength(1)
        expect(processedGroups[1][0].url).toBe('https://api.example.com/users/3')
      } finally {
        server.close()
      }
    })

    it('グループ内のリクエストがURLとメソッドでソートされる', async () => {
      const processedGroups: CapturedRequest[][] = []
      
      // キャプチャラーを作成
      const capturer = new RequestCapturer((requests) => {
        processedGroups.push([...requests])
      })
      
      // ユーザー側で定義するハンドラー
      const getHandler = http.get('https://api.example.com/data', () => {
        return HttpResponse.json({ data: 'get' })
      })
      
      const postHandler = http.post('https://api.example.com/data', () => {
        return HttpResponse.json({ data: 'post' })
      })
      
      const userHandler = http.get('https://api.example.com/users', () => {
        return HttpResponse.json({ users: [] })
      })
      
      // キャプチャハンドラーを作成
      const captureHandler = createRequestsCaptureHandler(capturer)
      const server = setupServer(captureHandler, getHandler, postHandler, userHandler)
      server.listen()
      
      try {
        // 順序を混在させてリクエスト実行
        await fetch('https://api.example.com/users')
        await fetch('https://api.example.com/data', { method: 'POST', body: 'test' })
        await fetch('https://api.example.com/data')
        
        capturer.checkpoint()
        
        expect(processedGroups).toHaveLength(1)
        expect(processedGroups[0]).toHaveLength(3)
        
        // ソートされた順序を確認
        // 1. https://api.example.com/data (GET)
        // 2. https://api.example.com/data (POST) 
        // 3. https://api.example.com/users (GET)
        expect(processedGroups[0][0].url).toBe('https://api.example.com/data')
        expect(processedGroups[0][0].method).toBe('GET')
        
        expect(processedGroups[0][1].url).toBe('https://api.example.com/data')
        expect(processedGroups[0][1].method).toBe('POST')
        
        expect(processedGroups[0][2].url).toBe('https://api.example.com/users')
        expect(processedGroups[0][2].method).toBe('GET')
      } finally {
        server.close()
      }
    })

    it('リクエストがない場合はハンドラが呼ばれない', async () => {
      const processedGroups: CapturedRequest[][] = []
      
      // キャプチャラーを作成
      const capturer = new RequestCapturer((requests) => {
        processedGroups.push([...requests])
      })
      
      // キャプチャハンドラーを作成
      const captureHandler = createRequestsCaptureHandler(capturer)
      const server = setupServer(captureHandler)
      server.listen()
      
      try {
        // リクエストなしで処理実行
        capturer.checkpoint()
        
        // ハンドラは呼ばれない
        expect(processedGroups).toHaveLength(0)
      } finally {
        server.close()
      }
    })
  })

  describe('自動チェックポイント機能', () => {
    it('指定したミリ秒数後に自動でチェックポイントが実行される', async () => {
      const capturedRequests: CapturedRequest[] = []
      
      // 自動チェックポイントを100msで設定
      const capturer = new RequestCapturer((requests) => {
        capturedRequests.push(...requests)
      }, { timeoutMs: 100 })
      
      const userHandler = http.get('https://api.example.com/test', () => {
        return HttpResponse.json({ success: true })
      })
      
      const captureHandler = createRequestsCaptureHandler(capturer)
      const server = setupServer(captureHandler, userHandler)
      server.listen()
      
      try {
        // リクエストを実行
        await fetch('https://api.example.com/test')
        
        // まだ自動チェックポイントは実行されていない
        expect(capturedRequests).toHaveLength(0)
        
        // 110ms待機（自動チェックポイントが実行される）
        await new Promise(resolve => setTimeout(resolve, 110))
        
        // 自動チェックポイントが実行されている
        expect(capturedRequests).toHaveLength(1)
        expect(capturedRequests[0].method).toBe('GET')
        expect(capturedRequests[0].url).toBe('https://api.example.com/test')
      } finally {
        server.close()
      }
    })

    it('新しいリクエストが来ると自動チェックポイントのタイマーがリセットされる', async () => {
      const capturedRequests: CapturedRequest[] = []
      
      // 自動チェックポイントを100msで設定
      const capturer = new RequestCapturer((requests) => {
        capturedRequests.push(...requests)
      }, { timeoutMs: 100 })
      
      const userHandler = http.get('https://api.example.com/test', () => {
        return HttpResponse.json({ success: true })
      })
      
      const captureHandler = createRequestsCaptureHandler(capturer)
      const server = setupServer(captureHandler, userHandler)
      server.listen()
      
      try {
        // 最初のリクエスト
        await fetch('https://api.example.com/test')
        
        // 80ms待機（自動チェックポイントまで20ms残り）
        await new Promise(resolve => setTimeout(resolve, 80))
        
        // 2番目のリクエスト（タイマーがリセットされる）
        await fetch('https://api.example.com/test')
        
        // さらに80ms待機（最初のリクエストから160ms、2番目のリクエストから80ms）
        await new Promise(resolve => setTimeout(resolve, 80))
        
        // まだ自動チェックポイントは実行されていない
        expect(capturedRequests).toHaveLength(0)
        
        // さらに30ms待機（2番目のリクエストから110ms）
        await new Promise(resolve => setTimeout(resolve, 30))
        
        // 自動チェックポイントが実行されている
        expect(capturedRequests).toHaveLength(2)
      } finally {
        server.close()
      }
    })

    it('手動チェックポイントを実行すると自動チェックポイントのタイマーがクリアされる', async () => {
      const capturedRequests: CapturedRequest[] = []
      
      // 自動チェックポイントを100msで設定
      const capturer = new RequestCapturer((requests) => {
        capturedRequests.push(...requests)
      }, { timeoutMs: 100 })
      
      const userHandler = http.get('https://api.example.com/test', () => {
        return HttpResponse.json({ success: true })
      })
      
      const captureHandler = createRequestsCaptureHandler(capturer)
      const server = setupServer(captureHandler, userHandler)
      server.listen()
      
      try {
        // リクエストを実行
        await fetch('https://api.example.com/test')
        
        // 50ms待機
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // 手動でチェックポイントを実行
        capturer.checkpoint()
        
        // 1つのリクエストが処理されている
        expect(capturedRequests).toHaveLength(1)
        
        // チェックポイント後に追加のリクエストを送信
        await fetch('https://api.example.com/test')
        
        // 50ms待機（自動チェックポイントの時間内）
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // リクエストの時点から所定の時間まではcapturedRequestsが増えていない
        expect(capturedRequests).toHaveLength(1)
        
        // さらに60ms待機（合計110ms、自動チェックポイントの時間を超過）
        await new Promise(resolve => setTimeout(resolve, 60))
        
        // リクエストの時点から所定の時間後はcapturedRequestsが増えている
        expect(capturedRequests).toHaveLength(2)
      } finally {
        server.close()
      }
    })

    it('自動チェックポイント設定なしでは従来通り動作する', async () => {
      const capturedRequests: CapturedRequest[] = []
      
      // 自動チェックポイント設定なし
      const capturer = new RequestCapturer((requests) => {
        capturedRequests.push(...requests)
      })
      
      const userHandler = http.get('https://api.example.com/test', () => {
        return HttpResponse.json({ success: true })
      })
      
      const captureHandler = createRequestsCaptureHandler(capturer)
      const server = setupServer(captureHandler, userHandler)
      server.listen()
      
      try {
        // リクエストを実行
        await fetch('https://api.example.com/test')
        
        // 200ms待機
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // 自動チェックポイントは実行されていない
        expect(capturedRequests).toHaveLength(0)
        
        // 手動でチェックポイントを実行
        capturer.checkpoint()
        
        // リクエストが処理されている
        expect(capturedRequests).toHaveLength(1)
      } finally {
        server.close()
      }
    })

    it('resetメソッドでタイマーがクリアされる', async () => {
      const capturedRequests: CapturedRequest[] = []
      
      // 自動チェックポイントを100msで設定
      const capturer = new RequestCapturer((requests) => {
        capturedRequests.push(...requests)
      }, { timeoutMs: 100 })
      
      const userHandler = http.get('https://api.example.com/test', () => {
        return HttpResponse.json({ success: true })
      })
      
      const captureHandler = createRequestsCaptureHandler(capturer)
      const server = setupServer(captureHandler, userHandler)
      server.listen()
      
      try {
        // リクエストを実行
        await fetch('https://api.example.com/test')
        
        // 50ms待機
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // resetを実行
        capturer.reset()
        
        // さらに100ms待機
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // 自動チェックポイントは実行されていない（タイマーがクリアされているため）
        // かつリクエストも破棄されている
        expect(capturedRequests).toHaveLength(0)
      } finally {
        server.close()
      }
    })
  })

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
      
      const captureHandler = createRequestsCaptureHandler(capturer)
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
      
      const captureHandler = createRequestsCaptureHandler(capturer)
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
        await new Promise(resolve => setTimeout(resolve, 70))
        
        // 第2グループのリクエスト
        const secondBatch = [
          { url: 'https://api.example.com/users/3' },
          { url: 'https://api.example.com/events', method: 'POST', body: { event: 'logout' } }
        ]
        
        await executeRequestsRandomly(rng, secondBatch)
        
        // 第2グループの自動チェックポイントが実行されるまで待機
        await new Promise(resolve => setTimeout(resolve, 70))
        
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
      
      const captureHandler = createRequestsCaptureHandler(capturer)
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
      
      const captureHandler = createRequestsCaptureHandler(capturer)
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
})

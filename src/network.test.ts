import { describe, it, expect } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { 
  createCaptureHandler, 
  createBatchCaptureHandler,
  BatchCapture,
  type CapturedRequest, 
  type RequestCaptureFn,
  type BatchRequestCaptureFn 
} from './index'

describe('Capture Requests MSW Library Tests', () => {
  it('リクエストをキャプチャしてfallthroughで他のハンドラーに委譲する', async () => {
    const capturedRequests: CapturedRequest[] = []
    
    // キャプチャ関数を作成
    const captureFn: RequestCaptureFn = (request) => {
      capturedRequests.push(request)
    }
    
    // ユーザー側で定義するカスタムハンドラー
    const userHandler = http.get('https://api.example.com/users', () => {
      return HttpResponse.json({ id: 1, name: 'テストユーザー' })
    })
    
    // キャプチャハンドラーを最初に、ユーザーハンドラーを後に配置
    const captureHandler = createCaptureHandler(captureFn)
    const server = setupServer(captureHandler, userHandler)
    server.listen()
    
    try {
      const response = await fetch('https://api.example.com/users')
      const data = await response.json()
      
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
    
    // キャプチャ関数を作成
    const captureFn: RequestCaptureFn = (request) => {
      capturedRequests.push(request)
    }
    
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
    const captureHandler = createCaptureHandler(captureFn)
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
    
    // キャプチャ関数を作成
    const captureFn: RequestCaptureFn = (request) => {
      capturedRequests.push(request)
    }
    
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
    const captureHandler = createCaptureHandler(captureFn)
    const server = setupServer(captureHandler, getUserHandler, getPostsHandler)
    server.listen()
    
    try {
      // 複数のリクエストを実行
      const userResponse = await fetch('https://api.example.com/users/1')
      const postsResponse = await fetch('https://api.example.com/posts')
      
      const userData = await userResponse.json()
      const postsData = await postsResponse.json()
      
      // 両方のリクエストがキャプチャされている
      expect(capturedRequests).toHaveLength(2)
      expect(capturedRequests[0].method).toBe('GET')
      expect(capturedRequests[0].url).toBe('https://api.example.com/users/1')
      expect(capturedRequests[1].method).toBe('GET')
      expect(capturedRequests[1].url).toBe('https://api.example.com/posts')
      
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

  it('キャプチャハンドラーでリクエストをキャプチャしてカスタム処理を実行できる', async () => {
    const processedRequests: any[] = []
    
    // カスタムキャプチャ関数を作成
    const captureFn: RequestCaptureFn = (request) => {
      // カスタム処理: URLのパスを抽出
      const url = new URL(request.url)
      processedRequests.push({
        method: request.method,
        pathname: url.pathname,
        hasBody: !!request.body,
        timestamp: Date.now()
      })
    }
    
    // ユーザー側で定義するハンドラー
    const userHandler = http.get('https://api.example.com/data', () => {
      return HttpResponse.json({ message: 'データ取得成功' })
    })
    
    // キャプチャハンドラーを最初に、ユーザーハンドラーを後に配置
    const captureHandler = createCaptureHandler(captureFn)
    const server = setupServer(captureHandler, userHandler)
    server.listen()
    
    try {
      const response = await fetch('https://api.example.com/data')
      const data = await response.json()
      
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

  describe('バッチキャプチャ機能', () => {
    it('複数のリクエストをバッチで処理できる', async () => {
      const batchedRequests: CapturedRequest[][] = []
      
      // バッチキャプチャインスタンスを作成
      const batchCapture = new BatchCapture((requests) => {
        batchedRequests.push(requests)
      })
      
      // ユーザー側で定義するハンドラー
      const userHandler = http.get('https://api.example.com/users/:id', ({ params }) => {
        return HttpResponse.json({ id: params.id, name: `ユーザー${params.id}` })
      })
      
      const postsHandler = http.get('https://api.example.com/posts', () => {
        return HttpResponse.json([{ id: 1, title: '投稿1' }])
      })
      
      // バッチキャプチャハンドラーを作成
      const captureHandler = createBatchCaptureHandler(batchCapture)
      const server = setupServer(captureHandler, userHandler, postsHandler)
      server.listen()
      
      try {
        // 複数のリクエストを実行
        await fetch('https://api.example.com/users/1')
        await fetch('https://api.example.com/posts')
        
        // この時点ではまだバッチ処理されていない
        expect(batchedRequests).toHaveLength(0)
        
        // チェックポイントでバッチ処理実行
        batchCapture.checkpoint()
        
        // バッチ処理が実行されている
        expect(batchedRequests).toHaveLength(1)
        expect(batchedRequests[0]).toHaveLength(2)
        
        // URLでソートされている
        expect(batchedRequests[0][0].url).toBe('https://api.example.com/posts')
        expect(batchedRequests[0][1].url).toBe('https://api.example.com/users/1')
      } finally {
        server.close()
      }
    })

    it('チェックポイント間でリクエストがグループ化される', async () => {
      const batchedRequests: CapturedRequest[][] = []
      
      // バッチキャプチャインスタンスを作成
      const batchCapture = new BatchCapture((requests) => {
        batchedRequests.push(requests)
      })
      
      // ユーザー側で定義するハンドラー
      const userHandler = http.get('https://api.example.com/users/:id', ({ params }) => {
        return HttpResponse.json({ id: params.id, name: `ユーザー${params.id}` })
      })
      
      // バッチキャプチャハンドラーを作成
      const captureHandler = createBatchCaptureHandler(batchCapture)
      const server = setupServer(captureHandler, userHandler)
      server.listen()
      
      try {
        // 最初のグループ
        await fetch('https://api.example.com/users/1')
        await fetch('https://api.example.com/users/2')
        batchCapture.checkpoint() // 最初のチェックポイント
        
        // 2番目のグループ
        await fetch('https://api.example.com/users/3')
        batchCapture.checkpoint() // 2番目のチェックポイント
        
        // 2つのバッチが処理されている
        expect(batchedRequests).toHaveLength(2)
        
        // 最初のバッチには2つのリクエスト
        expect(batchedRequests[0]).toHaveLength(2)
        expect(batchedRequests[0][0].url).toBe('https://api.example.com/users/1')
        expect(batchedRequests[0][1].url).toBe('https://api.example.com/users/2')
        
        // 2番目のバッチには1つのリクエスト
        expect(batchedRequests[1]).toHaveLength(1)
        expect(batchedRequests[1][0].url).toBe('https://api.example.com/users/3')
      } finally {
        server.close()
      }
    })

    it('リクエストがURLとメソッドでソートされる', async () => {
      const batchedRequests: CapturedRequest[][] = []
      
      // バッチキャプチャインスタンスを作成
      const batchCapture = new BatchCapture((requests) => {
        batchedRequests.push(requests)
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
      
      // バッチキャプチャハンドラーを作成
      const captureHandler = createBatchCaptureHandler(batchCapture)
      const server = setupServer(captureHandler, getHandler, postHandler, userHandler)
      server.listen()
      
      try {
        // 順序を混在させてリクエスト実行
        await fetch('https://api.example.com/users')
        await fetch('https://api.example.com/data', { method: 'POST', body: 'test' })
        await fetch('https://api.example.com/data')
        
        batchCapture.checkpoint()
        
        expect(batchedRequests).toHaveLength(1)
        expect(batchedRequests[0]).toHaveLength(3)
        
        // ソートされた順序を確認
        // 1. https://api.example.com/data (GET)
        // 2. https://api.example.com/data (POST) 
        // 3. https://api.example.com/users (GET)
        expect(batchedRequests[0][0].url).toBe('https://api.example.com/data')
        expect(batchedRequests[0][0].method).toBe('GET')
        
        expect(batchedRequests[0][1].url).toBe('https://api.example.com/data')
        expect(batchedRequests[0][1].method).toBe('POST')
        
        expect(batchedRequests[0][2].url).toBe('https://api.example.com/users')
        expect(batchedRequests[0][2].method).toBe('GET')
      } finally {
        server.close()
      }
    })

    it('空のバッチではキャプチャ関数が呼ばれない', async () => {
      const batchedRequests: CapturedRequest[][] = []
      
      // バッチキャプチャインスタンスを作成
      const batchCapture = new BatchCapture((requests) => {
        batchedRequests.push(requests)
      })
      
      // バッチキャプチャハンドラーを作成
      const captureHandler = createBatchCaptureHandler(batchCapture)
      const server = setupServer(captureHandler)
      server.listen()
      
      try {
        // リクエストなしでチェックポイント実行
        batchCapture.checkpoint()
        
        // キャプチャ関数は呼ばれない
        expect(batchedRequests).toHaveLength(0)
      } finally {
        server.close()
      }
    })
  })
})

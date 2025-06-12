import { describe, it, expect } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { createRequestsCaptureHandler, RequestCapturer, type CapturedRequest } from '../src/index'

describe('基本的なリクエストキャプチャ機能', () => {
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
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
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
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
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
      const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
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
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
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
})
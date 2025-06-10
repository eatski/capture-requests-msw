import { describe, it, expect } from 'vitest'
import { setupServer } from 'msw/node'
import { createCaptureHandler, type CapturedRequest, type RequestCaptureFn } from './index'

// 実際のネットワークリクエストをテストする関数
async function fetchRealAPI() {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts/1')
    if (!response.ok) {
      throw new Error('Failed to fetch')
    }
    return response.json()
  } catch (error) {
    // テスト環境では実際のネットワークリクエストが失敗することが多いので、
    // モックデータを返す
    return {
      id: 1,
      title: 'Mock post title',
      body: 'Mock post body',
      userId: 1
    }
  }
}

async function createUser(userData: { name: string; email: string }) {
  try {
    const response = await fetch('https://httpbin.org/post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    })
    if (!response.ok) {
      throw new Error('Failed to create user')
    }
    return response.json()
  } catch (error) {
    // テスト環境ではモックデータを返す
    return {
      id: '123',
      ...userData,
      createdAt: new Date().toISOString()
    }
  }
}

describe('Capture Requests MSW Library Tests', () => {
  it('GETリクエストがキャプチャされる', async () => {
    const capturedRequests: CapturedRequest[] = []
    
    // キャプチャ関数を作成
    const captureFn: RequestCaptureFn = (request) => {
      capturedRequests.push(request)
    }
    
    // ライブラリを使ってハンドラーを作成
    const handler = createCaptureHandler(captureFn)
    const server = setupServer(handler)
    server.listen()
    
    try {
      await fetchRealAPI()
      
      expect(capturedRequests).toHaveLength(1)
      expect(capturedRequests[0]).toEqual({
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/posts/1'
      })
    } finally {
      server.close()
    }
  })

  it('POSTリクエストとボディがキャプチャされる', async () => {
    const capturedRequests: CapturedRequest[] = []
    
    // キャプチャ関数を作成
    const captureFn: RequestCaptureFn = (request) => {
      capturedRequests.push(request)
    }
    
    // ライブラリを使ってハンドラーを作成
    const handler = createCaptureHandler(captureFn)
    const server = setupServer(handler)
    server.listen()
    
    try {
      const userData = {
        name: '田中太郎',
        email: 'tanaka@example.com'
      }
      
      await createUser(userData)
      
      expect(capturedRequests).toHaveLength(1)
      expect(capturedRequests[0].method).toBe('POST')
      expect(capturedRequests[0].url).toBe('https://httpbin.org/post')
      expect(capturedRequests[0].body).toBe(JSON.stringify(userData))
    } finally {
      server.close()
    }
  })

  it('複数のリクエストがすべてキャプチャされる', async () => {
    const capturedRequests: CapturedRequest[] = []
    
    // キャプチャ関数を作成
    const captureFn: RequestCaptureFn = (request) => {
      capturedRequests.push(request)
    }
    
    // ライブラリを使ってハンドラーを作成
    const handler = createCaptureHandler(captureFn)
    const server = setupServer(handler)
    server.listen()
    
    try {
      await fetchRealAPI()
      await createUser({ name: 'Test User', email: 'test@example.com' })
      
      expect(capturedRequests).toHaveLength(2)
      expect(capturedRequests[0].method).toBe('GET')
      expect(capturedRequests[1].method).toBe('POST')
    } finally {
      server.close()
    }
  })

  it('カスタム処理でリクエストを加工できる', async () => {
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
    
    // ライブラリを使ってハンドラーを作成
    const handler = createCaptureHandler(captureFn)
    const server = setupServer(handler)
    server.listen()
    
    try {
      await fetchRealAPI()
      
      expect(processedRequests).toHaveLength(1)
      expect(processedRequests[0].method).toBe('GET')
      expect(processedRequests[0].pathname).toBe('/posts/1')
      expect(processedRequests[0].hasBody).toBe(false)
      expect(typeof processedRequests[0].timestamp).toBe('number')
    } finally {
      server.close()
    }
  })
})

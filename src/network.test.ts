import { describe, it, expect } from 'vitest'
import { setupServer } from 'msw/node'
import { createHandlers, type RequestCaptureFn } from './create-handlers'

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

describe('Request Capture Tests', () => {
  it('GETリクエストがキャプチャされる', async () => {
    const capturedRequests: any[] = []
    
    // キャプチャ関数を作成
    const captureFn: RequestCaptureFn = (request) => {
      const url = new URL(request.url)
      capturedRequests.push({
        method: request.method,
        url: request.url,
        pathname: url.pathname,
        search: url.search,
        headers: Object.fromEntries(request.headers.entries()),
        timestamp: '[TIMESTAMP]' // 固定値でスナップショット用
      })
    }
    
    // テスト用MSWサーバーを作成・起動
    const server = setupServer(...createHandlers(captureFn))
    server.listen()
    
    try {
      await fetchRealAPI()
      expect(capturedRequests).toMatchSnapshot()
    } finally {
      server.close()
    }
  })

  it('POSTリクエストとボディがキャプチャされる', async () => {
    const capturedRequests: any[] = []
    
    // キャプチャ関数を作成
    const captureFn: RequestCaptureFn = (request) => {
      const url = new URL(request.url)
      const capturedRequest: any = {
        method: request.method,
        url: request.url,
        pathname: url.pathname,
        search: url.search,
        headers: Object.fromEntries(request.headers.entries()),
        timestamp: '[TIMESTAMP]' // 固定値でスナップショット用
      }

      // リクエストボディがある場合は追加
      if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        request.clone().text().then(body => {
          if (body) {
            capturedRequest.body = body
          }
        })
      }

      capturedRequests.push(capturedRequest)
    }
    
    // テスト用MSWサーバーを作成・起動
    const server = setupServer(...createHandlers(captureFn))
    server.listen()
    
    try {
      const userData = {
        name: '田中太郎',
        email: 'tanaka@example.com'
      }
      
      await createUser(userData)
      
      // ボディの非同期処理を待つ
      await new Promise(resolve => setTimeout(resolve, 100))
      
      expect(capturedRequests).toMatchSnapshot()
    } finally {
      server.close()
    }
  })

  it('複数のリクエストがすべてキャプチャされる', async () => {
    const capturedRequests: any[] = []
    
    // キャプチャ関数を作成
    const captureFn: RequestCaptureFn = (request) => {
      const url = new URL(request.url)
      capturedRequests.push({
        method: request.method,
        url: request.url,
        pathname: url.pathname,
        search: url.search,
        headers: Object.fromEntries(request.headers.entries()),
        timestamp: '[TIMESTAMP]' // 固定値でスナップショット用
      })
    }
    
    // テスト用MSWサーバーを作成・起動
    const server = setupServer(...createHandlers(captureFn))
    server.listen()
    
    try {
      // 複数のリクエストを送信
      await fetchRealAPI()
      await fetchRealAPI()
      
      expect(capturedRequests).toHaveLength(2)
      expect(capturedRequests).toMatchSnapshot()
    } finally {
      server.close()
    }
  }, 10000)

  it('カスタムキャプチャ関数を注入できる', async () => {
    const customCapturedRequests: any[] = []
    
    // カスタムキャプチャ関数を作成
    const customCaptureFn: RequestCaptureFn = (request) => {
      customCapturedRequests.push({
        method: request.method,
        url: request.url,
        custom: 'カスタムキャプチャ',
        userAgent: request.headers.get('user-agent') || 'unknown'
      })
    }
    
    // テスト用MSWサーバーを作成・起動
    const server = setupServer(...createHandlers(customCaptureFn))
    server.listen()
    
    try {
      await fetchRealAPI()
      
      expect(customCapturedRequests).toHaveLength(1)
      expect(customCapturedRequests[0]).toMatchSnapshot()
    } finally {
      server.close()
    }
  })
})

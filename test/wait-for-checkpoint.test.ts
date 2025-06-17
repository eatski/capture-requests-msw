import { describe, it, expect } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { setTimeout } from 'timers/promises'
import { createRequestsCaptureHandler, type CapturedRequest } from '../src/index'

describe('waitForCheckpoint機能', () => {
  it('waitForCheckpointが有効な場合、チェックポイントまで待機してからfallthroughする', async () => {
    const capturedRequests: CapturedRequest[] = []
    let handlerCallOrder: string[] = []
    
    // waitForCheckpointを有効にしたキャプチャラーを作成
    const { handler, checkpoint } = createRequestsCaptureHandler({
      handler: (requests: CapturedRequest[]) => {
        handlerCallOrder.push('capture-handler')
        capturedRequests.push(...requests)
      },
      options: { timeoutMs: 100, waitForCheckpoint: true }
    })
    
    // ユーザー側で定義するハンドラー
    const userHandler = http.get('https://api.example.com/test', () => {
      handlerCallOrder.push('user-handler')
      return HttpResponse.json({ message: 'ユーザーハンドラーで処理' })
    })
    
    // キャプチャハンドラーを最初に、ユーザーハンドラーを後に配置
    const captureHandler = http.all('*', handler)
    const server = setupServer(captureHandler, userHandler)
    server.listen()
    
    try {
      // リクエストを実行（この時点ではチェックポイントまで待機）
      const responsePromise = fetch('https://api.example.com/test')
      
      // 少し待機（まだチェックポイントは実行されていない）
      await setTimeout(50)
      expect(handlerCallOrder).toEqual([])
      expect(capturedRequests).toHaveLength(0)
      
      // 自動チェックポイントが実行されるまで待機
      await setTimeout(60)
      
      // この時点でキャプチャハンドラーが実行されている
      expect(handlerCallOrder).toEqual(['capture-handler', 'user-handler'])
      expect(capturedRequests).toHaveLength(1)
      expect(capturedRequests[0].method).toBe('GET')
      expect(capturedRequests[0].url).toBe('https://api.example.com/test')
      
      // レスポンスを取得（ユーザーハンドラーで処理されている）
      const response = await responsePromise
      const data = await response.json()
      
      expect(data).toEqual({ message: 'ユーザーハンドラーで処理' })
    } finally {
      server.close()
    }
  })

  it('waitForCheckpointが無効な場合、即座にfallthroughする', async () => {
    const capturedRequests: CapturedRequest[] = []
    let handlerCallOrder: string[] = []

    // waitForCheckpointを無効にしたキャプチャラーを作成
    const { handler, checkpoint } = createRequestsCaptureHandler({
      handler: (requests: CapturedRequest[]) => {
        handlerCallOrder.push('capture-handler')
        capturedRequests.push(...requests)
      },
      options: { timeoutMs: 100, waitForCheckpoint: false }
    })

    // ユーザー側で定義するハンドラー
    const userHandler = http.get('https://api.example.com/test', () => {
      handlerCallOrder.push('user-handler')
      return HttpResponse.json({ message: 'ユーザーハンドラーで処理' })
    })

    // キャプチャハンドラーを最初に、ユーザーハンドラーを後に配置
    const captureHandler = http.all('*', handler)
    const server = setupServer(captureHandler, userHandler)
    server.listen()

    try {
      // リクエストを実行（即座にfallthroughする）
      const response = await fetch('https://api.example.com/test')
      const data = await response.json()

      // ユーザーハンドラーが即座に実行されている
      expect(handlerCallOrder).toEqual(['user-handler'])
      expect(data).toEqual({ message: 'ユーザーハンドラーで処理' })

      // まだキャプチャは実行されていない
      expect(capturedRequests).toHaveLength(0)

      // 自動チェックポイントが実行されるまで待機
      await setTimeout(110)

      // キャプチャが実行されている
      expect(handlerCallOrder).toEqual(['user-handler', 'capture-handler'])
      expect(capturedRequests).toHaveLength(1)
    } finally {
      server.close()
    }
  })

  it('waitForCheckpointが有効で手動チェックポイントの場合も正しく動作する', async () => {
    const capturedRequests: CapturedRequest[] = []
    let handlerCallOrder: string[] = []
    
    // waitForCheckpointを有効にしたキャプチャラーを作成（自動チェックポイントなし）
    const { handler, checkpoint } = createRequestsCaptureHandler({
      handler: (requests: CapturedRequest[]) => {
        handlerCallOrder.push('capture-handler')
        capturedRequests.push(...requests)
      },
      options: { timeoutMs: 1000, waitForCheckpoint: true } // 長めに設定して自動実行を避ける
    })
    
    // ユーザー側で定義するハンドラー
    const userHandler = http.get('https://api.example.com/test', () => {
      handlerCallOrder.push('user-handler')
      return HttpResponse.json({ message: 'ユーザーハンドラーで処理' })
    })
    
    // キャプチャハンドラーを最初に、ユーザーハンドラーを後に配置
    const captureHandler = http.all('*', handler)
    const server = setupServer(captureHandler, userHandler)
    server.listen()
    
    try {
      // リクエストを実行（この時点ではチェックポイントまで待機）
      const responsePromise = fetch('https://api.example.com/test')
      
      // 少し待機
      await setTimeout(50)
      expect(handlerCallOrder).toEqual([])
      expect(capturedRequests).toHaveLength(0)
      
      // 手動でチェックポイントを実行
      checkpoint()
      
      // この時点でキャプチャハンドラーが実行されている
      expect(handlerCallOrder).toEqual(['capture-handler'])
      expect(capturedRequests).toHaveLength(1)
      
      // レスポンスを取得（ユーザーハンドラーで処理されている）
      const response = await responsePromise
      const data = await response.json()
      
      expect(handlerCallOrder).toEqual(['capture-handler', 'user-handler'])
      expect(data).toEqual({ message: 'ユーザーハンドラーで処理' })
    } finally {
      server.close()
    }
  })

  it('waitForCheckpointが有効な場合でも複数リクエストを正しく処理できる', async () => {
    const capturedRequests: CapturedRequest[] = []
    
    // waitForCheckpointを有効にしたキャプチャラーを作成
    const { handler, checkpoint } = createRequestsCaptureHandler({
      handler: (requests: CapturedRequest[]) => {
        capturedRequests.push(...requests)
      },
      options: { timeoutMs: 100, waitForCheckpoint: true }
    })
    
    // ユーザー側で定義するハンドラー
    const userHandler1 = http.get('https://api.example.com/users/:id', ({ params }) => {
      return HttpResponse.json({ id: params.id, name: `ユーザー${params.id}` })
    })
    
    const userHandler2 = http.post('https://api.example.com/posts', async ({ request }) => {
      const body = await request.json() as Record<string, any>
      return HttpResponse.json({ id: 123, ...body })
    })
    
    // キャプチャハンドラーを最初に、ユーザーハンドラーを後に配置
    const captureHandler = http.all('*', handler)
    const server = setupServer(captureHandler, userHandler1, userHandler2)
    server.listen()
    
    try {
      // 複数のリクエストを実行
      const request1Promise = fetch('https://api.example.com/users/1')
      const request2Promise = fetch('https://api.example.com/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'テスト投稿' })
      })
      
      // 自動チェックポイントが実行されるまで待機
      await setTimeout(110)
      
      // キャプチャが実行されている
      expect(capturedRequests).toHaveLength(2)
      
      // URLでソートされている
      expect(capturedRequests[0].url).toBe('https://api.example.com/posts')
      expect(capturedRequests[0].method).toBe('POST')
      expect(capturedRequests[0].body).toBe('{"title":"テスト投稿"}')
      
      expect(capturedRequests[1].url).toBe('https://api.example.com/users/1')
      expect(capturedRequests[1].method).toBe('GET')
      
      // レスポンスを取得
      const response1 = await request1Promise
      const response2 = await request2Promise
      
      const data1 = await response1.json()
      const data2 = await response2.json()
      
      // 適切なハンドラーで処理されている
      expect(data1).toEqual({ id: '1', name: 'ユーザー1' })
      expect(data2).toEqual({ id: 123, title: 'テスト投稿' })
    } finally {
      server.close()
    }
  })

  it('waitForCheckpointが有効な場合、順次fetchしてawaitする際の挙動を確認', async () => {
    const capturedGroups: CapturedRequest[][] = []
    let handlerCallOrder: string[] = []
    
    // waitForCheckpointを有効にしたキャプチャラーを作成
    const { handler, checkpoint } = createRequestsCaptureHandler({
      handler: (requests: CapturedRequest[]) => {
        handlerCallOrder.push('capture-handler')
        capturedGroups.push(requests)
      },
      options: { timeoutMs: 100, waitForCheckpoint: true }
    })
    
    // ユーザー側で定義するハンドラー
    const userHandler1 = http.get('https://api.example.com/first', () => {
      handlerCallOrder.push('first-handler')
      return HttpResponse.json({ message: '最初のリクエスト' })
    })
    
    const userHandler2 = http.get('https://api.example.com/second', () => {
      handlerCallOrder.push('second-handler')
      return HttpResponse.json({ message: '2番目のリクエスト' })
    })
    
    const userHandler3 = http.get('https://api.example.com/third', () => {
      handlerCallOrder.push('third-handler')
      return HttpResponse.json({ message: '3番目のリクエスト' })
    })
    
    // キャプチャハンドラーを最初に、ユーザーハンドラーを後に配置
    const captureHandler = http.all('*', handler)
    const server = setupServer(captureHandler, userHandler1, userHandler2, userHandler3)
    server.listen()
    
    try {
      // 順次fetchしてawaitする（waitForCheckpointにより自動的にtimeoutMs待機される）
      const response1 = await fetch('https://api.example.com/first')
      const data1 = await response1.json()
      
      const response2 = await fetch('https://api.example.com/second')
      const data2 = await response2.json()
      
      const response3 = await fetch('https://api.example.com/third')
      const data3 = await response3.json()
      
      // waitForCheckpointが有効な場合、各リクエストは個別にキャプチャされる
      expect(capturedGroups).toHaveLength(3)
      expect(capturedGroups[0]).toHaveLength(1)
      expect(capturedGroups[1]).toHaveLength(1)
      expect(capturedGroups[2]).toHaveLength(1)
      
      // 各リクエストが正しく処理されていることを確認
      expect(data1).toEqual({ message: '最初のリクエスト' })
      expect(data2).toEqual({ message: '2番目のリクエスト' })
      expect(data3).toEqual({ message: '3番目のリクエスト' })
      
      // ハンドラーの実行順序を確認（waitForCheckpointにより、各リクエストが個別に処理される）
      expect(handlerCallOrder).toEqual([
        'capture-handler',
        'first-handler',
        'capture-handler',
        'second-handler',
        'capture-handler',
        'third-handler'
      ])
      
      // キャプチャされたリクエストの内容を確認
      expect(capturedGroups[0][0].url).toBe('https://api.example.com/first')
      expect(capturedGroups[1][0].url).toBe('https://api.example.com/second')
      expect(capturedGroups[2][0].url).toBe('https://api.example.com/third')
      
      // すべてGETリクエスト
      expect(capturedGroups[0][0].method).toBe('GET')
      expect(capturedGroups[1][0].method).toBe('GET')
      expect(capturedGroups[2][0].method).toBe('GET')
    } finally {
      server.close()
    }
  })
})
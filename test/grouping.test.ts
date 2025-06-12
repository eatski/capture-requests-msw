import { describe, it, expect } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { createRequestsCaptureHandler, RequestCapturer, type CapturedRequest } from '../src/index'

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
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
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
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
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
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
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

  it('リクエストがない場合ハンドラが呼ばれない', async () => {
    const groups: CapturedRequest[][] = []
    const capturer = new RequestCapturer((requests) => groups.push([...requests]))
    
    capturer.checkpoint()
    expect(groups).toHaveLength(0)
  })
})
import { describe, it, expect } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { setTimeout } from 'timers/promises'
import { createRequestsCaptureHandler, RequestCapturer, type CapturedRequest } from '../src/index'

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
    
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
    const server = setupServer(captureHandler, userHandler)
    server.listen()
    
    try {
      // リクエストを実行
      await fetch('https://api.example.com/test')
      
      // まだ自動チェックポイントは実行されていない
      expect(capturedRequests).toHaveLength(0)
      
      // 110ms待機（自動チェックポイントが実行される）
      await setTimeout(110)
      
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
    
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
    const server = setupServer(captureHandler, userHandler)
    server.listen()
    
    try {
      // 最初のリクエスト
      await fetch('https://api.example.com/test')
      
      // 80ms待機（自動チェックポイントまで20ms残り）
      await setTimeout(80)
      
      // 2番目のリクエスト（タイマーがリセットされる）
      await fetch('https://api.example.com/test')
      
      // さらに80ms待機（最初のリクエストから160ms、2番目のリクエストから80ms）
      await setTimeout(80)
      
      // まだ自動チェックポイントは実行されていない
      expect(capturedRequests).toHaveLength(0)
      
      // さらに30ms待機（2番目のリクエストから110ms）
      await setTimeout(30)
      
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
    
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
    const server = setupServer(captureHandler, userHandler)
    server.listen()
    
    try {
      // リクエストを実行
      await fetch('https://api.example.com/test')
      
      // 50ms待機
      await setTimeout(50)
      
      // 手動でチェックポイントを実行
      capturer.checkpoint()
      
      // 1つのリクエストが処理されている
      expect(capturedRequests).toHaveLength(1)
      
      // チェックポイント後に追加のリクエストを送信
      await fetch('https://api.example.com/test')
      
      // 50ms待機（自動チェックポイントの時間内）
      await setTimeout(50)
      
      // リクエストの時点から所定の時間まではcapturedRequestsが増えていない
      expect(capturedRequests).toHaveLength(1)
      
      // さらに60ms待機（合計110ms、自動チェックポイントの時間を超過）
      await setTimeout(60)
      
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
    
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
    const server = setupServer(captureHandler, userHandler)
    server.listen()
    
    try {
      // リクエストを実行
      await fetch('https://api.example.com/test')
      
      // 200ms待機
      await setTimeout(200)
      
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
})
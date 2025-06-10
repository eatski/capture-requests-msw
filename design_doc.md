# デザインドキュメント

## 概要

このリポジトリは、MSW（Mock Service Worker）を使用してHTTPリクエストをキャプチャし、カスタム処理を注入できるライブラリです。テスト環境での使用に最適化されています。

## 特徴

- 全リクエストキャプチャ: すべてのHTTP通信を自動的にキャプチャします。
- Fallthrough: 実際のネットワークリクエストはそのまま通します。
- カスタム処理: 独自のキャプチャ関数を注入可能です。
- シンプル: method、url、bodyのみをキャプチャします。
- テスト特化: テスト環境での使用に最適化されています。

## インストール

```bash
npm install capture-requests-msw msw
```

## 使用方法

### 基本的な使用例

```typescript
import { setupServer } from 'msw/node'
import { createCaptureHandler, type CapturedRequest } from 'capture-requests-msw'

// キャプチャされたリクエストを保存する配列
const capturedRequests: CapturedRequest[] = []

// キャプチャ関数を定義
const captureFn = (request: CapturedRequest) => {
  capturedRequests.push(request)
  console.log(`${request.method} ${request.url}`)
}

// ハンドラーを作成
const handler = createCaptureHandler(captureFn)

// MSWサーバーを作成・起動
const server = setupServer(handler)
server.listen()

// HTTPリクエストを実行
await fetch('https://api.example.com/users')

// リクエストがキャプチャされている
console.log(capturedRequests)
// [{ method: 'GET', url: 'https://api.example.com/users' }]

server.close()
```

### カスタム処理の例

```typescript
import { createCaptureHandler } from 'capture-requests-msw'

const customCapture = (request: CapturedRequest) => {
  const url = new URL(request.url)
  
  // カスタム処理例
  if (request.method === 'POST') {
    console.log('POST request detected:', url.pathname)
    if (request.body) {
      console.log('Request body:', request.body)
    }
  }
  
  // データベースに保存
  saveToDatabase({
    timestamp: Date.now(),
    method: request.method,
    path: url.pathname,
    hasBody: !!request.body
  })
}

const handler = createCaptureHandler(customCapture)
```

### Vitestでのテスト例

```typescript
import { describe, it, expect } from 'vitest'
import { setupServer } from 'msw/node'
import { createCaptureHandler, type CapturedRequest } from 'capture-requests-msw'

describe('API Tests', () => {
  it('リクエストをキャプチャできる', async () => {
    const capturedRequests: CapturedRequest[] = []
    
    const handler = createCaptureHandler((request) => {
      capturedRequests.push(request)
    })
    
    const server = setupServer(handler)
    server.listen()
    
    try {
      await fetch('https://api.example.com/posts', {
        method: 'POST',
        body: JSON.stringify({ title: 'Test' })
      })
      
      expect(capturedRequests).toHaveLength(1)
      expect(capturedRequests[0].method).toBe('POST')
      expect(capturedRequests[0].url).toBe('https://api.example.com/posts')
      expect(capturedRequests[0].body).toBe('{"title":"Test"}')
    } finally {
      server.close()
    }
  })
})
```

## API リファレンス

### `createCaptureHandler(captureFn)`

全てのHTTPリクエストをキャプチャするMSWハンドラーを作成します。

**パラメータ:**
- `captureFn: RequestCaptureFn` - リクエストをキャプチャする関数

**戻り値:**
- `RequestHandler` - MSWリクエストハンドラー

### `CapturedRequest`

キャプチャされるリクエストの型定義です。

```typescript
interface CapturedRequest {
  method: string  // HTTP メソッド (GET, POST, など)
  url: string     // 完全なURL
  body?: string   // リクエストボディ (POST/PUT/PATCHの場合)
}
```

### `RequestCaptureFn`

キャプチャ関数の型定義です。

```typescript
type RequestCaptureFn = (request: CapturedRequest) => void
```

## ライセンス

ISC

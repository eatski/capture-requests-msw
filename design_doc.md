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

### バッチキャプチャの例

```typescript
import { setupServer } from 'msw/node'
import { BatchCapture, createBatchCaptureHandler, type CapturedRequest } from 'capture-requests-msw'

// バッチキャプチャインスタンスを作成
const batchCapture = new BatchCapture((requests: CapturedRequest[]) => {
  console.log(`バッチで ${requests.length} 件のリクエストを処理:`)
  requests.forEach(req => {
    console.log(`  ${req.method} ${req.url}`)
  })
})

// バッチキャプチャハンドラーを作成
const handler = createBatchCaptureHandler(batchCapture)

// MSWサーバーを作成・起動
const server = setupServer(handler)
server.listen()

// HTTPリクエストを実行
await fetch('https://api.example.com/users/1')
await fetch('https://api.example.com/posts')
await fetch('https://api.example.com/comments')

// チェックポイントでバッチ処理を実行
// リクエストはURLでソートされてからキャプチャ関数に渡される
batchCapture.checkpoint()

server.close()
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

### `createBatchCaptureHandler(batchCapture)`

バッチキャプチャ用のMSWハンドラーを作成します。

**パラメータ:**
- `batchCapture: BatchCapture` - バッチキャプチャインスタンス

**戻り値:**
- `RequestHandler` - MSWリクエストハンドラー

### `BatchCapture`

バッチキャプチャ機能を提供するクラスです。

**コンストラクタ:**
```typescript
new BatchCapture(captureFn: BatchRequestCaptureFn)
```

**メソッド:**
- `checkpoint(): void` - 蓄積されたリクエストを処理してバッチをリセット
- `reset(): void` - バッチの状態をリセット

### `BatchRequestCaptureFn`

バッチキャプチャ関数の型定義です。

```typescript
type BatchRequestCaptureFn = (requests: CapturedRequest[]) => void
```

## バッチキャプチャの特徴

- **チェックポイントベース**: `checkpoint()`メソッドを呼び出すタイミングでリクエストがまとめて処理されます
- **ソート機能**: リクエストはURLとメソッドでソートされ、フレーキーなテストを防ぎます
- **インスタンス分離**: 各テストで独立したBatchCaptureインスタンスを使用できます

## ライセンス

ISC

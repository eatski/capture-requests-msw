# デザインドキュメント

## 概要

このリポジトリは、MSW（Mock Service Worker）を使用してHTTPリクエストをキャプチャし、カスタム処理を注入できるライブラリです。テスト環境での使用に最適化されています。

## 特徴

- バッチキャプチャ: 複数のHTTPリクエストを一括でキャプチャし、まとめて処理できます。
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
import { createRequestsCaptureHandler, RequestCapturer, type CapturedRequest } from 'capture-requests-msw'

// キャプチャされたリクエストを保存する配列
const capturedRequests: CapturedRequest[] = []

// キャプチャラーを作成
const capturer = new RequestCapturer((requests) => {
  capturedRequests.push(...requests)
})

// ハンドラーを作成
const handler = createRequestsCaptureHandler(capturer)

// MSWサーバーを作成・起動
const server = setupServer(handler)
server.listen()

// HTTPリクエストを実行
await fetch('https://api.example.com/users')

// リクエストを処理
capturer.checkpoint()

// リクエストがキャプチャされている
console.log(capturedRequests)
// [{ method: 'GET', url: 'https://api.example.com/users' }]

server.close()
```

### カスタム処理の例

```typescript
import { RequestCapturer, createRequestsCaptureHandler } from 'capture-requests-msw'

const capturer = new RequestCapturer((requests) => {
  requests.forEach(request => {
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
  })
})

const handler = createRequestsCaptureHandler(capturer)
```

### グループ処理の例

```typescript
import { setupServer } from 'msw/node'
import { RequestCapturer, createRequestsCaptureHandler, type CapturedRequest } from 'capture-requests-msw'

// リクエストグループを保持する配列
const processedGroups: CapturedRequest[][] = []

// キャプチャラーを作成
const capturer = new RequestCapturer((requests) => {
  // リクエストはURLとメソッドでソートされた状態で渡される
  processedGroups.push([...requests])
})

// ハンドラーを作成
const handler = createRequestsCaptureHandler(capturer)

// MSWサーバーを作成・起動
const server = setupServer(handler)
server.listen()

// リクエストを実行
await fetch('https://api.example.com/users/1')
await fetch('https://api.example.com/posts')
await fetch('https://api.example.com/users/2')

// リクエストを処理
// リクエストはURLでソートされてからキャプチャ関数に渡される
capturer.checkpoint()

server.close()
```

### Vitestでのテスト例

```typescript
import { describe, it, expect } from 'vitest'
import { setupServer } from 'msw/node'
import { RequestCapturer, createRequestsCaptureHandler, type CapturedRequest } from 'capture-requests-msw'

describe('API Tests', () => {
  it('リクエストをキャプチャできる', async () => {
    const capturedRequests: CapturedRequest[] = []
    
    // キャプチャラーを作成
    const capturer = new RequestCapturer((requests) => {
      capturedRequests.push(...requests)
    })
    
    // ハンドラーを作成
    const handler = createRequestsCaptureHandler(capturer)
    const server = setupServer(handler)
    server.listen()
    
    try {
      await fetch('https://api.example.com/posts', {
        method: 'POST',
        body: JSON.stringify({ title: 'Test' })
      })
      
      // リクエストを処理
      capturer.checkpoint()
      
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

### `createRequestsCaptureHandler(capturer)`

全てのHTTPリクエストをキャプチャするMSWハンドラーを作成します。

**パラメータ:**
- `capturer: RequestCapturer` - リクエストをキャプチャするインスタンス

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

### `CapturedRequestsHandler`

リクエストハンドラの型定義です。

```typescript
type CapturedRequestsHandler = (requests: CapturedRequest[]) => void
```

### `RequestCapturer`

リクエストのキャプチャと処理を行うクラスです。

**コンストラクタ:**
```typescript
new RequestCapturer(handler: CapturedRequestsHandler)
```

**メソッド:**
- `addRequest(request: CapturedRequest): void` - リクエストを内部バッファに追加します。
- `checkpoint(): void` - 蓄積されたリクエストをソートして処理し、バッファをリセットします。
- `reset(): void` - 内部バッファの状態をリセットします。

### リクエスト処理の特徴

- **ソート機能**: リクエストはURLとメソッドでソートされ、処理の一貫性を保ちます。
- **グループ処理**: 明示的な処理タイミングの制御が可能です。
- **バッファリング**: リクエストは一時的にバッファリングされ、まとめて処理されます。
- **フレキシブルな処理**: カスタムハンドラによって柔軟な処理が可能です。

## ライセンス

ISC

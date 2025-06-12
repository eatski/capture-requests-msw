# capture-requests-msw

MSWで全てのHTTPリクエストをキャプチャし、バッチ処理やカスタム処理を注入できる高機能ライブラリです。

## 特徴

- 🔍 **全リクエストキャプチャ**: すべてのHTTP通信を自動的にキャプチャ
- 🔄 **Fallthrough**: 実際のネットワークリクエストはそのまま通す
- 🎯 **バッチ処理**: リクエストをグループ化して効率的に処理
- ⏰ **自動チェックポイント**: 指定時間後に自動でバッチ処理を実行
- 🎮 **レスポンス制御**: チェックポイント実行まで待機する機能
- 📝 **スマートソート**: URLとメソッドでリクエストを自動ソート
- 🧪 **テスト特化**: テスト環境での使用に最適化
- 🎲 **テスト支援ツール**: シード可能な疑似乱数生成器付き

## インストール

```bash
npm install capture-requests-msw msw
```

## 使用方法

### 基本的な使用例

```typescript
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { RequestCapturer, createRequestsCaptureHandler, type CapturedRequest } from 'capture-requests-msw'

// キャプチャされたリクエストを保存する配列
const capturedRequests: CapturedRequest[] = []

// キャプチャラーを作成
const capturer = new RequestCapturer((requests) => {
  capturedRequests.push(...requests)
  console.log(`キャプチャしたリクエスト数: ${requests.length}`)
})

// ユーザー側で定義するハンドラー
const userHandler = http.get('https://api.example.com/users', () => {
  return HttpResponse.json({ id: 1, name: 'テストユーザー' })
})

// キャプチャハンドラーを最初に配置（fallthrough）
const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
const server = setupServer(captureHandler, userHandler)
server.listen()

// HTTPリクエストを実行
const response = await fetch('https://api.example.com/users')
const data = await response.json()

// 手動でチェックポイントを実行
capturer.checkpoint()

// リクエストがキャプチャされ、ユーザーハンドラーの結果も取得
console.log(capturedRequests) // [{ method: 'GET', url: '...' }]
console.log(data) // { id: 1, name: 'テストユーザー' }

server.close()
```

### 自動チェックポイント機能

```typescript
import { RequestCapturer, createRequestsCaptureHandler } from 'capture-requests-msw'

const capturedRequests: CapturedRequest[] = []

// 100ms後に自動でチェックポイントを実行
const capturer = new RequestCapturer((requests) => {
  capturedRequests.push(...requests)
}, { timeoutMs: 100 })

const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
const server = setupServer(captureHandler, userHandler)
server.listen()

// リクエストを実行
await fetch('https://api.example.com/users')

// 100ms待機すると自動でキャプチャが実行される
// 手動でcheckpoint()を呼ぶ必要がない
```

### レスポンス制御機能 (waitForCheckpoint)

```typescript
// チェックポイント実行まで待機してからfallthroughする
const capturer = new RequestCapturer((requests) => {
  // カスタム処理を実行
  processRequests(requests)
}, { 
  timeoutMs: 100,
  waitForCheckpoint: true 
})

const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
const server = setupServer(captureHandler, userHandler)
server.listen()

// このリクエストは自動チェックポイント実行（100ms後）まで待機してから
// ユーザーハンドラーに委譲される
const response = await fetch('https://api.example.com/users')
// この時点で既にキャプチャ処理も完了している
```

### バッチ処理とグループ化

```typescript
const processedGroups: CapturedRequest[][] = []

const capturer = new RequestCapturer((requests) => {
  // リクエストはURLとメソッドでソートされて渡される
  processedGroups.push([...requests])
  console.log(`グループ ${processedGroups.length}: ${requests.length}件のリクエスト`)
})

// 複数のリクエストを実行
await fetch('https://api.example.com/users/1')
await fetch('https://api.example.com/posts')
await fetch('https://api.example.com/users/2')

// グループでまとめて処理
capturer.checkpoint()

// リクエストはソートされて1つのグループとして処理される
// processedGroups[0] には3つのリクエストが含まれる
```

### カスタム処理の例

```typescript
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
```

### テスト支援ツールの使用

```typescript
import { SeededRandom } from 'capture-requests-msw/test-utils'

// 再現可能なランダム値を生成
const rng = new SeededRandom(12345)

// ランダムな遅延
await rng.randomDelay(10, 50) // 10-50msの遅延

// 配列をランダムシャッフル
const urls = ['url1', 'url2', 'url3']
const shuffled = rng.shuffle(urls)

// ランダムな整数
const randomId = rng.nextInt(1, 100) // 1-100の整数
```

### Vitestでの完全なテスト例

```typescript
import { describe, it, expect } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { RequestCapturer, createRequestsCaptureHandler, type CapturedRequest } from 'capture-requests-msw'

describe('API Tests', () => {
  it('複数のリクエストをバッチでキャプチャできる', async () => {
    const capturedGroups: CapturedRequest[][] = []
    
    const capturer = new RequestCapturer((requests) => {
      capturedGroups.push([...requests])
    })
    
    const userHandler = http.get('https://api.example.com/users/:id', ({ params }) => {
      return HttpResponse.json({ id: params.id, name: `ユーザー${params.id}` })
    })
    
    const postHandler = http.post('https://api.example.com/posts', async ({ request }) => {
      const body = await request.json() as Record<string, any>
      return HttpResponse.json({ id: 123, ...body })
    })
    
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
    const server = setupServer(captureHandler, userHandler, postHandler)
    server.listen()
    
    try {
      // 複数のリクエストを実行
      const userResponse = await fetch('https://api.example.com/users/1')
      const postResponse = await fetch('https://api.example.com/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'テスト投稿' })
      })
      
      // バッチ処理を実行
      capturer.checkpoint()
      
      // リクエストがソートされてキャプチャされている
      expect(capturedGroups).toHaveLength(1)
      expect(capturedGroups[0]).toHaveLength(2)
      expect(capturedGroups[0][0].url).toBe('https://api.example.com/posts')
      expect(capturedGroups[0][0].method).toBe('POST')
      expect(capturedGroups[0][1].url).toBe('https://api.example.com/users/1')
      expect(capturedGroups[0][1].method).toBe('GET')
      
      // ユーザーハンドラーの結果も正常に取得
      const userData = await userResponse.json()
      const postData = await postResponse.json()
      expect(userData).toEqual({ id: '1', name: 'ユーザー1' })
      expect(postData).toEqual({ id: 123, title: 'テスト投稿' })
    } finally {
      server.close()
    }
  })
  
  it('自動チェックポイントが動作する', async () => {
    const capturedRequests: CapturedRequest[] = []
    
    // 50ms後に自動チェックポイント
    const capturer = new RequestCapturer((requests) => {
      capturedRequests.push(...requests)
    }, { timeoutMs: 50 })
    
    const handler = http.get('https://api.example.com/test', () => {
      return HttpResponse.json({ success: true })
    })
    
    const captureHandler = http.all('*', createRequestsCaptureHandler(capturer))
    const server = setupServer(captureHandler, handler)
    server.listen()
    
    try {
      await fetch('https://api.example.com/test')
      
      // まだキャプチャされていない
      expect(capturedRequests).toHaveLength(0)
      
      // 60ms待機
      await new Promise(resolve => setTimeout(resolve, 60))
      
      // 自動チェックポイントが実行されている
      expect(capturedRequests).toHaveLength(1)
      expect(capturedRequests[0].url).toBe('https://api.example.com/test')
    } finally {
      server.close()
    }
  })
})
```

## API リファレンス

### `RequestCapturer`

リクエストをバッチで管理するメインクラス。

#### コンストラクタ

```typescript
constructor(
  handler: CapturedRequestsHandler,
  autoCheckpointOptions?: AutoCheckpointOptions
)
```

**パラメータ:**
- `handler: CapturedRequestsHandler` - キャプチャされたリクエストグループを処理する関数
- `autoCheckpointOptions?: AutoCheckpointOptions` - 自動チェックポイントの設定

#### メソッド

- `addRequest(request: CapturedRequest): void` - リクエストをバッチに追加
- `checkpoint(): void` - バッチを処理してリセット
- `waitForResponse(): Promise<void>` - waitForCheckpointが有効な場合の待機処理

### `createRequestsCaptureHandler(capturer: RequestCapturer)`

MSWハンドラーを作成する関数。

**パラメータ:**
- `capturer: RequestCapturer` - RequestCapturerのインスタンス

**戻り値:**
- MSWリクエストハンドラー関数

### `AutoCheckpointOptions`

自動チェックポイントの設定。

```typescript
interface AutoCheckpointOptions {
  timeoutMs: number           // リクエストがない状態が続いた場合の自動チェックポイント実行時間
  waitForCheckpoint?: boolean // チェックポイント実行まで待機するかどうか
}
```

### `CapturedRequest`

キャプチャされるリクエストの型定義。

```typescript
interface CapturedRequest {
  method: string  // HTTP メソッド (GET, POST, など)
  url: string     // 完全なURL
  body?: string   // リクエストボディ (POST/PUT/PATCHの場合)
}
```

### `CapturedRequestsHandler`

リクエストグループを処理する関数の型定義。

```typescript
type CapturedRequestsHandler = (requests: CapturedRequest[]) => void
```

### `SeededRandom` (テスト支援ツール)

テスト用の再現可能な疑似乱数生成器。

```typescript
import { SeededRandom } from 'capture-requests-msw/test-utils'

const rng = new SeededRandom(seed: number)
```

#### メソッド

- `next(): number` - 0-1の疑似乱数を生成
- `nextInt(min: number, max: number): number` - 指定範囲の整数を生成
- `shuffle<T>(array: T[]): T[]` - 配列をランダムシャッフル
- `randomDelay(minMs?: number, maxMs?: number): Promise<void>` - ランダムな遅延を追加

## 高度な使用例

### 複数のチェックポイントでリクエストを段階的に処理

```typescript
const stage1Requests: CapturedRequest[] = []
const stage2Requests: CapturedRequest[] = []

const capturer = new RequestCapturer((requests) => {
  stage1Requests.push(...requests)
})

// 第1段階のリクエスト
await fetch('/api/users')
await fetch('/api/posts')
capturer.checkpoint()

// 第2段階の処理に切り替え
const capturer2 = new RequestCapturer((requests) => {
  stage2Requests.push(...requests)
})

// 第2段階のリクエスト
await fetch('/api/comments')
capturer2.checkpoint()
```

### waitForCheckpointを使った順次処理の制御

```typescript
const capturer = new RequestCapturer((requests) => {
  // 各リクエストが個別にキャプチャされる
  console.log(`処理中: ${requests[0].url}`)
}, { 
  timeoutMs: 50,
  waitForCheckpoint: true 
})

// 各fetchは前のチェックポイント完了を待って実行される
const response1 = await fetch('/api/step1')
const response2 = await fetch('/api/step2')
const response3 = await fetch('/api/step3')
```

## ライセンス

ISC

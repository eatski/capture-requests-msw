# デザインドキュメント

## 概要

このリポジトリは、MSW（Mock Service Worker）を使用してHTTPリクエストをキャプチャし、カスタム処理を注入できるライブラリです。テスト環境での使用に最適化されています。

## 特徴

- バッチキャプチャ: 複数のHTTPリクエストを一括でキャプチャし、まとめて処理できます。
- Fallthrough: 実際のネットワークリクエストはそのまま通します。
- カスタム処理: 独自のキャプチャ関数を注入可能です。
- 自動チェックポイント: 指定時間経過後に自動でリクエストを処理できます。
- シンプル: method、url、bodyのみをキャプチャします。
- テスト特化: テスト環境での使用に最適化されています。
- ランダムタイミング対応: ランダムなタイミングで実行されるリクエストでも一定の結果を保証します。

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

### 自動チェックポイント機能の例

```typescript
import { setupServer } from 'msw/node'
import { RequestCapturer, createRequestsCaptureHandler, type CapturedRequest } from 'capture-requests-msw'

// キャプチャされたリクエストを保存する配列
const capturedRequests: CapturedRequest[] = []

// 自動チェックポイントを1秒（1000ms）で設定
const capturer = new RequestCapturer((requests) => {
  capturedRequests.push(...requests)
}, { timeoutMs: 1000 })

// ハンドラーを作成
const handler = createRequestsCaptureHandler(capturer)

// MSWサーバーを作成・起動
const server = setupServer(handler)
server.listen()

// HTTPリクエストを実行
await fetch('https://api.example.com/users')

// 1秒後に自動でチェックポイントが実行される
// 手動でcheckpoint()を呼ぶ必要がない

// 少し待つ
await new Promise(resolve => setTimeout(resolve, 1100))

// リクエストが自動で処理されている
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

  it('自動チェックポイント機能を使う', async () => {
    const capturedRequests: CapturedRequest[] = []
    
    // 自動チェックポイントを100msで設定
    const capturer = new RequestCapturer((requests) => {
      capturedRequests.push(...requests)
    }, { timeoutMs: 100 })
    
    // ハンドラーを作成
    const handler = createRequestsCaptureHandler(capturer)
    const server = setupServer(handler)
    server.listen()
    
    try {
      await fetch('https://api.example.com/users')
      
      // 110ms待機で自動チェックポイントが実行される
      await new Promise(resolve => setTimeout(resolve, 110))
      
      expect(capturedRequests).toHaveLength(1)
      expect(capturedRequests[0].method).toBe('GET')
      expect(capturedRequests[0].url).toBe('https://api.example.com/users')
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

### `AutoCheckpointOptions`

自動チェックポイント機能の設定を定義するインターフェースです。

```typescript
interface AutoCheckpointOptions {
  timeoutMs: number  // リクエストがない状態がこのミリ秒数続いた場合に自動でチェックポイントを作成
}
```

### `RequestCapturer`

リクエストのキャプチャと処理を行うクラスです。

**コンストラクタ:**
```typescript
new RequestCapturer(handler: CapturedRequestsHandler, autoCheckpointOptions?: AutoCheckpointOptions)
```

**パラメータ:**
- `handler: CapturedRequestsHandler` - リクエストを処理するハンドラ関数
- `autoCheckpointOptions?: AutoCheckpointOptions` - オプション: 自動チェックポイント設定

**メソッド:**
- `addRequest(request: CapturedRequest): void` - リクエストを内部バッファに追加します。
- `checkpoint(): void` - 蓄積されたリクエストをソートして処理し、バッファをリセットします。

### リクエスト処理の特徴

- **ソート機能**: リクエストはURLとメソッドでソートされ、処理の一貫性を保ちます。
- **グループ処理**: 明示的な処理タイミングの制御が可能です。
- **バッファリング**: リクエストは一時的にバッファリングされ、まとめて処理されます。
- **自動チェックポイント**: 指定時間経過後の自動処理が可能です。
- **フレキシブルな処理**: カスタムハンドラによって柔軟な処理が可能です。
- **ランダムタイミング安定性**: ランダムなタイミングで実行されるリクエストでも一定の結果を保証します。

## テスト品質保証

### ランダムタイミングでの安定性テスト

このライブラリは、実際のアプリケーションで発生する可能性があるランダムなタイミングでのHTTPリクエスト実行に対して、安定した結果を保証するための包括的なテストを実装しています。

#### テスト手法

- **シード固定の疑似乱数生成器**: 再現可能なランダムテストを実現するため、Linear Congruential Generator (LCG)を使用してシード値を固定しています。
- **複数seedによるeachテスト**: 5つの異なるseed値（12345, 67890, 98765, 24680, 13579）を使用して、様々なランダムパターンでの動作を検証しています。
- **ランダム遅延とシャッフル**: リクエストの実行順序をランダムにシャッフルし、各リクエスト間にランダムな遅延（1-50ms）を追加してより現実的な条件を再現しています。

#### 検証項目

1. **基本的なランダムタイミングテスト**: 6つの異なるリクエスト（GET/POSTを含む）をランダムなタイミングで実行し、ソート順序と内容の一貫性を検証
2. **自動チェックポイントとの組み合わせ**: 自動チェックポイント機能とランダムタイミングが組み合わさった場合の動作を検証
3. **大量リクエストでのスケーラビリティ**: 15個の大量リクエスト（GET 10個、POST 5個）でのソート安定性を検証
4. **同時実行的リクエストでのソート順**: 同じURLに対する異なるメソッドのリクエストが混在した場合のソート順序を検証

#### 検証結果の一貫性

- **URLソート**: リクエストは必ずURL文字列の辞書順でソートされます
- **メソッドソート**: 同一URL内では、HTTPメソッド名の辞書順でソートされます
- **同一リクエスト処理**: 同じURL・メソッドのリクエストは順序によらず適切に処理されます
- **ボディ内容保持**: POSTリクエストのボディ内容は実行順序に関係なく正確に保持されます

これらのテストにより、本ライブラリがマルチスレッド環境や非同期処理が多い現代のWebアプリケーションにおいても、安定した動作を保証することを確認しています。

## ライセンス

ISC

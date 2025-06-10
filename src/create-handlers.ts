import { http, HttpResponse, passthrough } from 'msw'
import type { RequestHandler } from 'msw'

// リクエストキャプチャ関数の型
export type RequestCaptureFn = (request: Request) => void

// ハンドラーを動的に生成する関数
export function createHandlers(captureFn?: RequestCaptureFn): RequestHandler[] {
  return [
    // ユーザー情報を取得するAPIのモック
    http.get('https://api.example.com/users/:id', ({ params }) => {
      const { id } = params
      
      return HttpResponse.json({
        id,
        name: `ユーザー${id}`,
        email: `user${id}@example.com`,
        status: 'active'
      })
    }),

    // POSTリクエストのモック
    http.post('https://api.example.com/users', async ({ request }) => {
      const user = await request.json() as { name: string; email: string }
      
      return HttpResponse.json({
        id: '123',
        ...user,
        createdAt: new Date().toISOString()
      }, { status: 201 })
    }),

    // 全てのリクエストをキャプチャしてfallthroughするハンドラー
    http.all('*', ({ request }) => {
      // キャプチャ関数が提供されている場合は呼び出す
      if (captureFn) {
        captureFn(request)
      }
      
      // 実際のネットワークリクエストを通す
      return passthrough()
    })
  ]
}

import { http, passthrough } from 'msw'
import type { RequestHandler } from 'msw'

export interface CapturedRequest {
  method: string
  url: string
  body?: string
}

export type RequestCaptureFn = (request: CapturedRequest) => void

/**
 * 全てのHTTPリクエストをキャプチャしてfallthroughするMSWハンドラーを作成
 * @param captureFn リクエストをキャプチャする関数
 * @returns MSWリクエストハンドラー
 */
export function createCaptureHandler(captureFn: RequestCaptureFn): RequestHandler {
  return http.all('*', async ({ request }) => {
    const capturedRequest: CapturedRequest = {
      method: request.method,
      url: request.url,
    }

    if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
      try {
        const body = await request.clone().text()
        capturedRequest.body = body
      } catch {
        // ボディ読み取りエラーは無視
      }
    }

    // キャプチャ関数を呼び出し
    captureFn(capturedRequest)
    
    // 別のハンドラーに処理を委譲
    return undefined
  })
}

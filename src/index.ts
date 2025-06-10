import { http, passthrough } from 'msw'
import type { RequestHandler } from 'msw'

export interface CapturedRequest {
  method: string
  url: string
  body?: string
}

export type CapturedRequestsHandler = (requests: CapturedRequest[]) => void

/**
 * リクエストをバッチでキャプチャし、指定されたタイミングで処理するクラス。
 */
export class RequestCapturer {
  private currentBatch: CapturedRequest[] = []
  private handler: CapturedRequestsHandler

  constructor(handler: CapturedRequestsHandler) {
    this.handler = handler
  }

  /**
   * リクエストを内部バッチに追加します。
   * @param request キャプチャされたリクエストオブジェクト
   */
  addRequest(request: CapturedRequest): void {
    this.currentBatch.push(request)
  }

  /**
   * 蓄積されたリクエストを指定されたハンドラで処理し、バッチをリセットします。
   * リクエストはURLとメソッドでソートされてからハンドラに渡されます。
   */
  checkpoint(): void {
    if (this.currentBatch.length > 0) {
      const sortedRequests = [...this.currentBatch].sort((a, b) => {
        if (a.url === b.url) {
          return a.method.localeCompare(b.method)
        }
        return a.url.localeCompare(b.url)
      })
      
      this.handler(sortedRequests)
    }
    this.currentBatch = []
  }

  /**
   * 現在のバッチをリセットします。処理されなかったリクエストは破棄されます。
   */
  reset(): void {
    this.currentBatch = []
  }
}

/**
 * HTTPリクエストをキャプチャするためのMSWリクエストハンドラを作成します。
 * @param capturer RequestCapturerのインスタンス
 * @returns MSWリクエストハンドラ
 */
export function createRequestsCaptureHandler(capturer: RequestCapturer): RequestHandler {
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

    // バッチにリクエストを追加
    capturer.addRequest(capturedRequest)
    
    // 別のハンドラーに処理を委譲
    return undefined
  })
}

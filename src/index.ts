import { http, passthrough } from 'msw'
import type { RequestHandler } from 'msw'

export interface CapturedRequest {
  method: string
  url: string
  body?: string
}

export type RequestCaptureFn = (request: CapturedRequest) => void
export type BatchRequestCaptureFn = (requests: CapturedRequest[]) => void

/**
 * バッチキャプチャ機能を提供するクラス
 */
export class BatchCapture {
  private currentBatch: CapturedRequest[] = []
  private batchCaptureFn: BatchRequestCaptureFn

  constructor(captureFn: BatchRequestCaptureFn) {
    this.batchCaptureFn = captureFn
  }

  /**
   * リクエストをバッチに追加
   */
  addRequest(request: CapturedRequest): void {
    this.currentBatch.push(request)
  }

  /**
   * 蓄積されたリクエストを処理してバッチをリセット
   * リクエストはURLでソートされてからキャプチャ関数に渡される
   */
  checkpoint(): void {
    if (this.currentBatch.length > 0) {
      // フレーキーなテストを避けるためにリクエストをソート
      const sortedRequests = [...this.currentBatch].sort((a, b) => {
        // URLでソート、同じURLの場合はメソッドでソート
        if (a.url === b.url) {
          return a.method.localeCompare(b.method)
        }
        return a.url.localeCompare(b.url)
      })
      
      this.batchCaptureFn(sortedRequests)
    }
    
    // バッチをリセット
    this.currentBatch = []
  }

  /**
   * バッチの状態をリセット
   */
  reset(): void {
    this.currentBatch = []
  }
}

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

/**
 * バッチキャプチャ用のMSWハンドラーを作成
 * @param batchCapture BatchCaptureインスタンス
 * @returns MSWリクエストハンドラー
 */
export function createBatchCaptureHandler(batchCapture: BatchCapture): RequestHandler {
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
    batchCapture.addRequest(capturedRequest)
    
    // 別のハンドラーに処理を委譲
    return undefined
  })
}

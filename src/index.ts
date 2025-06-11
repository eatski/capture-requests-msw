import { http } from 'msw'
import type { RequestHandler } from 'msw'

export interface CapturedRequest {
  method: string
  url: string
  body?: string
}

export type CapturedRequestsHandler = (requests: CapturedRequest[]) => void

export interface AutoCheckpointOptions {
  /**
   * リクエストがない状態がこのミリ秒数続いた場合に自動でチェックポイントを作成します。
   */
  timeoutMs: number
  /**
   * trueの場合、リクエストがtimeoutMs来ないタイミングが来るまでresponse(fallthrough)を待機します。
   */
  waitForFallthrough?: boolean
}

/**
 * リクエストをバッチでキャプチャし、指定されたタイミングで処理するクラス。
 */
export class RequestCapturer {
  private currentBatch: CapturedRequest[] = []
  private handler: CapturedRequestsHandler
  private autoCheckpointOptions?: AutoCheckpointOptions
  private timeoutId?: NodeJS.Timeout
  private pendingResponses: (() => void)[] = []

  constructor(handler: CapturedRequestsHandler, autoCheckpointOptions?: AutoCheckpointOptions) {
    this.handler = handler
    this.autoCheckpointOptions = autoCheckpointOptions
  }

  /**
   * 自動チェックポイントのタイマーを開始します。
   */
  private startAutoCheckpointTimer(): void {
    if (!this.autoCheckpointOptions) return
    
    this.clearAutoCheckpointTimer()
    this.timeoutId = setTimeout(() => {
      this.checkpoint()
    }, this.autoCheckpointOptions.timeoutMs)
  }

  /**
   * 自動チェックポイントのタイマーをクリアします。
   */
  private clearAutoCheckpointTimer(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = undefined
    }
  }

  /**
   * リクエストを内部バッチに追加します。
   * @param request キャプチャされたリクエストオブジェクト
   */
  addRequest(request: CapturedRequest): void {
    this.currentBatch.push(request)
    
    // 自動チェックポイントのタイマーを再開始
    this.startAutoCheckpointTimer()
  }

  /**
   * waitForFallthroughが有効な場合にレスポンスを待機登録します。
   * @returns 待機が完了するまでのPromise
   */
  waitForResponse(): Promise<void> {
    if (!this.autoCheckpointOptions?.waitForFallthrough) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      this.pendingResponses.push(resolve)
    })
  }


  /**
   * 蓄積されたリクエストを指定されたハンドラで処理し、バッチをリセットします。
   * リクエストはURLとメソッドでソートされてからハンドラに渡されます。
   */
  checkpoint(): void {
    this.clearAutoCheckpointTimer()
    
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
    
    // 待機中のレスポンスを解放
    const responses = this.pendingResponses
    this.pendingResponses = []
    responses.forEach(resolve => resolve())
  }

}

/**
 * HTTPリクエストをキャプチャするためのハンドラー関数を作成します。
 * @param capturer RequestCapturerのインスタンス
 * @returns ハンドラー関数
 */
export function createRequestsCaptureHandler(capturer: RequestCapturer) {
  return async ({ request }: { request: Request }) => {
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
    
    // waitForFallthroughが有効な場合、チェックポイントまで待機
    await capturer.waitForResponse()
    
    // 常に別のハンドラーに処理を委譲（fallthrough）
    return undefined
  }
}

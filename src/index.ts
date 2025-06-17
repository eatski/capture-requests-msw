export interface CapturedRequest {
  method: string
  url: string
  body?: string
}

export type CapturedRequestsHandler = (requests: CapturedRequest[]) => void

export interface CheckpointOptions {
  /**
   * リクエストがない状態がこのミリ秒数続いた場合に自動でチェックポイントを作成します。
   */
  timeoutMs: number
  /**
   * trueの場合、チェックポイントが実行されるまでレスポンスを待機します。
   */
  waitForCheckpoint?: boolean
}

export interface CreateRequestsCaptureHandlerOptions {
  handler: CapturedRequestsHandler
  options?: CheckpointOptions
}

/**
 * HTTPリクエストをキャプチャするためのハンドラー関数を作成します。
 * @param options 設定オプション
 * @returns handler関数とcheckpoint関数を含むオブジェクト
 */
export function createRequestsCaptureHandler(options: CreateRequestsCaptureHandlerOptions) {
  const currentBatch: CapturedRequest[] = []
  const { handler, options: autoCheckpoint } = options
  let timeoutId: NodeJS.Timeout | undefined
  let pendingResponses: (() => void)[] = []

  /**
   * 自動チェックポイントのタイマーを開始します。
   */
  const startAutoCheckpointTimer = (): void => {
    if (!autoCheckpoint) return
    
    clearAutoCheckpointTimer()
    timeoutId = setTimeout(() => {
      checkpoint()
    }, autoCheckpoint.timeoutMs)
  }

  /**
   * 自動チェックポイントのタイマーをクリアします。
   */
  const clearAutoCheckpointTimer = (): void => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }
  }

  /**
   * 蓄積されたリクエストを指定されたハンドラで処理し、バッチをリセットします。
   * リクエストはURLとメソッドでソートされてからハンドラに渡されます。
   */
  const checkpoint = (): void => {
    clearAutoCheckpointTimer()
    
    if (currentBatch.length > 0) {
      const sortedRequests = [...currentBatch].sort((a, b) => {
        if (a.url === b.url) {
          return a.method.localeCompare(b.method)
        }
        return a.url.localeCompare(b.url)
      })
      
      handler(sortedRequests)
    }
    currentBatch.length = 0
    
    // 待機中のレスポンスを解放
    const responses = pendingResponses
    pendingResponses = []
    responses.forEach(resolve => resolve())
  }

  const requestHandler = async ({ request }: { request: Request }) => {
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
    currentBatch.push(capturedRequest)
    
    // 自動チェックポイントのタイマーを再開始
    startAutoCheckpointTimer()
    
    // waitForCheckpointが有効な場合、チェックポイントまで待機
    if (autoCheckpoint?.waitForCheckpoint) {
      await new Promise<void>((resolve) => {
        pendingResponses.push(resolve)
      })
    }
    
    // 常に別のハンドラーに処理を委譲（fallthrough）
    return undefined
  }

  return {
    handler: requestHandler,
    checkpoint
  }
}

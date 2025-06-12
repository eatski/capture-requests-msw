import { SeededRandom } from '../src/test-utils'

// ランダムな遅延を追加するヘルパー関数
export async function randomDelay(rng: SeededRandom, minMs: number = 1, maxMs: number = 50): Promise<void> {
  await rng.randomDelay(minMs, maxMs)
}

// 複数のHTTPリクエストをランダムなタイミングで実行するヘルパー関数
export async function executeRequestsRandomly(
  rng: SeededRandom,
  requests: Array<{ url: string; method?: string; body?: any }>
): Promise<Response[]> {
  // リクエストの順序をシャッフル
  const shuffledRequests = rng.shuffle(requests)
  
  // 各リクエストをランダムな遅延で実行
  const responsePromises = shuffledRequests.map(async (req, index) => {
    // 最初のリクエスト以外はランダムな遅延を追加
    if (index > 0) {
      await randomDelay(rng)
    }
    
    const options: RequestInit = {
      method: req.method || 'GET'
    }
    
    if (req.body) {
      options.headers = { 'Content-Type': 'application/json' }
      options.body = JSON.stringify(req.body)
    }
    
    return fetch(req.url, options)
  })
  
  return Promise.all(responsePromises)
}
import { http, HttpResponse, passthrough } from 'msw'

export const handlers = [
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

  // 全てのリクエストをログ出力してfallthroughするハンドラー
  http.all('*', ({ request }) => {
    const url = new URL(request.url)
    console.log(`🔍 [MSW] ${request.method} ${url.pathname}${url.search}`)
    console.log(`   URL: ${request.url}`)
    console.log(`   Headers: ${JSON.stringify(Object.fromEntries(request.headers.entries()), null, 2)}`)
    
    // リクエストボディがある場合は表示（クローンしてログ出力）
    if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
      request.clone().text().then(body => {
        if (body) {
          console.log(`   Body: ${body}`)
        }
      }).catch(() => {
        // エラーが発生した場合は無視
      })
    }
    
    // 実際のネットワークリクエストを通す
    return passthrough()
  })
]

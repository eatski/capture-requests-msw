import { http, HttpResponse } from 'msw'

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
  })
]

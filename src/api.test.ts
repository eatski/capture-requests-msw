import { describe, it, expect } from 'vitest'

// 型定義
interface User {
  id: string
  name: string
  email: string
  status: string
}

interface CreateUserResponse {
  id: string
  name: string
  email: string
  createdAt: string
}

// APIを呼び出す関数
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`https://api.example.com/users/${id}`)
  if (!response.ok) {
    throw new Error('Failed to fetch user')
  }
  return response.json() as Promise<User>
}

async function createUser(userData: { name: string; email: string }): Promise<CreateUserResponse> {
  const response = await fetch('https://api.example.com/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  })
  if (!response.ok) {
    throw new Error('Failed to create user')
  }
  return response.json() as Promise<CreateUserResponse>
}

describe('API Tests with MSW', () => {
  it('ユーザー情報を取得できる', async () => {
    const user = await fetchUser('123')
    
    expect(user).toEqual({
      id: '123',
      name: 'ユーザー123',
      email: 'user123@example.com',
      status: 'active'
    })
  })

  it('新しいユーザーを作成できる', async () => {
    const userData = {
      name: '田中太郎',
      email: 'tanaka@example.com'
    }
    
    const result = await createUser(userData)
    
    expect(result).toMatchObject({
      id: '123',
      name: '田中太郎',
      email: 'tanaka@example.com'
    })
    expect(result).toHaveProperty('createdAt')
    expect(typeof result.createdAt).toBe('string')
  })

  it('複数のAPIリクエストをテストできる', async () => {
    // 複数のユーザーを取得
    const user1 = await fetchUser('1')
    const user2 = await fetchUser('2')
    
    expect(user1.name).toBe('ユーザー1')
    expect(user2.name).toBe('ユーザー2')
    expect(user1.id).toBe('1')
    expect(user2.id).toBe('2')
  })
})

import { beforeAll, afterEach, afterAll } from 'vitest'
import { server } from './src/mocks/server'

// テスト開始前にMSWサーバーを起動
beforeAll(() => server.listen())

// 各テスト後にハンドラーをリセット
afterEach(() => server.resetHandlers())

// すべてのテスト終了後にサーバーを停止
afterAll(() => server.close())

/**
 * シード可能な疑似乱数生成器
 * テスト用途で再現可能なランダム値を生成するために使用
 */
export class SeededRandom {
  private seed: number

  constructor(seed: number) {
    this.seed = seed
  }

  /**
   * Linear Congruential Generator (LCG)
   * 0から1の間の疑似乱数を生成
   */
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % Math.pow(2, 32)
    return this.seed / Math.pow(2, 32)
  }

  /**
   * 指定範囲の整数を生成
   * @param min 最小値（含む）
   * @param max 最大値（含む）
   * @returns min以上max以下の整数
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  /**
   * 配列をランダムにシャッフル
   * @param array シャッフルする配列
   * @returns シャッフル済みの新しい配列
   */
  shuffle<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i)
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

}

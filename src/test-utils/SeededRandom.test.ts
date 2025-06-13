import { describe, it, expect } from 'vitest'
import { SeededRandom } from './SeededRandom'

describe('SeededRandom', () => {

  describe('next()', () => {
    it('should generate deterministic values', () => {
      const rng = new SeededRandom(12345)
      const values = [rng.next(), rng.next(), rng.next()]
      
      expect(values).toMatchSnapshot()
    })

    it('should generate same sequence with same seed', () => {
      const rng1 = new SeededRandom(12345)
      const rng2 = new SeededRandom(12345)
      
      const values1 = [rng1.next(), rng1.next(), rng1.next()]
      const values2 = [rng2.next(), rng2.next(), rng2.next()]
      
      expect(values1).toEqual(values2)
    })

    it('should generate different sequences with different seeds', () => {
      const rng1 = new SeededRandom(12345)
      const rng2 = new SeededRandom(54321)
      
      const values1 = [rng1.next(), rng1.next(), rng1.next()]
      const values2 = [rng2.next(), rng2.next(), rng2.next()]
      
      expect(values1).not.toEqual(values2)
    })

    it('should generate values between 0 and 1', () => {
      const rng = new SeededRandom(12345)
      
      for (let i = 0; i < 100; i++) {
        const value = rng.next()
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThan(1)
      }
    })
  })

  describe('nextInt()', () => {
    it('should generate deterministic integers', () => {
      const rng = new SeededRandom(12345)
      const values = [
        rng.nextInt(1, 10),
        rng.nextInt(1, 10),
        rng.nextInt(1, 10)
      ]
      
      expect(values).toMatchSnapshot()
    })

    it('should generate integers within specified range', () => {
      const rng = new SeededRandom(12345)
      
      for (let i = 0; i < 100; i++) {
        const value = rng.nextInt(5, 15)
        expect(value).toBeGreaterThanOrEqual(5)
        expect(value).toBeLessThanOrEqual(15)
        expect(Number.isInteger(value)).toBe(true)
      }
    })

    it('should handle single value range', () => {
      const rng = new SeededRandom(12345)
      const value = rng.nextInt(7, 7)
      expect(value).toBe(7)
    })

    it('should generate same sequence with same seed', () => {
      const rng1 = new SeededRandom(12345)
      const rng2 = new SeededRandom(12345)
      
      const values1 = [rng1.nextInt(1, 100), rng1.nextInt(1, 100), rng1.nextInt(1, 100)]
      const values2 = [rng2.nextInt(1, 100), rng2.nextInt(1, 100), rng2.nextInt(1, 100)]
      
      expect(values1).toEqual(values2)
    })
  })

  describe('shuffle()', () => {
    it('should shuffle array deterministically', () => {
      const rng = new SeededRandom(12345)
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const shuffled = rng.shuffle(original)
      
      expect(shuffled).toMatchSnapshot()
    })

    it('should not modify original array', () => {
      const rng = new SeededRandom(12345)
      const original = [1, 2, 3, 4, 5]
      const shuffled = rng.shuffle(original)
      
      expect(original).toEqual([1, 2, 3, 4, 5])
      expect(shuffled).not.toBe(original)
    })

    it('should contain same elements', () => {
      const rng = new SeededRandom(12345)
      const original = [1, 2, 3, 4, 5]
      const shuffled = rng.shuffle(original)
      
      expect(shuffled.sort()).toEqual(original.sort())
    })

    it('should shuffle different arrays with same seed consistently', () => {
      const rng1 = new SeededRandom(12345)
      const rng2 = new SeededRandom(12345)
      
      const shuffled1 = rng1.shuffle([1, 2, 3, 4, 5])
      const shuffled2 = rng2.shuffle([1, 2, 3, 4, 5])
      
      expect(shuffled1).toEqual(shuffled2)
    })

    it('should handle empty array', () => {
      const rng = new SeededRandom(12345)
      const shuffled = rng.shuffle([])
      
      expect(shuffled).toEqual([])
    })

    it('should handle single element array', () => {
      const rng = new SeededRandom(12345)
      const shuffled = rng.shuffle([42])
      
      expect(shuffled).toEqual([42])
    })

    it('should work with different data types', () => {
      const rng = new SeededRandom(12345)
      const strings = ['a', 'b', 'c', 'd']
      const shuffled = rng.shuffle(strings)
      
      expect(shuffled).toMatchSnapshot()
      expect(shuffled.sort()).toEqual(strings.sort())
    })
  })

  describe('randomDelay()', () => {
    it('should return a Promise', () => {
      const rng = new SeededRandom(12345)
      const promise = rng.randomDelay()
      
      expect(promise).toBeInstanceOf(Promise)
    })

    it('should resolve within expected time range', async () => {
      const rng = new SeededRandom(12345)
      const startTime = Date.now()
      
      await rng.randomDelay(10, 20)
      
      const endTime = Date.now()
      const elapsed = endTime - startTime
      
      // Allow some tolerance for execution time
      expect(elapsed).toBeGreaterThanOrEqual(8)
      expect(elapsed).toBeLessThan(30)
    })

    it('should use default values when no parameters provided', async () => {
      const rng = new SeededRandom(12345)
      const startTime = Date.now()
      
      await rng.randomDelay()
      
      const endTime = Date.now()
      const elapsed = endTime - startTime
      
      // Default range is 1-50ms
      expect(elapsed).toBeLessThan(60)
    })

    it('should handle minimum delay', async () => {
      const rng = new SeededRandom(12345)
      const startTime = Date.now()
      
      await rng.randomDelay(0, 0)
      
      const endTime = Date.now()
      const elapsed = endTime - startTime
      
      expect(elapsed).toBeLessThan(10) // Should be very fast
    })
  })

  describe('comprehensive snapshot test', () => {
    it('should generate consistent output across all methods', () => {
      const rng = new SeededRandom(42)
      
      const output = {
        randomNumbers: [rng.next(), rng.next(), rng.next()],
        integers: [rng.nextInt(1, 100), rng.nextInt(1, 100), rng.nextInt(1, 100)],
        shuffledArray: rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        shuffledStrings: rng.shuffle(['apple', 'banana', 'cherry', 'date', 'elderberry'])
      }
      
      expect(output).toMatchSnapshot()
    })
  })
})
export class LRU<V> {
  private map = new Map<string, V>()
  constructor(private max: number) {}
  get(k: string): V | undefined {
    const v = this.map.get(k)
    if (v !== undefined) {
      this.map.delete(k)
      this.map.set(k, v)
    }
    return v
  }
  set(k: string, v: V) {
    if (this.map.has(k)) this.map.delete(k)
    this.map.set(k, v)
    if (this.map.size > this.max) {
      const first = this.map.keys().next().value
      if (first !== undefined) this.map.delete(first)
    }
  }
}

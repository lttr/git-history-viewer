export function comparePath(a: string, b: string): number {
  const A = a.split('/')
  const B = b.split('/')
  const n = Math.min(A.length, B.length)
  for (let i = 0; i < n; i++) {
    const ai = A[i], bi = B[i]
    const aLeaf = i === A.length - 1
    const bLeaf = i === B.length - 1
    if (ai === bi) {
      if (aLeaf !== bLeaf) return aLeaf ? 1 : -1
      if (aLeaf && bLeaf) return 0
      continue
    }
    const aIsFolder = !aLeaf
    const bIsFolder = !bLeaf
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1
    return ai.localeCompare(bi)
  }
  return A.length - B.length
}

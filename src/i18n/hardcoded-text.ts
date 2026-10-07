const CYRILLIC = /\p{Script=Cyrillic}/u

/** Lines of a source file that contain Cyrillic, 1-based. UI text belongs in messages/ (ADR 0009). */
export function cyrillicLines(source: string): number[] {
  return source
    .split('\n')
    .flatMap((line, index) => (CYRILLIC.test(line) ? [index + 1] : []))
}

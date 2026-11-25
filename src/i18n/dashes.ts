import ts from 'typescript'

/** An en dash (U+2013) or an em dash (U+2014). */
const DASH = /[\u2013\u2014]/

/**
 * Lines of a source file whose strings, templates or JSX text hold an em or
 * en dash, 1-based. Comments are not UI text, so they don't count. The copy
 * rules allow neither dash: an empty value is a word for none, or a blank.
 */
export function dashLines(source: string, fileName = 'file.tsx'): number[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const lines = new Set<number>()
  const visit = (node: ts.Node) => {
    if (
      (ts.isStringLiteralLike(node) ||
        ts.isTemplateLiteralToken(node) ||
        ts.isJsxText(node)) &&
      DASH.test(node.text)
    ) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
      lines.add(line + 1)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return [...lines].sort((a, b) => a - b)
}

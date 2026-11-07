export const YELLOW = '#ffcc00'
export const BLACK = '#141414'
export const SLANT = ''
export const SIDE = 256

export type Run = { text: string; color: string; backgroundColor: string; bold?: true }

type Cell = { glyph: string; color: string; backgroundColor: string; bold?: true }

const Y: Cell = { glyph: ' ', color: BLACK, backgroundColor: YELLOW }
const B: Cell = { glyph: ' ', color: YELLOW, backgroundColor: BLACK }
const YELLOW_TO_BLACK: Cell = { glyph: SLANT, color: YELLOW, backgroundColor: BLACK }
const BLACK_TO_YELLOW: Cell = { glyph: SLANT, color: BLACK, backgroundColor: YELLOW }

const LEFTWARD = [B, B, YELLOW_TO_BLACK, Y, Y, BLACK_TO_YELLOW]
const RIGHTWARD = [YELLOW_TO_BLACK, B, B, BLACK_TO_YELLOW, Y, Y]

export function runs(cells: Cell[]) {
  const out: Run[] = []
  for (const cell of cells) {
    const last = out.at(-1)
    if (last && last.color === cell.color && last.backgroundColor === cell.backgroundColor && last.bold === cell.bold) {
      last.text += cell.glyph
      continue
    }
    out.push({
      text: cell.glyph,
      color: cell.color,
      backgroundColor: cell.backgroundColor,
      ...(cell.bold ? { bold: true as const } : {}),
    })
  }
  return out
}

function text(value: string, color: string, backgroundColor: string): Cell[] {
  return [...value].map(glyph => ({ glyph, color, backgroundColor, bold: true as const }))
}

export function hazard(label: string, chip?: { text: string; color: string }) {
  const left: Cell[] = [BLACK_TO_YELLOW]
  for (let k = 0; left.length < SIDE; k++) left.unshift(LEFTWARD[k % LEFTWARD.length] ?? B)
  const right: Cell[] = []
  for (let d = 0; right.length < SIDE; d++) right.push(RIGHTWARD[d % RIGHTWARD.length] ?? B)
  const middle = text(` ${label} `, BLACK, YELLOW)
  if (chip) {
    middle.push(...text(` ${chip.text} `, BLACK, chip.color))
    middle.push(...text(' ', BLACK, YELLOW))
  }
  return { left: runs(left), label: runs(middle), right: runs(right) }
}

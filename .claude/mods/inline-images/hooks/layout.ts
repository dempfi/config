const IMAGE_PATH =
  /(?<=^|[\s<>()[\]"'`])(?:file:\/\/)?(\/[^\s<>()[\]"'`]+?\.(?:png|jpe?g|gif|webp|heic|tiff?|bmp))(?=$|[\s<>()[\]"'`,:;!?]|[.](?:$|\s))/gi

const CELL_ASPECT = 2.1
const PIXELS_PER_COLUMN = 9

export const MAX_IMAGES = 4

export function imagePaths(text: string) {
  const found = new Set<string>()
  for (const match of text.matchAll(IMAGE_PATH)) {
    const raw = match[1]
    if (raw === undefined) continue
    found.add(match[0].startsWith('file://') ? safeDecode(raw) : raw)
    if (found.size === MAX_IMAGES) break
  }
  return [...found]
}

function safeDecode(path: string) {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

export function cellBox(width: number, height: number, maxColumns: number, maxRows: number) {
  let columns = Math.max(1, Math.min(maxColumns, Math.ceil(width / PIXELS_PER_COLUMN)))
  let rows = Math.max(1, Math.round((columns * height) / width / CELL_ASPECT))
  if (rows > maxRows) {
    rows = maxRows
    columns = Math.max(1, Math.round((rows * CELL_ASPECT * width) / height))
  }
  return { columns, rows }
}

export function pixelSize(sipsOutput: string) {
  const width = Number(/pixelWidth:\s*(\d+)/.exec(sipsOutput)?.[1])
  const height = Number(/pixelHeight:\s*(\d+)/.exec(sipsOutput)?.[1])
  return width > 0 && height > 0 ? { width, height } : null
}

ObjC.import('AppKit')
ObjC.import('Foundation')

function color(hex, alpha) {
  const value = parseInt(hex.replace('#', ''), 16)
  return $.NSColor.colorWithSRGBRedGreenBlueAlpha(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, alpha)
}

function font(family, size, bold) {
  const named = $.NSFont.fontWithNameSize(family, size)
  const base = named.isNil() ? $.NSFont.monospacedSystemFontOfSizeWeight(size, 0) : named
  if (!bold) return base
  const heavy = $.NSFontManager.sharedFontManager.convertFontToHaveTrait(base, $.NSBoldFontMask)
  return heavy.isNil() ? base : heavy
}

function path(d, cw, ch) {
  const p = $.NSBezierPath.bezierPath
  d.forEach(cmd => {
    if (cmd[0] === 'M') p.moveToPoint($.NSMakePoint(cmd[1] * cw, cmd[2] * ch))
    else if (cmd[0] === 'L') p.lineToPoint($.NSMakePoint(cmd[1] * cw, cmd[2] * ch))
    else
      p.curveToPointControlPoint1ControlPoint2(
        $.NSMakePoint(cmd[5] * cw, cmd[6] * ch),
        $.NSMakePoint(cmd[1] * cw, cmd[2] * ch),
        $.NSMakePoint(cmd[3] * cw, cmd[4] * ch),
      )
  })
  return p
}

function cell(family, size, heightAdjust) {
  const f = font(family, size, false)
  const advance = $.NSString.stringWithString('0').sizeWithAttributes($.NSDictionary.dictionaryWithObjectForKey(f, $.NSFontAttributeName)).width
  const height = Math.ceil((f.ascender - f.descender + f.leading) * (1 + heightAdjust))
  return { width: advance, height: height }
}

function run(argv) {
  const job = JSON.parse($.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null).js)
  const scene = job.scene
  const size = cell(job.font.family, job.font.size, job.font.heightAdjust)
  const cw = size.width
  const ch = size.height
  const width = scene.columns * cw
  const height = scene.rows * ch
  const scale = job.scale
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    null,
    Math.round(width * scale),
    Math.round(height * scale),
    8,
    4,
    true,
    false,
    $.NSDeviceRGBColorSpace,
    0,
    0,
  )
  rep.size = $.NSMakeSize(width, height)
  const context = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep)
  const flipped = $.NSGraphicsContext.graphicsContextWithCGContextFlipped(context.CGContext, true)
  $.NSGraphicsContext.saveGraphicsState
  $.NSGraphicsContext.setCurrentContext(flipped)
  const transform = $.NSAffineTransform.transform
  transform.translateXByYBy(0, height)
  transform.scaleXByYBy(1, -1)
  transform.concat
  flipped.shouldAntialias = true

  const labelSize = job.font.size * job.font.labelScale

  scene.shapes.forEach(shape => {
    if (shape.type === 'stroke') {
      const p = path(shape.d, cw, ch)
      p.lineWidth = shape.width
      p.lineCapStyle = 1
      p.lineJoinStyle = 1
      if (shape.dash) p.setLineDashCountPhase(shape.dash, shape.dash.length, 0)
      color(shape.color, shape.alpha).setStroke
      p.stroke
    } else if (shape.type === 'gradient') {
      const p = path(shape.d, cw, ch)
      p.closePath
      const gradient = $.NSGradient.alloc.initWithStartingColorEndingColor(color(shape.color, shape.top), color(shape.color, shape.bottom))
      $.NSGraphicsContext.saveGraphicsState
      p.addClip
      gradient.drawFromPointToPointOptions($.NSMakePoint(0, shape.y0 * ch), $.NSMakePoint(0, shape.y1 * ch), 0)
      $.NSGraphicsContext.restoreGraphicsState
    } else if (shape.type === 'rect') {
      const r = Math.min(shape.radius, (shape.w * cw) / 2, (shape.h * ch) / 2)
      const p = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(
        $.NSMakeRect(shape.x * cw, shape.y * ch, shape.w * cw, shape.h * ch),
        r,
        r,
      )
      color(shape.color, shape.alpha).setFill
      p.fill
    } else if (shape.type === 'dot') {
      const p = $.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(shape.x * cw - shape.r, shape.y * ch - shape.r, shape.r * 2, shape.r * 2))
      color(shape.color, shape.alpha).setFill
      p.fill
    } else if (shape.type === 'text') {
      const attributes = $.NSMutableDictionary.dictionary
      attributes.setObjectForKey(font(job.font.family, labelSize, shape.bold), $.NSFontAttributeName)
      attributes.setObjectForKey(color(shape.color, shape.alpha), $.NSForegroundColorAttributeName)
      const text = $.NSString.stringWithString(shape.text)
      const measured = text.sizeWithAttributes(attributes)
      let x = shape.x * cw
      if (shape.align === 'center') x -= measured.width / 2
      if (shape.align === 'right') x -= measured.width
      x = Math.max(1, Math.min(width - measured.width - 1, x))
      let y = shape.y * ch
      if (shape.baseline === 'middle') y -= measured.height / 2
      if (shape.baseline === 'bottom') y -= measured.height
      y = Math.max(0, Math.min(height - measured.height, y))
      text.drawAtPointWithAttributes($.NSMakePoint(x, y), attributes)
    }
  })

  $.NSGraphicsContext.restoreGraphicsState
  const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary)
  png.writeToFileAtomically(job.out, true)
  return JSON.stringify({ ok: true, width: Math.round(width * scale), height: Math.round(height * scale) })
}

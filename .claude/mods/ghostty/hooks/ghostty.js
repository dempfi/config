ObjC.import('AppKit')
ObjC.import('Foundation')

function terminalById(app, id) {
  const found = app.terminals.whose({ id: id })()
  if (found.length === 0) throw new Error('no Ghostty pane with id ' + id)
  return found[0]
}

function frontTerminal(app) {
  const windows = app.windows()
  if (windows.length === 0) return null
  return windows[0].selectedTab().focusedTerminal()
}

function list(app) {
  const front = frontTerminal(app)
  const frontId = front ? front.id() : null
  const panes = []
  app.windows().forEach((w, windowIndex) => {
    w.tabs().forEach(t => {
      const focused = t.focusedTerminal()
      const focusedId = focused ? focused.id() : null
      const tabSelected = t.selected()
      t.terminals().forEach(term => {
        const id = term.id()
        panes.push({
          id: id,
          window: windowIndex + 1,
          tab: t.index(),
          tabSelected: tabSelected,
          focusedInTab: id === focusedId,
          isFront: id === frontId,
          title: term.name(),
          cwd: term.workingDirectory(),
          tty: term.tty(),
          foregroundPid: term.pid(),
        })
      })
    })
  })
  return { frontmost: app.frontmost(), panes: panes }
}

function savePasteboard(pb) {
  const saved = []
  const items = pb.pasteboardItems
  for (let i = 0; i < items.count; i++) {
    const item = items.objectAtIndex(i)
    const types = item.types
    const entry = []
    for (let j = 0; j < types.count; j++) {
      const type = types.objectAtIndex(j)
      const data = item.dataForType(type)
      if (data && !data.isNil()) entry.push([type, data])
    }
    saved.push(entry)
  }
  return saved
}

function restorePasteboard(pb, saved) {
  pb.clearContents
  if (saved.length === 0) return
  const objects = $.NSMutableArray.alloc.init
  saved.forEach(entry => {
    const item = $.NSPasteboardItem.alloc.init
    entry.forEach(([type, data]) => item.setDataForType(data, type))
    objects.addObject(item)
  })
  pb.writeObjects(objects)
}

function read(app, req) {
  const term = terminalById(app, req.pane)
  const pb = $.NSPasteboard.generalPasteboard
  const saved = savePasteboard(pb)
  const before = pb.changeCount
  let path = null
  try {
    app.performAction('write_' + req.scope + '_file:copy,plain', { on: term })
    for (let i = 0; i < 50 && pb.changeCount === before; i++) delay(0.02)
    if (pb.changeCount === before) throw new Error('Ghostty wrote no screen file')
    path = pb.stringForType($.NSPasteboardTypeString).js
  } finally {
    restorePasteboard(pb, saved)
  }
  const text = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null)
  const fm = $.NSFileManager.defaultManager
  fm.removeItemAtPathError(path, null)
  fm.removeItemAtPathError($(path).stringByDeletingLastPathComponent, null)
  return { text: text.isNil() ? '' : text.js }
}

function type(app, req) {
  const term = terminalById(app, req.pane)
  if (req.text) app.inputText(req.text, { to: term })
  if (req.enter) app.sendKey('enter', { to: term })
  return {}
}

function key(app, req) {
  const term = terminalById(app, req.pane)
  const options = { to: term }
  if (req.modifiers) options.modifiers = req.modifiers
  app.sendKey(req.key, options)
  return {}
}

function open(app, req) {
  const previous = frontTerminal(app)
  const config = {}
  if (req.cwd) config.initialWorkingDirectory = req.cwd
  if (req.command) config.initialInput = req.command + '\n'
  let created
  if (req.where === 'window') {
    created = app.newWindow({ withConfiguration: config }).selectedTab().focusedTerminal()
  } else if (req.where === 'tab') {
    const options = { withConfiguration: config }
    if (app.windows().length > 0) options.in = app.windows()[0]
    created = app.newTab(options).focusedTerminal()
  } else {
    const anchor = req.next ? terminalById(app, req.next) : previous
    if (!anchor) throw new Error('no pane to split')
    created = app.split(anchor, { direction: req.where, withConfiguration: config })
  }
  if (req.title) created.nameOverride = req.title
  const id = created.id()
  if (req.keepFocus && previous) app.focus(previous)
  return { id: id }
}

function tab(app, req) {
  let found = null
  app.windows().forEach(w => {
    w.tabs().forEach(t => {
      if (!found && t.terminals().some(term => term.id() === req.pane)) found = t
    })
  })
  if (!found) throw new Error('no tab holds pane ' + req.pane)
  found.nameOverride = req.title
  return {}
}

function focus(app, req) {
  app.focus(terminalById(app, req.pane))
  return {}
}

function close(app, req) {
  app.close(terminalById(app, req.pane))
  return {}
}

const OPS = { list: list, read: read, type: type, key: key, open: open, tab: tab, focus: focus, close: close }

function run(argv) {
  const req = JSON.parse(argv[0])
  try {
    const op = OPS[req.op]
    if (!op) throw new Error('unknown op ' + req.op)
    return JSON.stringify({ ok: true, value: op(Application('Ghostty'), req) })
  } catch (err) {
    return JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) })
  }
}

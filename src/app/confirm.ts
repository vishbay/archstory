// App-styled replacements for window.confirm and window.alert: callers ask from anywhere and get a promise;
// ConfirmDialog (rendered once near the root) shows the question in the app's own dialog.

export interface Ask {
  title: string; body?: string
  /** Label of the main button, e.g. "End interview". */
  confirm?: string
  /** Label of the other button; null hides it (a notice with one button). */
  cancel?: string | null
  /** The main button undoes or deletes something. */
  danger?: boolean
  resolve: (ok: boolean) => void
}

let show: ((a: Ask) => void) | null = null
const waiting: Ask[] = []

/** Ask a yes or no question in the app's own dialog. Resolves true when the main button is pressed. */
export function askConfirm(o: Omit<Ask, 'resolve'>): Promise<boolean> {
  return new Promise(resolve => { const a = { ...o, resolve }; if (show) show(a); else waiting.push(a) })
}
/** Tell the user something, with a single OK button. */
export const notify = (title: string, body?: string) => askConfirm({ title, body, confirm: 'OK', cancel: null }).then(() => undefined)

/** Used by ConfirmDialog: take any question asked before it mounted, and receive new ones. */
export const takeWaiting = () => waiting.shift() ?? null
export const onAsk = (f: (a: Ask) => void) => { show = f; return () => { if (show === f) show = null } }

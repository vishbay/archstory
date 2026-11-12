// The one dialog behind askConfirm and notify (see confirm.ts), in the app's own style.
import { useEffect, useRef, useState } from 'react'
import { onAsk, takeWaiting, type Ask } from './confirm'

export function ConfirmDialog() {
  const [ask, setAsk] = useState<Ask | null>(takeWaiting)
  const dialog = useRef<HTMLDialogElement>(null)
  // a newer question replaces an unanswered one
  useEffect(() => onAsk(a => setAsk(prev => { prev?.resolve(false); return a })), [])
  useEffect(() => { if (ask && !dialog.current?.open) dialog.current?.showModal() }, [ask])
  const answer = (ok: boolean) => { ask?.resolve(ok); setAsk(null); dialog.current?.close() }
  if (!ask) return null
  return (
    <dialog ref={dialog} className="dialog confirm-dialog" aria-labelledby="confirm-title" onCancel={e => { e.preventDefault(); answer(false) }}>
      <h3 id="confirm-title">{ask.title}</h3>
      {ask.body && <p className="muted">{ask.body}</p>}
      <div className="row end">
        {ask.cancel !== null && <button onClick={() => answer(false)}>{ask.cancel ?? 'Cancel'}</button>}
        <button className={`primary${ask.danger ? ' danger' : ''}`} autoFocus onClick={() => answer(true)}>{ask.confirm ?? 'OK'}</button>
      </div>
    </dialog>
  )
}

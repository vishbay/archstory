// A small easter egg: five quick clicks on the logo show the author's GitHub profile card.
// Profile data comes live from GitHub's public API. The avatar is fetched as data and shown from a blob URL, because the
// page's security policy only allows images from this site; if GitHub cannot be reached the card still shows the links.
import { useEffect, useRef, useState } from 'react'
import { setLab, useLab } from './labs'

const LOGIN = 'vishbay'
const REPO = 'https://github.com/vishbay/archstory'
interface Profile { login: string; name?: string | null; bio?: string | null; location?: string | null; public_repos?: number; followers?: number; html_url?: string; avatar_url?: string }

export function ProfileCard({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [p, setP] = useState<Profile>({ login: LOGIN })
  const [avatar, setAvatar] = useState<string | null>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    const ctl = new AbortController()
    let url: string | null = null
    ;(async () => {
      try {
        const r = await fetch(`https://api.github.com/users/${LOGIN}`, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
        if (!r.ok) return
        const j = await r.json() as Profile
        setP(j)
        if (j.avatar_url) {
          const img = await fetch(`${j.avatar_url}&s=160`, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
          if (img.ok) { url = URL.createObjectURL(await img.blob()); setAvatar(url) }
        }
      } catch { /* offline or rate limited: the static card is enough */ }
    })()
    return () => { ctl.abort(); if (url) URL.revokeObjectURL(url) }
  }, [])
  const profileUrl = p.html_url ?? `https://github.com/${LOGIN}`
  const hood = useLab('underhood')

  return (
    <dialog ref={dialog} className="dialog profile-card" onClose={onClose} aria-label="About the author">
      <button className="icon ghost profile-close" aria-label="Close" onClick={() => dialog.current?.close()}>×</button>
      <div className="profile-head">
        {avatar ? <img src={avatar} alt="" width={72} height={72} /> : <span className="profile-initial" aria-hidden>{p.login[0].toUpperCase()}</span>}
        <div>
          <b>{p.name || p.login}</b>
          <a href={profileUrl} target="_blank" rel="noreferrer">@{p.login}</a>
          {p.location && <span className="muted small">{p.location}</span>}
        </div>
      </div>
      {p.bio && <p>{p.bio}</p>}
      <p className="muted small">Made ArchStory, system design one request at a time.</p>
      {(!!p.public_repos || !!p.followers) && (   // zero counts are left out
        <div className="profile-stats">
          {!!p.public_repos && <span><b>{p.public_repos}</b> public repos</span>}
          {!!p.followers && <span><b>{p.followers}</b> followers</span>}
        </div>
      )}
      <div className="labs">
        <p className="eyebrow">Labs</p>
        <button className={`lab-row${hood ? ' on' : ''}`} role="switch" aria-checked={hood} onClick={() => setLab('underhood', !hood)}>
          <span className="lab-text"><b>Under the hood (preview)</b><span className="muted small">Protocol timelines: DNS, TCP and more</span></span>
          <span className="sw" aria-hidden><i /></span>
        </button>
      </div>
      <div className="row wrap">
        <a className="button primary" href={profileUrl} target="_blank" rel="noreferrer">GitHub profile</a>
        <a className="button" href={REPO} target="_blank" rel="noreferrer">ArchStory on GitHub</a>
      </div>
    </dialog>
  )
}

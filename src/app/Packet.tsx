import { useLayoutEffect, useRef } from 'react'

/** How far along its path a packet that never arrives gets before it disappears. */
export const LOST_STOP = 0.6

// A dot that travels along an SVG path once; remount (change `key`) to replay.
// SMIL needs begin="indefinite" + beginElement(): animations inserted after page load with begin=0 count as already finished.
// A lost packet (`lost`) fades out instead of arriving. With 'x' it also stops part of the way (LOST_STOP) and leaves an X where
// it went; with 'fade' it runs the whole path it is given (the timeline already draws the shortened arrow and its own X).
export function Packet({ path, ms, color, reverse, lost }: { path: string; ms: number; color: string; reverse?: boolean; lost?: 'fade' | 'x' }) {
  const move = useRef<SVGAnimationElement>(null)
  const show = useRef<SVGAnimationElement>(null)
  const fade = useRef<SVGAnimationElement>(null)
  const cross = useRef<SVGAnimationElement>(null)
  useLayoutEffect(() => { show.current?.beginElement(); move.current?.beginElement(); fade.current?.beginElement(); cross.current?.beginElement() }, [])
  const stop = lost === 'x' ? LOST_STOP : 1
  const keyPoints = reverse ? `1;${1 - stop}` : `0;${stop}`
  const motion = (
    <animateMotion ref={move} dur={`${ms}ms`} begin="indefinite" fill="freeze" path={path}
      keyPoints={keyPoints} keyTimes="0;1" calcMode="linear" />
  )
  if (!lost) {
    return (
      <circle r={7} visibility="hidden" style={{ fill: color, filter: `drop-shadow(0 0 6px ${color})` }}>
        <set ref={show} attributeName="visibility" to="visible" begin="indefinite" fill="freeze" />
        {motion}
      </circle>
    )
  }
  return (
    <g visibility="hidden" className="packet-lost">
      <set ref={show} attributeName="visibility" to="visible" begin="indefinite" fill="freeze" />
      {motion}
      <circle r={7} style={{ fill: color, filter: `drop-shadow(0 0 6px ${color})` }}>
        <animate ref={fade} attributeName="opacity" values="1;1;0" keyTimes="0;0.6;1" dur={`${ms}ms`} begin="indefinite" fill="freeze" />
      </circle>
      {lost === 'x' && (
        <path d="M-5,-5 L5,5 M5,-5 L-5,5" fill="none" strokeWidth={2.6} strokeLinecap="round" opacity={0} style={{ stroke: 'var(--hard)' }}>
          <animate ref={cross} attributeName="opacity" values="0;0;1" keyTimes="0;0.7;1" dur={`${ms}ms`} begin="indefinite" fill="freeze" />
        </path>
      )}
    </g>
  )
}

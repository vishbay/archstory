import { useLayoutEffect, useRef } from 'react'

// A dot that travels along an SVG path once. Remount (change `key`) to replay.
// SMIL with begin="indefinite" + beginElement(), because animations inserted after
// document load with begin=0 would already be "finished".
export function Packet({ path, ms, color, reverse }: { path: string; ms: number; color: string; reverse?: boolean }) {
  const move = useRef<SVGAnimationElement>(null)
  const show = useRef<SVGAnimationElement>(null)
  useLayoutEffect(() => { show.current?.beginElement(); move.current?.beginElement() }, [])
  return (
    <circle r={7} fill={color} visibility="hidden" style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
      <set ref={show} attributeName="visibility" to="visible" begin="indefinite" fill="freeze" />
      <animateMotion ref={move} dur={`${ms}ms`} begin="indefinite" fill="freeze" path={path}
        keyPoints={reverse ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear" />
    </circle>
  )
}

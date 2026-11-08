import { useLayoutEffect, useRef } from 'react'

// A dot that travels along an SVG path once; remount (change `key`) to replay.
// SMIL needs begin="indefinite" + beginElement(): animations inserted after page load with begin=0 count as already finished.
export function Packet({ path, ms, color, reverse }: { path: string; ms: number; color: string; reverse?: boolean }) {
  const move = useRef<SVGAnimationElement>(null)
  const show = useRef<SVGAnimationElement>(null)
  useLayoutEffect(() => { show.current?.beginElement(); move.current?.beginElement() }, [])
  return (
    <circle r={7} visibility="hidden" style={{ fill: color, filter: `drop-shadow(0 0 6px ${color})` }}>
      <set ref={show} attributeName="visibility" to="visible" begin="indefinite" fill="freeze" />
      <animateMotion ref={move} dur={`${ms}ms`} begin="indefinite" fill="freeze" path={path}
        keyPoints={reverse ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear" />
    </circle>
  )
}

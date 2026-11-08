// Steps for the first-visit tours (selectors point at elements in App and Practice).
export interface TourStep { target: string; title: string; body: string }

export const EXPLORE_TOUR: TourStep[] = [
  { target: '.player', title: 'Play a request', body: 'Press ▶ (or space) to send a request through the system. ← and → step through it hop by hop.' },
  { target: '.stage-body', title: 'The architecture', body: 'Components sit in tier bands: clients at the top, then edge, entry, services, data and background work. Click any component to learn what it does.' },
  { target: '.right .tabs', title: 'Explanations', body: 'Flow explains every hop with the actual message. Component and Notes cover trade-offs, scaling and failure handling.' },
  { target: '.toolbar', title: 'Go deeper', body: 'Timeline shows the whole flow as a sequence. Network adds the VPC, subnets and availability-zone failure drills.' },
  { target: '.topbar [aria-label="Cloud"]', title: 'Any cloud', body: 'Switch between cloud-neutral names, AWS and GCP. Official icons appear for real products.' },
  { target: 'nav[aria-label="Mode"]', title: 'Your turn', body: 'Switch to Practice to build your own answer to any of these problems and get it checked.' },
]

export const PRACTICE_TOUR: TourStep[] = [
  { target: '.left', title: 'Add components', body: 'Click a component in the palette, or drag it onto the canvas. It lands in its tier band automatically.' },
  { target: '.toolbar', title: 'Connect and undo', body: 'Press Connect (or C), click a caller, then what it calls. Undo and Redo are here too, and your answer saves as you go.' },
  { target: '.right .tabs', title: 'Flows, checks and review', body: 'Record request flows, run the automatic checks, compare with the reference, and copy a prompt for an AI review.' },
]

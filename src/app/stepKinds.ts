export const KIND_VAR = { req: 'var(--k-req)', res: 'var(--k-res)', async: 'var(--k-async)', local: 'var(--k-local)' } as const
/** The same four colours as text ink: darker in light mode so labels and glyphs read at 4.5:1. Lines and fills use KIND_VAR. */
export const KIND_INK = { req: 'var(--k-req-t)', res: 'var(--k-res-t)', async: 'var(--k-async-t)', local: 'var(--k-local-t)' } as const
export const KIND_TEXT = { req: 'request', res: 'response', async: 'async', local: 'inside node' } as const
/** A shape for each step type, so the type never depends on color alone. */
export const KIND_GLYPH = { req: '→', res: '←', async: '⇢', local: '↻' } as const
export const KIND_SHORT = { req: 'request', res: 'response', async: 'async / replica', local: 'inside' } as const
export const KIND_LEGEND = { req: 'request', res: 'response', async: 'async or replication', local: 'inside a component' } as const

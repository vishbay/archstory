export const KIND_VAR = { req: 'var(--k-req)', res: 'var(--k-res)', async: 'var(--k-async)', local: 'var(--k-local)' } as const
export const KIND_TEXT = { req: 'request', res: 'response', async: 'async', local: 'inside node' } as const
/** A shape for each step type, so the type never depends on color alone. */
export const KIND_GLYPH = { req: '→', res: '←', async: '⇢', local: '↻' } as const
export const KIND_SHORT = { req: 'request', res: 'response', async: 'async / replica', local: 'inside' } as const
export const KIND_LEGEND = { req: 'request', res: 'response', async: 'async or replication', local: 'inside a component' } as const

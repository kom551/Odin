import { Hono } from 'hono'

export const healthRoute = new Hono()

healthRoute.get('/health', (c) =>
  c.json({
    status: 'ok',
    name: 'odin-api',
    time: new Date().toISOString(),
  }),
)

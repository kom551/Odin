/** 进程内简单任务队列（不引入外部 MQ） */
type Job = () => Promise<void>

const queue: Job[] = []
let running = false

export function enqueueReview(job: Job): void {
  queue.push(job)
  void drain()
}

async function drain(): Promise<void> {
  if (running) return
  running = true
  while (queue.length > 0) {
    const job = queue.shift()!
    try {
      await job()
    } catch (err) {
      console.error('[odin-api] review job failed:', err)
    }
  }
  running = false
}

import type {
  AdjustmentProcessResult,
  AdjustmentValues,
  PreviewRisk,
} from './imageAdjustments'

interface AdjustmentWorkerResponse {
  id: number
  buffer: ArrayBuffer
  width: number
  height: number
  risks?: PreviewRisk[]
}

interface WorkerTask {
  id: number
  imageData: ImageData
  adjustments: AdjustmentValues
  collectRisks: boolean
  signal?: AbortSignal
  resolve: (result: AdjustmentProcessResult) => void
  reject: (error: Error | DOMException) => void
  abort: () => void
}

let worker: Worker | null = null
let activeTask: WorkerTask | null = null
let nextTaskId = 1
const queue: WorkerTask[] = []

export async function processImageDataInWorker(
  imageData: ImageData,
  adjustments: AdjustmentValues,
  signal?: AbortSignal,
) {
  const result = await enqueueImageTask(imageData, adjustments, false, signal)
  return result.imageData
}

export function processImageDataWithRisksInWorker(
  imageData: ImageData,
  adjustments: AdjustmentValues,
  signal?: AbortSignal,
) {
  return enqueueImageTask(imageData, adjustments, true, signal)
}

export function getAdjustmentWorkerSnapshot() {
  return {
    active: !!activeTask,
    queued: queue.length,
    nextTaskId,
  }
}

function enqueueImageTask(
  imageData: ImageData,
  adjustments: AdjustmentValues,
  collectRisks: boolean,
  signal?: AbortSignal,
) {
  return new Promise<AdjustmentProcessResult>((resolve, reject) => {
    const task: WorkerTask = {
      id: nextTaskId,
      imageData,
      adjustments,
      collectRisks,
      signal,
      resolve,
      reject,
      abort: () => undefined,
    }
    nextTaskId += 1

    const abort = () => abortTask(task)
    task.abort = abort
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
      return
    }

    queue.push(task)
    pumpQueue()
  })
}

function pumpQueue() {
  if (activeTask || !queue.length) return
  const task = queue.shift()
  if (!task) return
  activeTask = task

  try {
    const instance = getWorker()
    const buffer = task.imageData.data.slice().buffer
    instance.postMessage(
      {
        id: task.id,
        buffer,
        width: task.imageData.width,
        height: task.imageData.height,
        adjustments: task.adjustments,
        collectRisks: task.collectRisks,
      },
      [buffer],
    )
  } catch {
    finishTask(task, new Error('图片处理 Worker 启动失败。'))
  }
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('../workers/adjustmentWorker.ts', import.meta.url), {
    type: 'module',
  })
  worker.onmessage = (event: MessageEvent<AdjustmentWorkerResponse>) => {
    const task = activeTask
    if (!task || task.id !== event.data.id) return

    finishTask(task, null, {
      imageData: new ImageData(
        new Uint8ClampedArray(event.data.buffer),
        event.data.width,
        event.data.height,
      ),
      risks: event.data.risks ?? [],
    })
  }
  worker.onerror = () => {
    if (activeTask) {
      finishTask(activeTask, new Error('图片处理 Worker 运行失败。'))
    }
    resetWorker()
  }
  return worker
}

function abortTask(task: WorkerTask) {
  const error = new DOMException('图片处理已取消。', 'AbortError')
  const queuedIndex = queue.findIndex((item) => item.id === task.id)
  if (queuedIndex >= 0) {
    queue.splice(queuedIndex, 1)
    cleanupTask(task)
    task.reject(error)
    return
  }

  if (activeTask?.id === task.id) {
    resetWorker()
    finishTask(task, error)
  }
}

function finishTask(
  task: WorkerTask,
  error: Error | DOMException | null,
  result?: AdjustmentProcessResult,
) {
  cleanupTask(task)
  if (activeTask?.id === task.id) activeTask = null
  if (error) {
    task.reject(error)
  } else if (result) {
    task.resolve(result)
  }
  pumpQueue()
}

function cleanupTask(task: WorkerTask) {
  task.signal?.removeEventListener('abort', task.abort)
}

function resetWorker() {
  worker?.terminate()
  worker = null
}

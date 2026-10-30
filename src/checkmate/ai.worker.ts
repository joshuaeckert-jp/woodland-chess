/// <reference lib="webworker" />
import { chooseAiAction } from './ai'
import type { AiWorkerRequest, AiWorkerResponse } from './ai-types'

self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const request = event.data
  if (!request || request.type !== 'choose') return
  try {
    const choice = chooseAiAction(request.state, request.difficulty)
    const response: AiWorkerResponse = { type: 'choice', requestId: request.requestId, action: choice.action, diagnostics: choice.diagnostics }
    self.postMessage(response)
  } catch (error) {
    self.postMessage({ type: 'error', requestId: request.requestId, message: error instanceof Error ? error.message : 'AI worker failure' } satisfies AiWorkerResponse)
  }
}

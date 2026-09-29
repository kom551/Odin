import type { OpenAiError } from '@odin/shared'

export function openAiError(
  type: string,
  message: string,
  code: number,
): OpenAiError {
  return { error: { message, type, code } }
}

export function formatZodIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  return issues
    .map((issue) => `${issue.path.map(String).join('.') || 'body'}: ${issue.message}`)
    .join('; ')
}

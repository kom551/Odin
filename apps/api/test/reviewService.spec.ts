import { describe, expect, it } from 'vitest'

import { buildReviewPrompt, parseAiResult, validateAiResultWithMeta } from '../src/services/reviewService'

describe('parseAiResult', () => {
  it('解析合法 JSON', () => {
    const result = parseAiResult(
      JSON.stringify({
        passed: true,
        summary: 'ok',
        issues: [],
        suggestions: '',
      }),
    )
    expect(result?.passed).toBe(true)
  })

  it('剥离 code fence 后解析', () => {
    const result = parseAiResult(
      '```json\n{"passed":false,"summary":"no","issues":["x"],"suggestions":""}\n```',
    )
    expect(result?.passed).toBe(false)
  })

  it('非法 JSON → null', () => {
    expect(parseAiResult('不是 JSON')).toBeNull()
  })

  it('缺少必填字段 → null', () => {
    expect(parseAiResult('{"passed":true}')).toBeNull()
  })
})

describe('buildReviewPrompt', () => {
  it('包含审核提示词与输出结构', () => {
    const prompt = buildReviewPrompt({
      taskTitle: '任务',
      taskDescription: '说明',
      stageTitle: '环节',
      reviewPrompt: '标准',
    })
    expect(prompt).toContain('【审核提示词】标准')
    expect(prompt).toContain('"passed"')
  })
})

describe('validateAiResultWithMeta', () => {
  it('校验落库结构并填充默认值', () => {
    const value = validateAiResultWithMeta({
      passed: true,
      summary: 'ok',
      issues: [],
      suggestions: '',
      raw: '',
      model: 'qwen-vl-plus',
    })
    expect(value?.autoRejected).toBe(false)
  })
})

import type { AccessCodeInput, AccessCodeStatus, AccessCodeUpdate } from '@odin/shared'

import request from '@/api/request'
import { adminHeaders } from '@/api/taskReview'

export interface AccessCodeRow {
  id: number
  code: string
  remark?: string | null
  status: AccessCodeStatus
  createdAt: number
  updatedAt: number
}

export function adminListAccessCodes() {
  return request.get<AccessCodeRow[]>('/admin/access-codes', {}, { headers: adminHeaders() })
}

export function adminCreateAccessCode(input: AccessCodeInput) {
  return request.post<AccessCodeRow>('/admin/access-codes', input, { headers: adminHeaders() })
}

export function adminUpdateAccessCode(id: number, input: AccessCodeUpdate) {
  return request.put<AccessCodeRow>(`/admin/access-codes/${id}`, input, { headers: adminHeaders() })
}

import type { ReservationStatus } from '../generated/prisma/enums.js';

// DB에는 예약/취소/반납 완료 세 가지만 저장한다.
// "대여 중"과 "반납 지연"은 지금 시각과 비교해서 계산한다. (기획서 6장)
export type ReservationState = 'UPCOMING' | 'ACTIVE' | 'OVERDUE' | 'RETURNED' | 'CANCELED';

export const STATE_LABEL: Record<ReservationState, string> = {
  UPCOMING: '예약됨',
  ACTIVE: '대여 중',
  OVERDUE: '반납 지연',
  RETURNED: '반납 완료',
  CANCELED: '취소됨',
};

export function stateOf(
  r: { status: ReservationStatus; startAt: Date; endAt: Date },
  now = new Date(),
): ReservationState {
  if (r.status === 'CANCELED') return 'CANCELED';
  if (r.status === 'RETURNED') return 'RETURNED';
  if (now < r.startAt) return 'UPCOMING';
  if (now < r.endAt) return 'ACTIVE';
  return 'OVERDUE';
}

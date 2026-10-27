import type { ItemStatus } from '../generated/prisma/enums.js';

// 물품의 "지금 상태"는 물품 상태(점검 필요 등)와 지금 나가 있는 예약으로 정한다.
export type ItemNowState = 'AVAILABLE' | 'IN_USE' | 'OVERDUE' | 'NEEDS_CHECK' | 'REPAIRING';

export const ITEM_STATE_LABEL: Record<ItemNowState, string> = {
  AVAILABLE: '대여 가능',
  IN_USE: '대여 중',
  OVERDUE: '반납 지연',
  NEEDS_CHECK: '점검 필요',
  REPAIRING: '수리 중',
};

/**
 * @param openReservations 이 물품의 status가 RESERVED인 예약들 (취소·반납 완료 제외)
 */
export function itemNowState(
  item: { status: ItemStatus },
  openReservations: { startAt: Date; endAt: Date }[],
  now = new Date(),
): ItemNowState {
  if (item.status === 'NEEDS_CHECK') return 'NEEDS_CHECK';
  if (item.status === 'REPAIRING') return 'REPAIRING';
  const out = openReservations.filter((r) => r.startAt <= now);
  if (out.some((r) => r.endAt <= now)) return 'OVERDUE';
  if (out.length > 0) return 'IN_USE';
  return 'AVAILABLE';
}

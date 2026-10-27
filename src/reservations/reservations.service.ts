import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { invalid, notFound, ruleError } from '../common/errors.js';
import { normalizeName, normalizePhone } from '../common/person.js';
import { stateOf, STATE_LABEL, type ReservationState } from '../common/reservation-state.js';
import {
  addDays,
  atKst,
  BOOKING_WINDOW_DAYS,
  daysBetween,
  isValidDateStr,
  SLOT_HOURS,
  SLOT_START_HOURS,
  todayKst,
} from '../common/time.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AdminReservationsQuery,
  CreateReservationDto,
  PersonDto,
  ReturnReservationDto,
} from './reservations.dto.js';

export const MAX_OPEN_PER_PERSON = 3;
const HOUR_MS = 60 * 60 * 1000;

function mmdd(dateStr: string) {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

type WithItem = Prisma.ReservationGetPayload<{ include: { item: { include: { location: true } } } }>;

/** 주민에게 돌려주는 모양 */
function toView(r: WithItem, now: Date) {
  const state = stateOf(r, now);
  return {
    id: r.id,
    itemId: r.itemId,
    itemName: r.item.name,
    rentalType: r.item.rentalType,
    locationName: r.item.location.name,
    locationCode: r.item.location.code,
    startAt: r.startAt,
    endAt: r.endAt,
    state,
    stateLabel: STATE_LABEL[state],
    canCancel: state === 'UPCOMING',
    canReturn: state === 'ACTIVE' || state === 'OVERDUE',
    createdAt: r.createdAt,
    returnedAt: r.returnedAt,
    canceledAt: r.canceledAt,
  };
}

const withItem = { item: { include: { location: true } } } as const;

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  // B7 예약 신청. 규칙 R1, R2, R3, R4, R6, R7 을 서버에서 확인한다.
  async create(dto: CreateReservationDto) {
    const name = normalizeName(dto.renterName);
    const phone = normalizePhone(dto.renterPhone);
    if (!isValidDateStr(dto.startDate)) {
      throw invalid('없는 날짜예요. 날짜를 다시 확인해 주세요.');
    }

    const s = `"${this.prisma.schema}"`;
    return this.prisma.$transaction(async (tx) => {
      // 같은 물품에 동시에 두 예약이 들어와도 하나씩 차례로 확인하도록 잠근다.
      await tx.$executeRawUnsafe(`SELECT id FROM ${s}.items WHERE id = $1 FOR UPDATE`, dto.itemId);
      // 같은 사람이 동시에 여러 건을 넣어도 3건 제한이 뚫리지 않게 잠근다.
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `${name}|${phone}`);

      const item = await tx.item.findUnique({ where: { id: dto.itemId } });
      if (!item) throw notFound('물품을 찾을 수 없어요.');

      // R6 점검 필요나 수리 중인 물품은 예약할 수 없다
      if (item.status !== 'AVAILABLE') {
        throw ruleError('R6', '이 물품은 지금 점검 중이라 예약할 수 없어요. 다른 물품을 골라 주세요.');
      }

      // 빌리는 시각 계산 + R2 최대 대여 기간
      let startAt: Date;
      let endAt: Date;
      if (item.rentalType === 'HOURLY') {
        if (dto.startSlot === undefined) {
          throw invalid('시작 시간을 골라 주세요. (09시, 12시, 15시)');
        }
        if (dto.length > item.maxDuration) {
          throw ruleError('R2', `이 물품은 최대 ${item.maxDuration * SLOT_HOURS}시간까지 빌릴 수 있어요.`);
        }
        if (dto.startSlot + dto.length > SLOT_START_HOURS.length) {
          throw ruleError('R2', '운영 시간(18시)을 넘어서 빌릴 수 없어요. 시작 시간을 앞당기거나 기간을 줄여 주세요.');
        }
        startAt = atKst(dto.startDate, SLOT_START_HOURS[dto.startSlot]);
        endAt = new Date(startAt.getTime() + dto.length * SLOT_HOURS * HOUR_MS);
      } else {
        if (dto.length > item.maxDuration) {
          throw ruleError('R2', `이 물품은 최대 ${item.maxDuration}일까지 빌릴 수 있어요.`);
        }
        startAt = atKst(dto.startDate, 9);
        endAt = atKst(addDays(dto.startDate, dto.length - 1), 18);
      }

      // R4 오늘부터 7일 이내, 지난 시간은 불가
      const now = new Date();
      const today = todayKst(now);
      if (startAt <= now) {
        throw ruleError('R4', '이미 지난 시간은 예약할 수 없어요. 다른 시간을 골라 주세요.');
      }
      if (daysBetween(today, dto.startDate) > BOOKING_WINDOW_DAYS) {
        throw ruleError(
          'R4',
          `예약은 오늘부터 7일 뒤(${mmdd(addDays(today, BOOKING_WINDOW_DAYS))})까지만 할 수 있어요.`,
        );
      }

      const mine = await tx.reservation.findMany({
        where: { renterName: name, renterPhone: phone, status: 'RESERVED' },
        select: { endAt: true },
      });

      // R7 반납 지연 중인 사람은 새로 예약할 수 없다
      if (mine.some((r) => r.endAt <= now)) {
        throw ruleError('R7', '아직 반납하지 않은 물품이 있어요. 반납한 뒤에 새로 예약할 수 있어요.');
      }

      // R3 한 사람당 예약 + 대여 중 합쳐서 3건까지
      if (mine.length >= MAX_OPEN_PER_PERSON) {
        throw ruleError(
          'R3',
          `지금 예약과 대여가 ${mine.length}건이라 더 예약할 수 없어요. (한 사람당 ${MAX_OPEN_PER_PERSON}건까지) 반납하거나 예약을 취소한 뒤 다시 시도해 주세요.`,
        );
      }

      // R1 같은 물품, 겹치는 시간 예약 불가
      const clash = await tx.reservation.findFirst({
        where: { itemId: item.id, status: 'RESERVED', startAt: { lt: endAt }, endAt: { gt: startAt } },
      });
      if (clash) {
        throw ruleError('R1', '선택한 시간에 이미 다른 예약이 있어요. 예약 현황표에서 비어 있는 시간을 골라 주세요.');
      }

      const created = await tx.reservation.create({
        data: { itemId: item.id, renterName: name, renterPhone: phone, startAt, endAt },
        include: withItem,
      });
      return toView(created, now);
    });
  }

  // B8 내 예약 조회 (이름·연락처는 주소창이 아니라 요청 본문으로 받는다)
  async lookup(dto: PersonDto) {
    const now = new Date();
    const list = await this.prisma.reservation.findMany({
      where: { renterName: normalizeName(dto.renterName), renterPhone: normalizePhone(dto.renterPhone) },
      include: withItem,
      orderBy: { startAt: 'desc' },
    });
    const views = list.map((r) => toView(r, now));
    const order: ReservationState[] = ['OVERDUE', 'ACTIVE', 'UPCOMING', 'RETURNED', 'CANCELED'];
    views.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
    return {
      openCount: views.filter((v) => ['OVERDUE', 'ACTIVE', 'UPCOMING'].includes(v.state)).length,
      limit: MAX_OPEN_PER_PERSON,
      reservations: views,
    };
  }

  /** R8 이름과 연락처가 예약 정보와 맞는지 */
  private async findOwned(id: number, person: PersonDto) {
    const r = await this.prisma.reservation.findUnique({ where: { id }, include: withItem });
    if (!r) throw notFound('예약을 찾을 수 없어요.');
    if (
      r.renterName !== normalizeName(person.renterName) ||
      r.renterPhone !== normalizePhone(person.renterPhone)
    ) {
      throw ruleError('R8', '이름이나 연락처가 예약 정보와 달라요.', HttpStatus.FORBIDDEN);
    }
    return r;
  }

  private ensureOpen(r: { status: string }) {
    if (r.status === 'CANCELED') throw ruleError('ALREADY', '이미 취소된 예약이에요.');
    if (r.status === 'RETURNED') throw ruleError('ALREADY', '이미 반납이 끝난 예약이에요.');
  }

  // B9 취소 (R5 시작 전까지만, R8 본인 확인)
  async cancel(id: number, person: PersonDto) {
    const r = await this.findOwned(id, person);
    this.ensureOpen(r);
    const now = new Date();
    if (now >= r.startAt) {
      throw ruleError('R5', '이미 대여가 시작되어 취소할 수 없어요. 반납으로 처리해 주세요.');
    }
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'CANCELED', canceledAt: now },
      include: withItem,
    });
    return toView(updated, now);
  }

  // B10 주민 반납 (R8 본인 확인, QR 반납이면 거점도 확인)
  async returnByRenter(id: number, dto: ReturnReservationDto) {
    const r = await this.findOwned(id, dto);
    if (dto.locationCode && dto.locationCode !== r.item.location.code) {
      throw ruleError(
        'WRONG_LOCATION',
        `이 물품은 ${r.item.location.name} 물품이에요. 그 거점에서 반납해 주세요.`,
      );
    }
    return this.markReturned(r);
  }

  // B12 직원 반납 처리
  async returnByStaff(id: number) {
    const r = await this.prisma.reservation.findUnique({ where: { id }, include: withItem });
    if (!r) throw notFound('예약을 찾을 수 없어요.');
    return this.markReturned(r);
  }

  private async markReturned(r: WithItem) {
    this.ensureOpen(r);
    const now = new Date();
    if (now < r.startAt) {
      throw ruleError('NOT_STARTED', '아직 대여가 시작되지 않았어요. 필요 없으면 예약을 취소해 주세요.');
    }
    const updated = await this.prisma.reservation.update({
      where: { id: r.id },
      data: { status: 'RETURNED', returnedAt: now },
      include: withItem,
    });
    return toView(updated, now);
  }

  // B11 직원용 전체 예약 (이름·연락처 포함)
  async adminList(q: AdminReservationsQuery) {
    const now = new Date();
    const list = await this.prisma.reservation.findMany({
      where: q.locationId ? { item: { locationId: q.locationId } } : {},
      include: withItem,
      orderBy: { startAt: 'asc' },
    });
    const today = todayKst(now);
    const recentFrom = atKst(addDays(today, -14), 0);
    const rows = list
      .map((r) => ({ ...toView(r, now), renterName: r.renterName, renterPhone: r.renterPhone }))
      .filter((v) => (q.state && q.state !== 'ALL' ? v.state === q.state : v.endAt >= recentFrom || v.state === 'OVERDUE'));
    const order: ReservationState[] = ['OVERDUE', 'ACTIVE', 'UPCOMING', 'RETURNED', 'CANCELED'];
    rows.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
    return rows;
  }
}

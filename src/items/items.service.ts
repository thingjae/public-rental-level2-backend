import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { invalid, notFound } from '../common/errors.js';
import { ITEM_STATE_LABEL, itemNowState } from '../common/item-state.js';
import { stateOf, STATE_LABEL } from '../common/reservation-state.js';
import {
  addDays,
  atKst,
  BOOKING_WINDOW_DAYS,
  MAX_DAILY_DAYS,
  MAX_HOURLY_SLOTS,
  SLOT_START_HOURS,
  todayKst,
} from '../common/time.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateItemDto, ListItemsQuery } from './items.dto.js';
import type { ItemStatus } from '../generated/prisma/enums.js';

const openReservations = { where: { status: 'RESERVED' as const }, select: { startAt: true, endAt: true } };

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  // B3 목록 + 검색 + 필터
  async list(q: ListItemsQuery) {
    const where: Prisma.ItemWhereInput = {};
    if (q.keyword?.trim()) {
      const k = q.keyword.trim();
      where.OR = [
        { name: { contains: k, mode: 'insensitive' } },
        { description: { contains: k, mode: 'insensitive' } },
      ];
    }
    if (q.locationId) where.locationId = q.locationId;
    if (q.category) where.category = q.category;

    const now = new Date();
    const items = await this.prisma.item.findMany({
      where,
      orderBy: { id: 'asc' },
      include: {
        location: { select: { id: true, name: true, code: true } },
        reservations: openReservations,
      },
    });

    const rows = items.map(({ reservations, ...item }) => {
      const nowState = itemNowState(item, reservations, now);
      return {
        ...item,
        nowState,
        nowStateLabel: ITEM_STATE_LABEL[nowState],
        upcomingCount: reservations.filter((r) => r.startAt > now).length,
      };
    });
    return q.availableNow === 'true' ? rows.filter((r) => r.nowState === 'AVAILABLE') : rows;
  }

  // B4 상세 + 앞으로 7일 예약 현황 (다른 사람의 이름·연락처는 절대 내보내지 않는다)
  async detail(id: number) {
    const now = new Date();
    const today = todayKst(now);
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: { location: true },
    });
    if (!item) throw notFound('물품을 찾을 수 없어요.');

    const reservations = await this.prisma.reservation.findMany({
      where: {
        itemId: id,
        status: 'RESERVED',
        startAt: { lt: atKst(addDays(today, BOOKING_WINDOW_DAYS + 1), 0) },
      },
      orderBy: { startAt: 'asc' },
      select: { startAt: true, endAt: true, status: true },
    });

    const nowState = itemNowState(item, reservations, now);
    const schedule = reservations
      .map((r) => ({ startAt: r.startAt, endAt: r.endAt, state: stateOf(r, now) }))
      .filter((r) => r.endAt > now || r.state === 'OVERDUE')
      .map((r) => ({ ...r, stateLabel: STATE_LABEL[r.state] }));

    return {
      ...item,
      nowState,
      nowStateLabel: ITEM_STATE_LABEL[nowState],
      hasOverdue: schedule.some((r) => r.state === 'OVERDUE'),
      schedule,
      booking: {
        today,
        lastDate: addDays(today, BOOKING_WINDOW_DAYS),
        slotStartHours: SLOT_START_HOURS,
        now: now.toISOString(),
      },
    };
  }

  // B5 등록
  async create(dto: CreateItemDto) {
    const location = await this.prisma.location.findUnique({ where: { id: dto.locationId } });
    if (!location) throw invalid('선택한 거점이 없어요. 거점을 다시 골라 주세요.');

    const limit = dto.rentalType === 'HOURLY' ? MAX_HOURLY_SLOTS : MAX_DAILY_DAYS;
    if (dto.maxDuration > limit) {
      throw invalid(
        dto.rentalType === 'HOURLY'
          ? '시간형은 최대 2칸(6시간)까지 정할 수 있어요.'
          : '날짜형은 최대 7일까지 정할 수 있어요.',
      );
    }

    return this.prisma.item.create({
      data: {
        locationId: dto.locationId,
        name: dto.name.trim(),
        category: dto.category,
        description: dto.description.trim(),
        caution: dto.caution?.trim() ?? '',
        imageUrl: dto.imageUrl ?? null,
        rentalType: dto.rentalType,
        maxDuration: dto.maxDuration,
      },
      include: { location: true },
    });
  }

  // B6 상태 바꾸기
  async updateStatus(id: number, status: ItemStatus) {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw notFound('물품을 찾을 수 없어요.');
    return this.prisma.item.update({ where: { id }, data: { status } });
  }
}

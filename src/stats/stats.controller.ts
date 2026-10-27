import { Controller, Get, Query } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';
import { itemNowState } from '../common/item-state.js';
import { kstDateOf, todayKst } from '../common/time.js';
import { PrismaService } from '../prisma/prisma.service.js';

class StatsQuery {
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Type(() => Number)
  @IsInt({ message: '거점 번호가 올바르지 않아요.' })
  locationId?: number;
}

// B15 현황 숫자: 대여 중 / 예약 / 대여 가능 (+ 반납 지연, 점검 필요, 오늘 시작)
@Controller('stats')
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async stats(@Query() q: StatsQuery) {
    const now = new Date();
    const today = todayKst(now);
    const [locations, items] = await Promise.all([
      this.prisma.location.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.item.findMany({
        where: q.locationId ? { locationId: q.locationId } : {},
        include: {
          reservations: {
            where: { status: { in: ['RESERVED', 'RETURNED'] } },
            select: { startAt: true, endAt: true, status: true },
          },
        },
      }),
    ]);

    const summarize = (list: typeof items) => {
      let inUse = 0, overdue = 0, reserved = 0, available = 0, needsCheck = 0, todayStarts = 0;
      for (const item of list) {
        const open = item.reservations.filter((r) => r.status === 'RESERVED');
        const state = itemNowState(item, open, now);
        if (state === 'AVAILABLE') available++;
        if (state === 'NEEDS_CHECK' || state === 'REPAIRING') needsCheck++;
        for (const r of open) {
          if (r.startAt > now) reserved++;
          else if (r.endAt > now) inUse++;
          else overdue++;
        }
        todayStarts += item.reservations.filter((r) => kstDateOf(r.startAt) === today).length;
      }
      return { inUse, reserved, available, overdue, needsCheck, todayStarts, totalItems: list.length };
    };

    return {
      today,
      locationId: q.locationId ?? null,
      ...summarize(items),
      byLocation: q.locationId
        ? []
        : locations.map((l) => ({
            locationId: l.id,
            locationName: l.name,
            ...summarize(items.filter((i) => i.locationId === l.id)),
          })),
    };
  }
}

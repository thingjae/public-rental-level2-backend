import {
  Body,
  Controller,
  Get,
  Injectable,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { notFound, ruleError } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateReportDto {
  @Type(() => Number)
  @IsInt({ message: '신고할 물품을 골라 주세요.' })
  itemId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reservationId?: number;

  @Transform(trim)
  @IsString({ message: '이름을 입력해 주세요.' })
  @IsNotEmpty({ message: '이름을 입력해 주세요.' })
  @MaxLength(20, { message: '이름은 20자 이내로 입력해 주세요.' })
  reporterName: string;

  @Transform(trim)
  @IsString({ message: '어디가 고장 났는지 적어 주세요.' })
  @IsNotEmpty({ message: '어디가 고장 났는지 적어 주세요.' })
  @MaxLength(500, { message: '신고 내용은 500자 이내로 적어 주세요.' })
  content: string;
}

export class UpdateReportDto {
  // START_REPAIR: 수리 시작 (물품 → 수리 중), RESOLVE: 처리 완료 (물품 → 대여 가능)
  @IsIn(['START_REPAIR', 'RESOLVE'], { message: '처리 방법이 올바르지 않아요.' })
  action: 'START_REPAIR' | 'RESOLVE';
}

export class ListReportsQuery {
  @IsOptional()
  @IsIn(['RECEIVED', 'RESOLVED'], { message: '상태 필터가 올바르지 않아요.' })
  status?: 'RECEIVED' | 'RESOLVED';
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // B13 고장 신고 → 물품이 "점검 필요"로 바뀌어 예약이 막힌다 (R6)
  async create(dto: CreateReportDto) {
    const item = await this.prisma.item.findUnique({ where: { id: dto.itemId } });
    if (!item) throw notFound('물품을 찾을 수 없어요.');
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.damageReport.create({
        data: {
          itemId: dto.itemId,
          reservationId: dto.reservationId ?? null,
          reporterName: dto.reporterName,
          content: dto.content,
        },
      });
      if (item.status === 'AVAILABLE') {
        await tx.item.update({ where: { id: item.id }, data: { status: 'NEEDS_CHECK' } });
      }
      return { ...report, message: '고장 신고가 접수됐어요. 확인 전까지 이 물품은 예약이 막혀요.' };
    });
  }

  // B14 목록
  list(q: ListReportsQuery) {
    return this.prisma.damageReport.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        item: { select: { id: true, name: true, status: true, location: { select: { name: true } } } },
      },
    });
  }

  // B14 처리
  async update(id: number, dto: UpdateReportDto) {
    const report = await this.prisma.damageReport.findUnique({ where: { id } });
    if (!report) throw notFound('고장 신고를 찾을 수 없어요.');
    if (report.status === 'RESOLVED') throw ruleError('ALREADY', '이미 처리가 끝난 신고예요.');

    return this.prisma.$transaction(async (tx) => {
      if (dto.action === 'START_REPAIR') {
        await tx.item.update({ where: { id: report.itemId }, data: { status: 'REPAIRING' } });
        return tx.damageReport.findUnique({ where: { id } });
      }
      const updated = await tx.damageReport.update({
        where: { id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      // 같은 물품에 남은 신고가 없을 때만 다시 대여 가능으로
      const remaining = await tx.damageReport.count({
        where: { itemId: report.itemId, status: 'RECEIVED' },
      });
      if (remaining === 0) {
        await tx.item.update({ where: { id: report.itemId }, data: { status: 'AVAILABLE' } });
      }
      return updated;
    });
  }
}

@Controller('damage-reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  create(@Body() dto: CreateReportDto) {
    return this.reports.create(dto);
  }

  @Get()
  list(@Query() q: ListReportsQuery) {
    return this.reports.list(q);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReportDto) {
    return this.reports.update(id, dto);
  }
}

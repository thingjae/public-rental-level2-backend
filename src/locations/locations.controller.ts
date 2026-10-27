import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('locations')
export class LocationsController {
  constructor(private readonly prisma: PrismaService) {}

  // B2 거점 목록
  @Get()
  async list() {
    const locations = await this.prisma.location.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { items: true } } },
    });
    return locations.map(({ _count, ...l }) => ({ ...l, itemCount: _count.items }));
  }
}

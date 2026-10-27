import { Controller, Get, Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { ItemsController } from './items/items.controller.js';
import { ItemsService } from './items/items.service.js';
import { LocationsController } from './locations/locations.controller.js';
import { PrismaModule } from './prisma/prisma.service.js';
import { ReportsController, ReportsService } from './reports/reports.js';
import {
  AdminReservationsController,
  ReservationsController,
} from './reservations/reservations.controller.js';
import { ReservationsService } from './reservations/reservations.service.js';
import { SeedController } from './seed/seed.controller.js';
import { StatsController } from './stats/stats.controller.js';

@Controller()
class RootController {
  @Get()
  root() {
    return {
      name: '한빛구 공공 생활물품 대여소 API',
      health: '/health',
      message: '백엔드가 동작 중이에요. DB 연결 상태는 /health 에서 볼 수 있어요.',
    };
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [
    RootController,
    HealthController,
    LocationsController,
    ItemsController,
    ReservationsController,
    AdminReservationsController,
    ReportsController,
    StatsController,
    SeedController,
  ],
  providers: [ItemsService, ReservationsService, ReportsService],
})
export class AppModule {}

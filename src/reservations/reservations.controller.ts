import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  AdminReservationsQuery,
  CreateReservationDto,
  PersonDto,
  ReturnReservationDto,
} from './reservations.dto.js';
import { ReservationsService } from './reservations.service.js';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  create(@Body() dto: CreateReservationDto) {
    return this.reservations.create(dto);
  }

  @Post('lookup')
  @HttpCode(200)
  lookup(@Body() dto: PersonDto) {
    return this.reservations.lookup(dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: PersonDto) {
    return this.reservations.cancel(id, dto);
  }

  @Post(':id/return')
  @HttpCode(200)
  returnByRenter(@Param('id', ParseIntPipe) id: number, @Body() dto: ReturnReservationDto) {
    return this.reservations.returnByRenter(id, dto);
  }
}

// 직원 화면용. L2에는 로그인이 없어서 주소를 아는 사람은 누구나 쓸 수 있다는 한계가 있다. (기획서 4장)
@Controller('admin/reservations')
export class AdminReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  list(@Query() q: AdminReservationsQuery) {
    return this.reservations.adminList(q);
  }

  @Post(':id/return')
  @HttpCode(200)
  returnByStaff(@Param('id', ParseIntPipe) id: number) {
    return this.reservations.returnByStaff(id);
  }
}

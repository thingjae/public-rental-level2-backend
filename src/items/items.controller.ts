import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateItemDto, ListItemsQuery, UpdateItemStatusDto } from './items.dto.js';
import { ItemsService } from './items.service.js';

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  list(@Query() q: ListItemsQuery) {
    return this.items.list(q);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.items.detail(id);
  }

  @Post()
  create(@Body() dto: CreateItemDto) {
    return this.items.create(dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemStatusDto) {
    return this.items.updateStatus(id, dto.status);
  }
}

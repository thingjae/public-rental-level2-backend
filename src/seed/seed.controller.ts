import { Controller, HttpCode, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { reseed } from './seed.js';

// B16 버튼 하나로 가상 데이터 다시 채우기
@Controller('seed')
export class SeedController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('reset')
  @HttpCode(200)
  async reset() {
    const counts = await reseed(this.prisma);
    return { message: '가상 데이터를 처음 상태로 다시 채웠어요.', ...counts };
  }
}

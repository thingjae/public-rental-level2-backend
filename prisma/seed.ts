// 명령으로 가상 데이터 다시 채우기: npm run seed
import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { reseed } from '../src/seed/seed.js';

const prisma = new PrismaService();
try {
  const result = await reseed(prisma);
  console.log('가상 데이터를 다시 채웠어요:', result);
} finally {
  await prisma.$disconnect();
}

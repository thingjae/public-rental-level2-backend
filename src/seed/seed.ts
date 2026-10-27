import type { PrismaService } from '../prisma/prisma.service.js';
import type {
  Category,
  ItemStatus,
  RentalType,
  ReservationStatus,
} from '../generated/prisma/enums.js';
import { addDays, atKst, SLOT_HOURS, SLOT_START_HOURS, todayKst } from '../common/time.js';

// 가상 데이터. 실제 인물, 기관, 연락처가 아니다.
// 날짜는 "다시 채우는 날"을 기준으로 만들어서, 언제 열어도 대여 중·반납 지연·예약이 0이 되지 않는다.

const LOCATIONS = [
  { name: '햇살동 행정복지센터', address: '한빛구 햇살로 12', phone: '02-000-1001', code: 'SUNNY' },
  { name: '달빛동 행정복지센터', address: '한빛구 달빛로 34', phone: '02-000-1002', code: 'MOON' },
  { name: '푸른숲동 행정복지센터', address: '한빛구 푸른숲길 56', phone: '02-000-1003', code: 'FOREST' },
  { name: '강변동 행정복지센터', address: '한빛구 강변대로 78', phone: '02-000-1004', code: 'RIVER' },
];

type ItemSeed = [
  loc: number,
  name: string,
  category: Category,
  type: RentalType,
  max: number,
  description: string,
  caution: string,
  status?: ItemStatus,
];

// 물품 번호는 이 목록 순서대로 1~24가 된다.
const ITEMS: ItemSeed[] = [
  [1, '무선 전동드릴', 'TOOL', 'HOURLY', 2, '18V 배터리 2개와 기본 비트 세트가 들어 있어요.', '비트는 꼭 함께 반납해 주세요.'],
  [1, '접이식 사다리 (2m)', 'TOOL', 'DAILY', 2, '알루미늄 A형 사다리예요. 최대 하중 100kg.', '혼자 높은 곳 작업은 피해 주세요.'],
  [1, '핸드카트 수레', 'LIVING', 'DAILY', 2, '이사나 택배 옮길 때 쓰는 접이식 수레예요.', '계단에서는 쓰지 말아 주세요.'],
  [1, '4인용 돔 텐트', 'CAMPING', 'DAILY', 3, '설치가 쉬운 원터치 텐트예요. 팩과 망치 포함.', '젖은 채로 반납하면 곰팡이가 생겨요. 말려서 반납해 주세요.'],
  [1, '캠핑 의자 2개 세트', 'CAMPING', 'DAILY', 3, '접이식 캠핑 의자 2개예요.', ''],
  [1, '제습기', 'LIVING', 'DAILY', 7, '장마철에 쓰기 좋은 10L 제습기예요.', '물통을 비워서 반납해 주세요.'],
  [2, '전동 그라인더', 'TOOL', 'HOURLY', 1, '금속과 타일을 자를 수 있는 4인치 그라인더예요.', '보안경과 장갑을 꼭 함께 써 주세요.', 'NEEDS_CHECK'],
  [2, '공구함 세트', 'TOOL', 'DAILY', 3, '망치, 드라이버, 렌치, 줄자가 든 기본 공구함이에요.', '빠진 공구가 없는지 확인 후 반납해 주세요.'],
  [2, '타프 (그늘막)', 'CAMPING', 'DAILY', 3, '4x4m 사각 타프예요. 폴대 2개 포함.', ''],
  [2, '휴대용 버너', 'CAMPING', 'DAILY', 2, '부탄가스용 휴대 버너예요. 가스는 포함되지 않아요.', '실내에서는 쓰지 말아 주세요.'],
  [2, '재봉틀', 'LIVING', 'HOURLY', 2, '기본 박음질과 지그재그가 되는 가정용 재봉틀이에요.', ''],
  [2, '행사용 천막 (3x3m)', 'EVENT', 'DAILY', 2, '동네 행사, 장터에 쓰는 접이식 천막이에요.', '바람이 강한 날에는 꼭 고정해 주세요.'],
  [3, '고압 세척기', 'TOOL', 'HOURLY', 2, '베란다, 자동차 세척용 고압 세척기예요.', '전기 콘센트 근처에 물이 닿지 않게 해 주세요.'],
  [3, '글루건 세트', 'TOOL', 'HOURLY', 2, '글루건 2개와 심 20개가 들어 있어요.', '뜨거우니 아이 손이 닿지 않게 해 주세요.'],
  [3, '6인용 텐트', 'CAMPING', 'DAILY', 3, '가족 캠핑용 거실형 텐트예요.', '말려서 반납해 주세요.'],
  [3, '아이스박스 (45L)', 'CAMPING', 'DAILY', 3, '바퀴 달린 대형 아이스박스예요.', '안을 깨끗이 닦아서 반납해 주세요.'],
  [3, '스팀 다리미', 'LIVING', 'HOURLY', 2, '세워서 쓰는 스탠드형 스팀 다리미예요.', ''],
  [3, '무선 확성기', 'EVENT', 'DAILY', 1, '행사 안내용 무선 확성기와 마이크예요.', '충전해서 반납해 주세요.'],
  [4, '충전식 잔디깎이', 'TOOL', 'HOURLY', 2, '마당, 화단용 충전식 잔디깎이예요.', ''],
  [4, '직소기', 'TOOL', 'HOURLY', 1, '나무판을 곡선으로 자를 수 있는 전동 톱이에요.', '보안경을 꼭 써 주세요.', 'REPAIRING'],
  [4, '캠핑 테이블', 'CAMPING', 'DAILY', 3, '높이 조절이 되는 접이식 테이블이에요.', ''],
  [4, '침낭 2개 세트', 'CAMPING', 'DAILY', 5, '영하 5도까지 쓸 수 있는 침낭 2개예요.', '세탁하지 말고 그대로 반납해 주세요.'],
  [4, '빔프로젝터', 'EVENT', 'DAILY', 2, '스크린과 HDMI 케이블 포함 빔프로젝터예요.', '렌즈를 손으로 만지지 말아 주세요.'],
  [4, '접이식 테이블 6개', 'EVENT', 'DAILY', 2, '행사용 접이식 테이블 6개 묶음이에요.', ''],
];

// 가상 주민
const P = {
  하늘: ['김하늘', '010-1111-1111'], // 예약 3건 → 규칙 R3 확인용
  지연: ['이지연', '010-2222-2222'], // 반납 지연 → 규칙 R7 확인용
  민수: ['박민수', '010-3333-3333'], // 취소·반납 확인용
  유나: ['최유나', '010-4444-4444'],
  우진: ['정우진', '010-5555-5555'],
  소율: ['한소율', '010-6666-6666'],
  태민: ['오태민', '010-7777-7777'],
  서아: ['윤서아', '010-8888-8888'],
  도현: ['강도현', '010-9999-0001'],
  예린: ['신예린', '010-9999-0002'],
  채원: ['임채원', '010-9999-0003'],
} as const;

type R = {
  item: number;
  who: keyof typeof P;
  day: number; // 오늘 기준 며칠 뒤에 시작 (음수는 과거)
  len: number; // 날짜형은 일 수, 시간형은 칸 수
  slot?: number; // 시간형 시작 칸 (0: 09시, 1: 12시, 2: 15시)
  status?: ReservationStatus;
};

const RESERVATIONS: R[] = [
  // 지금 대여 중 / 예약됨
  { item: 6, who: '하늘', day: -1, len: 4 },
  { item: 1, who: '하늘', day: 1, len: 2, slot: 0 },
  { item: 15, who: '하늘', day: 2, len: 2 },
  { item: 9, who: '민수', day: 3, len: 2 },
  { item: 21, who: '민수', day: -1, len: 3 },
  { item: 16, who: '우진', day: 0, len: 2 },
  { item: 13, who: '우진', day: 2, len: 1, slot: 1 },
  { item: 23, who: '소율', day: 1, len: 2 },
  { item: 18, who: '소율', day: 0, len: 1 },
  { item: 8, who: '태민', day: 0, len: 3 },
  { item: 11, who: '태민', day: 1, len: 1, slot: 1 },
  { item: 4, who: '서아', day: 2, len: 3 },
  { item: 2, who: '서아', day: 5, len: 1 },
  { item: 22, who: '도현', day: -2, len: 5 },
  { item: 24, who: '도현', day: 6, len: 2 },
  { item: 3, who: '예린', day: 0, len: 1 },
  { item: 14, who: '예린', day: 1, len: 1, slot: 2 },
  { item: 19, who: '채원', day: 3, len: 2, slot: 0 },
  // 반납 지연 (반납 시각이 지났는데 아직 반납 안 함)
  { item: 4, who: '지연', day: -4, len: 3 },
  { item: 12, who: '유나', day: -2, len: 2 },
  // 반납 완료 (지난 기록)
  { item: 1, who: '소율', day: -3, len: 2, slot: 0, status: 'RETURNED' },
  { item: 2, who: '우진', day: -6, len: 2, status: 'RETURNED' },
  { item: 5, who: '태민', day: -8, len: 3, status: 'RETURNED' },
  { item: 10, who: '도현', day: -5, len: 2, status: 'RETURNED' },
  { item: 15, who: '지연', day: -9, len: 3, status: 'RETURNED' },
  { item: 17, who: '유나', day: -2, len: 1, slot: 1, status: 'RETURNED' },
  { item: 23, who: '하늘', day: -7, len: 2, status: 'RETURNED' },
  { item: 24, who: '민수', day: -4, len: 1, status: 'RETURNED' },
  { item: 13, who: '서아', day: -1, len: 1, slot: 2, status: 'RETURNED' },
  { item: 11, who: '예린', day: -3, len: 1, slot: 0, status: 'RETURNED' },
  // 취소
  { item: 6, who: '지연', day: 4, len: 2, status: 'CANCELED' },
  { item: 9, who: '태민', day: 1, len: 1, status: 'CANCELED' },
  { item: 15, who: '채원', day: -1, len: 1, status: 'CANCELED' },
];

const HOUR_MS = 60 * 60 * 1000;

function periodOf(r: R, type: RentalType, today: string) {
  const date = addDays(today, r.day);
  if (type === 'HOURLY') {
    const startAt = atKst(date, SLOT_START_HOURS[r.slot ?? 0]);
    return { startAt, endAt: new Date(startAt.getTime() + r.len * SLOT_HOURS * HOUR_MS) };
  }
  return { startAt: atKst(date, 9), endAt: atKst(addDays(date, r.len - 1), 18) };
}

/** 모든 데이터를 지우고 가상 데이터로 다시 채운다. 번호도 1번부터 다시 시작한다. */
export async function reseed(prisma: PrismaService, now = new Date()) {
  const today = todayKst(now);
  const s = `"${prisma.schema}"`;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `TRUNCATE TABLE ${s}.damage_reports, ${s}.reservations, ${s}.items, ${s}.locations RESTART IDENTITY CASCADE`,
    );

    await tx.location.createMany({
      data: LOCATIONS.map((l) => ({ ...l, openHours: '09:00~18:00' })),
    });

    await tx.item.createMany({
      data: ITEMS.map(([loc, name, category, rentalType, maxDuration, description, caution, status]) => ({
        locationId: loc,
        name,
        category,
        rentalType,
        maxDuration,
        description,
        caution,
        status: status ?? 'AVAILABLE',
        createdAt: new Date(now.getTime() - 30 * 24 * HOUR_MS),
      })),
    });

    await tx.reservation.createMany({
      data: RESERVATIONS.map((r) => {
        const { startAt, endAt } = periodOf(r, ITEMS[r.item - 1][3], today);
        const status = r.status ?? 'RESERVED';
        return {
          itemId: r.item,
          renterName: P[r.who][0],
          renterPhone: P[r.who][1],
          startAt,
          endAt,
          status,
          createdAt: new Date(startAt.getTime() - 3 * 24 * HOUR_MS),
          returnedAt: status === 'RETURNED' ? new Date(endAt.getTime() - HOUR_MS) : null,
          canceledAt: status === 'CANCELED' ? new Date(startAt.getTime() - 24 * HOUR_MS) : null,
        };
      }),
    });

    await tx.damageReport.createMany({
      data: [
        {
          itemId: 1,
          reporterName: '한소율',
          content: '드릴 척(비트 끼우는 부분)이 헐거워요.',
          status: 'RESOLVED',
          createdAt: new Date(now.getTime() - 3 * 24 * HOUR_MS),
          resolvedAt: new Date(now.getTime() - 2 * 24 * HOUR_MS),
        },
        {
          itemId: 7,
          reporterName: '최유나',
          content: '전원이 켜졌다 꺼졌다 해요.',
          createdAt: new Date(now.getTime() - 20 * HOUR_MS),
        },
        {
          itemId: 20,
          reporterName: '임채원',
          content: '톱날이 무뎌져서 잘 안 잘려요.',
          createdAt: new Date(now.getTime() - 2 * 24 * HOUR_MS),
        },
      ],
    });
  });

  return {
    locations: LOCATIONS.length,
    items: ITEMS.length,
    reservations: RESERVATIONS.length,
    reports: 3,
  };
}

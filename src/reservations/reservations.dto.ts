import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PHONE_MESSAGE, PHONE_RE } from '../common/person.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// 이름 + 연락처 (로그인 대신 본인 확인에 쓴다)
export class PersonDto {
  @Transform(trim)
  @IsString({ message: '이름을 입력해 주세요.' })
  @IsNotEmpty({ message: '이름을 입력해 주세요.' })
  @MaxLength(20, { message: '이름은 20자 이내로 입력해 주세요.' })
  renterName: string;

  @Transform(trim)
  @IsString({ message: PHONE_MESSAGE })
  @Matches(PHONE_RE, { message: PHONE_MESSAGE })
  renterPhone: string;
}

// B7 예약 신청
export class CreateReservationDto extends PersonDto {
  @Type(() => Number)
  @IsInt({ message: '물품을 골라 주세요.' })
  itemId: number;

  @IsString({ message: '날짜를 2026-10-27처럼 입력해 주세요.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '날짜를 2026-10-27처럼 입력해 주세요.' })
  startDate: string;

  // 시간형 물품만: 0 = 09시, 1 = 12시, 2 = 15시
  @IsOptional()
  @Max(2, { message: '시작 시간을 골라 주세요. (09시, 12시, 15시)' })
  @Min(0, { message: '시작 시간을 골라 주세요. (09시, 12시, 15시)' })
  @IsInt({ message: '시작 시간을 골라 주세요. (09시, 12시, 15시)' })
  startSlot?: number;

  // 날짜형은 일 수, 시간형은 칸 수(1칸 = 3시간)
  @Min(1, { message: '대여 기간은 1 이상이어야 해요.' })
  @IsInt({ message: '대여 기간을 숫자로 골라 주세요.' })
  length: number;
}

// B10 반납 (QR 반납이면 거점 코드가 함께 온다)
export class ReturnReservationDto extends PersonDto {
  @IsOptional()
  @IsString()
  locationCode?: string;
}

// B11 직원용 예약 목록 필터
export class AdminReservationsQuery {
  @IsOptional()
  @IsIn(['ALL', 'UPCOMING', 'ACTIVE', 'OVERDUE', 'RETURNED', 'CANCELED'], {
    message: '상태 필터가 올바르지 않아요.',
  })
  state?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Type(() => Number)
  @IsInt({ message: '거점 번호가 올바르지 않아요.' })
  locationId?: number;
}

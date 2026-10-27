import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { Category, ItemStatus, RentalType } from '../generated/prisma/enums.js';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

// B3 물품 목록 검색·필터
export class ListItemsQuery {
  @IsOptional()
  @IsString()
  @Transform(emptyToUndefined)
  keyword?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsInt({ message: '거점 번호가 올바르지 않아요.' })
  locationId?: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(Category, { message: '분류가 올바르지 않아요.' })
  category?: Category;

  @IsOptional()
  @IsIn(['true', 'false'])
  availableNow?: 'true' | 'false';
}

// B5 물품 등록
export class CreateItemDto {
  @Type(() => Number)
  @IsInt({ message: '거점을 골라 주세요.' })
  locationId: number;

  @IsString({ message: '물품 이름을 입력해 주세요.' })
  @IsNotEmpty({ message: '물품 이름을 입력해 주세요.' })
  @MaxLength(40, { message: '물품 이름은 40자 이내로 입력해 주세요.' })
  name: string;

  @IsEnum(Category, { message: '분류를 골라 주세요. (공구, 캠핑, 생활, 행사)' })
  category: Category;

  @IsString({ message: '설명을 입력해 주세요.' })
  @IsNotEmpty({ message: '설명을 입력해 주세요.' })
  @MaxLength(500, { message: '설명은 500자 이내로 입력해 주세요.' })
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: '주의사항은 300자 이내로 입력해 주세요.' })
  caution?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: '사진 주소는 https://로 시작하는 인터넷 주소여야 해요.' },
  )
  imageUrl?: string;

  @IsEnum(RentalType, { message: '대여 방식(시간형 또는 날짜형)을 골라 주세요.' })
  rentalType: RentalType;

  @Min(1, { message: '최대 대여 기간은 1 이상이어야 해요.' })
  @IsInt({ message: '최대 대여 기간은 숫자로 입력해 주세요.' })
  maxDuration: number;
}

// B6 물품 상태 바꾸기
export class UpdateItemStatusDto {
  @IsEnum(ItemStatus, { message: '상태는 대여 가능, 점검 필요, 수리 중 중에서 골라 주세요.' })
  status: ItemStatus;
}

// L2에는 로그인이 없어서 "이름 + 연락처"로 사람을 구분한다.
// 앞뒤 공백 차이로 다른 사람처럼 보이지 않게 정리해서 비교한다.

export const PHONE_RE = /^010-\d{4}-\d{4}$/;
export const PHONE_MESSAGE = '연락처는 010-1234-5678처럼 숫자와 -로 입력해 주세요.';

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function normalizePhone(phone: string): string {
  return phone.trim();
}

// 규칙 자동 점검: 화면을 거치지 않고 서버에 직접 요청을 보내서,
// 규칙 R1~R8 과 입력값 확인이 서버에서 거절되는지 확인한다.
//
// 사용법:  node scripts/check-rules.mjs                  (로컬 서버)
//          API_URL=https://...onrender.com node scripts/check-rules.mjs   (배포 서버)
//
// 주의: 시작과 끝에 가상 데이터를 다시 채운다(/seed/reset).

const API = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const KST = 9 * 3600 * 1000;
const today = new Date(Date.now() + KST).toISOString().slice(0, 10);
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

const results = [];
async function check(name, expect, fn) {
  try {
    const r = await fn();
    const code = r.data?.code ?? '';
    const ok = r.status === expect.status && (!expect.code || code === expect.code);
    results.push({ name, ok, expected: `${expect.status}${expect.code ? ' ' + expect.code : ''}`, actual: `${r.status}${code ? ' ' + code : ''}`, message: r.data?.message ?? '' });
  } catch (e) {
    results.push({ name, ok: false, expected: `${expect.status} ${expect.code ?? ''}`, actual: 'ERROR', message: String(e) });
  }
}

const NEW = { renterName: '점검용 주민', renterPhone: '010-0000-0001' };
const HANEUL = { renterName: '김하늘', renterPhone: '010-1111-1111' }; // 예약 3건
const JIYEON = { renterName: '이지연', renterPhone: '010-2222-2222' }; // 반납 지연
const MINSU = { renterName: '박민수', renterPhone: '010-3333-3333' };

const reset = await call('POST', '/seed/reset');
if (reset.status !== 200) {
  console.error('가상 데이터 다시 채우기에 실패했어요:', reset);
  process.exit(1);
}

// 입력값 확인
await check('입력: 이름 빈칸', { status: 400, code: 'VALIDATION' }, () =>
  call('POST', '/reservations', { ...NEW, renterName: '', itemId: 5, startDate: day(2), length: 1 }));
await check('입력: 연락처 형식 틀림', { status: 400, code: 'VALIDATION' }, () =>
  call('POST', '/reservations', { ...NEW, renterPhone: '01012345678', itemId: 5, startDate: day(2), length: 1 }));
await check('입력: 날짜 칸에 글자', { status: 400, code: 'VALIDATION' }, () =>
  call('POST', '/reservations', { ...NEW, itemId: 5, startDate: '내일', length: 1 }));
await check('입력: 없는 날짜 (2월 30일)', { status: 400, code: 'VALIDATION' }, () =>
  call('POST', '/reservations', { ...NEW, itemId: 5, startDate: '2026-02-30', length: 1 }));
await check('등록: 물품 이름 빈칸', { status: 400, code: 'VALIDATION' }, () =>
  call('POST', '/items', { locationId: 1, name: '', category: 'TOOL', description: '설명', rentalType: 'DAILY', maxDuration: 2 }));
await check('등록: 최대 기간에 글자', { status: 400, code: 'VALIDATION' }, () =>
  call('POST', '/items', { locationId: 1, name: '망치', category: 'TOOL', description: '설명', rentalType: 'DAILY', maxDuration: '삼일' }));
await check('등록: 시간형 최대 3칸 (2칸까지)', { status: 400, code: 'VALIDATION' }, () =>
  call('POST', '/items', { locationId: 1, name: '망치', category: 'TOOL', description: '설명', rentalType: 'HOURLY', maxDuration: 3 }));
await check('등록: 사진 주소 형식 틀림', { status: 400, code: 'VALIDATION' }, () =>
  call('POST', '/items', { locationId: 1, name: '망치', category: 'TOOL', description: '설명', rentalType: 'DAILY', maxDuration: 2, imageUrl: 'abc' }));

// 규칙
await check('R1 겹치는 시간 (드릴, 내일 12~15시는 이미 예약)', { status: 409, code: 'R1' }, () =>
  call('POST', '/reservations', { ...NEW, itemId: 1, startDate: day(1), startSlot: 1, length: 1 }));
await check('R2 최대 기간 초과 (드릴 3칸 = 9시간)', { status: 409, code: 'R2' }, () =>
  call('POST', '/reservations', { ...NEW, itemId: 1, startDate: day(2), startSlot: 0, length: 3 }));
await check('R2 운영 시간 넘김 (15시 시작 2칸)', { status: 409, code: 'R2' }, () =>
  call('POST', '/reservations', { ...NEW, itemId: 1, startDate: day(2), startSlot: 2, length: 2 }));
await check('R2 최대 기간 초과 (캠핑 의자 4일, 3일까지)', { status: 409, code: 'R2' }, () =>
  call('POST', '/reservations', { ...NEW, itemId: 5, startDate: day(2), length: 4 }));
await check('R3 한 사람 3건 초과 (김하늘)', { status: 409, code: 'R3' }, () =>
  call('POST', '/reservations', { ...HANEUL, itemId: 5, startDate: day(2), length: 1 }));
await check('R4 8일 뒤 예약', { status: 409, code: 'R4' }, () =>
  call('POST', '/reservations', { ...NEW, itemId: 5, startDate: day(8), length: 1 }));
await check('R4 지난 날짜 예약', { status: 409, code: 'R4' }, () =>
  call('POST', '/reservations', { ...NEW, itemId: 5, startDate: day(-1), length: 1 }));
await check('R6 점검 필요 물품 (전동 그라인더)', { status: 409, code: 'R6' }, () =>
  call('POST', '/reservations', { ...NEW, itemId: 7, startDate: day(2), startSlot: 0, length: 1 }));
await check('R7 반납 지연자 새 예약 (이지연)', { status: 409, code: 'R7' }, () =>
  call('POST', '/reservations', { ...JIYEON, itemId: 5, startDate: day(2), length: 1 }));

const minsu = (await call('POST', '/reservations/lookup', MINSU)).data.reservations;
const minsuUpcoming = minsu.find((r) => r.state === 'UPCOMING');
const minsuActive = minsu.find((r) => r.state === 'ACTIVE');
await check('R5 대여 시작 후 취소 (박민수 캠핑 테이블)', { status: 409, code: 'R5' }, () =>
  call('POST', `/reservations/${minsuActive.id}/cancel`, MINSU));
await check('R8 연락처가 다른 사람의 취소', { status: 403, code: 'R8' }, () =>
  call('POST', `/reservations/${minsuUpcoming.id}/cancel`, { ...MINSU, renterPhone: '010-9999-9999' }));
await check('R8 이름이 다른 사람의 반납', { status: 403, code: 'R8' }, () =>
  call('POST', `/reservations/${minsuActive.id}/return`, { ...MINSU, renterName: '박민우' }));

// 정상 흐름
let created;
await check('정상: 예약 신청', { status: 201 }, async () => {
  const r = await call('POST', '/reservations', { ...NEW, itemId: 5, startDate: day(2), length: 2 });
  created = r.data;
  return r;
});
await check('정상: 내 예약 조회', { status: 200 }, () => call('POST', '/reservations/lookup', NEW));
await check('정상: 예약 취소', { status: 200 }, () => call('POST', `/reservations/${created.id}/cancel`, NEW));
await check('정상: 이미 취소된 예약 다시 취소', { status: 409, code: 'ALREADY' }, () =>
  call('POST', `/reservations/${created.id}/cancel`, NEW));
await check('정상: 반납 (박민수 캠핑 테이블)', { status: 200 }, () =>
  call('POST', `/reservations/${minsuActive.id}/return`, MINSU));
await check('QR 반납: 다른 거점 코드', { status: 409, code: 'WRONG_LOCATION' }, async () => {
  const sora = (await call('POST', '/reservations/lookup', { renterName: '정우진', renterPhone: '010-5555-5555' })).data.reservations;
  const active = sora.find((r) => r.state === 'ACTIVE');
  return call('POST', `/reservations/${active.id}/return`, { renterName: '정우진', renterPhone: '010-5555-5555', locationCode: 'SUNNY' });
});

// 고장 신고 → 예약 막힘 → 처리 완료 → 다시 예약 가능
let report;
await check('고장 신고 접수 (휴대용 버너)', { status: 201 }, async () => {
  const r = await call('POST', '/damage-reports', { itemId: 10, reporterName: '점검용 주민', content: '불이 약해요.' });
  report = r.data;
  return r;
});
await check('고장 신고 후 예약 → R6', { status: 409, code: 'R6' }, () =>
  call('POST', '/reservations', { ...NEW, itemId: 10, startDate: day(2), length: 1 }));
await check('처리 완료', { status: 200 }, () => call('PATCH', `/damage-reports/${report.id}`, { action: 'RESOLVE' }));
await check('처리 완료 후 다시 예약 가능', { status: 201 }, () =>
  call('POST', '/reservations', { ...NEW, itemId: 10, startDate: day(2), length: 1 }));

// 동시에 같은 시간을 예약하면 하나만 성공해야 한다 (R1)
await check('동시 예약 2건 → 1건만 성공', { status: 200 }, async () => {
  const body = (p) => ({ renterName: '동시 주민' + p, renterPhone: `010-0000-000${p}`, itemId: 24, startDate: day(3), length: 1 });
  const [a, b] = await Promise.all([call('POST', '/reservations', body(2)), call('POST', '/reservations', body(3))]);
  const statuses = [a.status, b.status].sort();
  const ok = statuses[0] === 201 && statuses[1] === 409;
  return { status: ok ? 200 : 500, data: { message: `결과: ${a.status}, ${b.status}` } };
});

await check('현황 숫자', { status: 200 }, () => call('GET', '/stats'));
await check('/health', { status: 200 }, () => call('GET', '/health'));
await check('가상 데이터 다시 채우기', { status: 200 }, () => call('POST', '/seed/reset'));

// 결과표
const pass = results.filter((r) => r.ok).length;
console.log(`\n규칙 자동 점검 (${API}) — ${pass}/${results.length} 통과\n`);
console.log('| 결과 | 점검 | 기대 | 실제 | 서버가 보낸 안내 |');
console.log('| --- | --- | --- | --- | --- |');
for (const r of results) {
  console.log(`| ${r.ok ? '✅' : '❌'} | ${r.name} | ${r.expected} | ${r.actual} | ${r.message} |`);
}
process.exit(pass === results.length ? 0 : 1);

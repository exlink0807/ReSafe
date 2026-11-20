/**
 * 신고 답변(12개 항목)을 바탕으로 범죄 유형을 분류하고, 실제 접수·상담 창구를 제안한다.
 * 분류는 SIMULATED 규칙 기반이며, 실제 죄명·처분은 수사기관이 최종 판단한다.
 *
 * 연락처 출처(확인일 기준, 변경될 수 있으니 접수 전 재확인 권장):
 *  - 디지털성범죄피해자지원센터 02-735-8994 / d4u.stop.or.kr / 여성긴급전화 1366 / 경찰청 ECRM(ecrm.police.go.kr)
 *  - 사이버사기: 112 → 금융감독원 1332(계좌 지급정지) 순서
 */
export interface Category { label: string; contacts: string[] }

const DIGITAL_SEX_CRIME_TYPES = ['딥페이크', '불법 촬영', '비동의 유포', '유포 협박'];

export function categorize(ans: string[]): Category {
  const type = ans[0] || '';
  const threatened = ans[9] === '있음'; // INTAKE_QUESTIONS[9] = 협박 여부

  if (DIGITAL_SEX_CRIME_TYPES.includes(type)) {
    return {
      label: '디지털 성범죄' + (threatened ? ' · 협박 동반' : ''),
      contacts: [
        '112 (긴급 시)',
        '디지털성범죄피해자지원센터 02-735-8994 · d4u.stop.or.kr (삭제지원)',
        '여성긴급전화 1366 (24시간)',
        '경찰청 사이버범죄 신고시스템 ECRM · ecrm.police.go.kr',
      ],
    };
  }
  if (type === '온라인 사기') {
    return {
      label: '사이버사기',
      contacts: ['112', '금융감독원 1332 (계좌 지급정지)', '경찰청 사이버범죄 신고시스템 ECRM · ecrm.police.go.kr'],
    };
  }
  if (type === '온라인 괴롭힘') {
    return {
      label: '사이버 명예훼손·모욕',
      contacts: ['112', '방송통신심의위원회 불법정보 신고 · kocsc.or.kr', '경찰청 사이버범죄 신고시스템 ECRM · ecrm.police.go.kr'],
    };
  }
  return { label: '기타 디지털 범죄', contacts: ['112', '경찰청 사이버범죄 신고시스템 ECRM · ecrm.police.go.kr'] };
}

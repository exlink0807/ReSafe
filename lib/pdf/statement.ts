import { AppState, INTAKE_FIELDS } from '@/lib/types';
import { Category } from '@/lib/ai/categorize';

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/**
 * 진술서 HTML을 만든다. 라이브러리(jsPDF 등) 대신 브라우저 인쇄(window.print)를 쓰는 이유:
 *  1) 한글 폰트를 PDF 라이브러리에 임베딩하는 과정에서 깨짐 문제가 흔하다.
 *  2) 이 문서를 보는 화면이 artifact/프리뷰 환경일 경우 a.download 같은 파일 다운로드 스크립트가
 *     실제로 파일을 전달하지 못하는 제약이 있을 수 있는데, window.print()는 그 제약과 무관하다.
 */
export function buildStatementHTML(state: AppState, category: Category): string {
  const rows = INTAKE_FIELDS.map((label, i) => `
    <tr>
      <td style="width:160px;color:#555;padding:6px 8px;border-bottom:1px solid #ddd;">${esc(label)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd;">${esc(state.ans[i] || '-')}</td>
    </tr>`).join('');

  const contacts = category.contacts.map((c) => `<li>${esc(c)}</li>`).join('');

  return `
    <div style="font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;padding:24px;max-width:720px;margin:0 auto;">
      <h1 style="font-size:20px;margin-bottom:4px;">피해 진술 정리 (RE:SAFE)</h1>
      <p style="font-size:12px;color:#666;margin-top:0;">작성일: ${new Date().toLocaleString()}</p>
      <h2 style="font-size:14px;background:#f2f2f2;padding:6px 10px;border-radius:6px;display:inline-block;">분류: ${esc(category.label)}</h2>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
        <tbody>${rows}</tbody>
      </table>
      <h3 style="font-size:13px;margin-top:20px;">접수·상담 가능 기관</h3>
      <ul style="font-size:12px;line-height:1.6;">${contacts}</ul>
      <p style="font-size:11px;color:#777;margin-top:16px;">
        본 문서는 RE:SAFE 플랫폼이 사용자 응답을 바탕으로 자동 정리한 참고 자료이며, 실제 죄명·처분은
        수사기관이 최종 판단합니다. 연락처는 작성 시점 기준이며 변동될 수 있어 방문·신고 전 확인을 권장합니다.
      </p>
    </div>`;
}

/**
 * printDoc(id="printDoc") 요소에 진술서를 채운 뒤, body에 'printing' 클래스를 붙이고
 * window.print()를 호출한다. CSS(app/globals.css)가 printing 상태에서 printDoc만 보이도록 처리한다.
 */
export function printStatement(state: AppState, category: Category) {
  const el = document.getElementById('printDoc');
  if (!el) {
    alert('인쇄용 영역을 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
    return;
  }
  el.innerHTML = buildStatementHTML(state, category);
  document.body.classList.add('printing');
  window.print();
  setTimeout(() => document.body.classList.remove('printing'), 500);
}

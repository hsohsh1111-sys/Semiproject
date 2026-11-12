import { useState } from 'react'

const notices = {
  terms: ['서비스 이용약관 안내', 'ONFIT은 체형 미리보기와 스타일·상품 탐색 기능을 제공합니다. 추정 체형과 의류 실루엣은 실제 체형·착용감과 다를 수 있습니다. 타인의 정보를 도용하거나 서비스 운영을 방해하는 행위는 허용하지 않습니다.', '이 안내는 검토용 초안입니다. 정식 운영 전 서비스 이용·탈퇴·책임 범위 등 최종 약관을 확정해야 합니다.'],
  privacy: ['개인정보 수집·이용 안내', '회원가입 시 아이디, 닉네임, 휴대폰 번호, 비밀번호 해시 및 동의 내역을 수집합니다. 회원 관리와 서비스 안내에 이용하며, 휴대폰 번호의 실제 소유 여부는 인증하지 않습니다.', '이벤트·혜택 문자는 별도 수신 동의를 선택한 경우에만 대상으로 구분합니다. 현재 문자 발송 서비스는 연결되어 있지 않습니다.', '이 안내는 검토용 초안입니다. 정식 운영 전 보유·이용 기간과 탈퇴·삭제 요청 절차를 확정해 고지해야 합니다.'],
  marketing: ['이벤트·혜택 문자 수신 안내', '이벤트·혜택 안내를 위한 휴대폰 번호 이용과 문자 수신에 대한 선택 동의입니다. 동의하지 않아도 회원가입과 기본 서비스를 이용할 수 있습니다. 현재 실제 문자 발송은 하지 않습니다.'],
}

export const requiredTermsAccepted = value => value.age14 && value.terms && value.privacy

export default function SignupTerms({ value, onChange, onContinue }) {
  const [open, setOpen] = useState(null)
  const all = ['age14','terms','privacy','marketing'].every(key => value[key])
  const update = (key, checked) => onChange({...value, [key]:checked})
  return <div className="signup-terms">
    <label className="terms-all"><input type="checkbox" checked={all} onChange={event => onChange({age14:event.target.checked,terms:event.target.checked,privacy:event.target.checked,marketing:event.target.checked})} /><span>네, 모두 동의합니다.</span></label>
    <div className="terms-items">
      <label className="terms-row"><input type="checkbox" checked={value.age14} onChange={event => update('age14',event.target.checked)} /><span>(필수) 만 14세 이상입니다.</span></label>
      {[['terms','(필수) 서비스 이용약관 동의'],['privacy','(필수) 개인정보 수집·이용 동의'],['marketing','(선택) 이벤트·혜택 문자 수신 동의']].map(([key,label]) => <div key={key}>
        <div className="terms-row"><label><input type="checkbox" checked={value[key]} onChange={event => update(key,event.target.checked)} /><span>{label}</span></label><button type="button" aria-expanded={open===key} aria-controls={`terms-${key}`} aria-label={`${label} 보기`} onClick={() => setOpen(open===key?null:key)}>{open===key?'닫기':'보기'}</button></div>
        {open===key && <section className="terms-notice" id={`terms-${key}`}><h3>{notices[key][0]}</h3>{notices[key].slice(1).map(text => <p key={text}>{text}</p>)}</section>}
      </div>)}
    </div>
    <button type="button" className="button button-dark auth-submit" disabled={!requiredTermsAccepted(value)} onClick={onContinue}>동의하고 계속하기</button>
  </div>
}

# HIGHSOUL 화이트 모노클 웹 에셋 v1.2

## 구성
- png/charcoal: 기본 차콜 PNG 8장
- png/sky-blue: 같은 상태의 하늘색 PNG 8장
- layers: 바디·알파 마스크·모노클 1장·상태별 눈/입/기호 분리 레이어(움직임용), 기존 합성 overlay-*.png 8장(정적 합성용, JS는 사용 안 함)
- source: PNG를 다시 만들 수 있는 SVG 합성 원본 27개
- web/highsoul.css, web/highsoul.js: 라이브러리 없는 호버 컴포넌트
- index.html: 다운로드 카탈로그, 실제 호버 예제, 사용법
- manifest.json: 파일별 SHA256

모든 PNG는 1024×1024 RGBA, 배경 투명, 같은 캔버스와 기준선입니다. 시선은 이미지 기준 오른쪽입니다. 모노클은 화면 오른쪽 눈에 있고 줄은 옆면으로 되걸리는 U자입니다. 좌우 반전(scaleX(-1))은 하지 마세요.

## v1.2 움직이는 캐릭터 + 후원 3단계 반응

- 색 흐름 속도를 v1.1보다 약 40% 빠르게 했습니다(구간당 2.5~5.4초). 색층은 둥근 원판 3장 대신 부드러운 얼룩 7개가 매번 무작위 경로로 떠다닙니다.
- 호버·클릭 유지 중에는 캐릭터도 움직입니다. 눈이 6가지 방향을 무작위로 두리번거리고, 깜빡이고, 몸이 살짝 기울며, 기본·문의·생각 중·공지는 표정이 호기심 ↔ 웃는 눈(^^)으로 바뀝니다.
- 상태별 반복 동작: 기본은 숨쉬기, 문의는 고개 갸웃과 물음표 흔들림, 후원은 별눈 반짝임, 환영은 통통 튐, 완료는 체크 팝, 생각 중은 말풍선 둥실, 공지는 느낌표와 함께 주기적 흔들림, 대기는 숨쉬기와 떠오르는 z. 마우스가 나가면 한 사이클을 끝내고 멈춥니다.
- 후원·선물 반응 3단계: `Highsoul.react(요소, 1|2|3)`. 1단계는 작게 움찔, 2단계는 중간 점프와 눈 확대·몸 흔들림·하늘빛 번쩍, 3단계(가장 큰 금액)는 크게 뛰어올라 눈이 커지고 입이 벌어지며 기호가 터지고 크게 흔들립니다. 호버 없이도 동작하고, Promise를 돌려주며, 모션 감소 설정이나 `data-hs-motion="static"`에서는 실행하지 않습니다. 세기 숫자는 `web/highsoul.js`의 `TIERS`에서 조절합니다.

```js
Highsoul.react(document.querySelector('#gift'), 3); // 1 | 2 | 3
```

3단계는 캐릭터가 크기의 약 20% 위로 뛰므로 부모 요소에 `overflow:hidden`을 걸지 말고 위쪽 여백을 두세요.

레이어가 늘었으므로 layers 폴더 전체를 같이 복사해야 합니다(`eyes-*`, `mouth-*`, `symbol-*`, `monocle.png`).

## v1.1 연속 흐름 수정

카탈로그의 위쪽 8개 캐릭터는 이제 모두 실제 연속 흐름입니다. 이전 310×250 물결 좌표와 이동량을 복원했습니다. 클릭하면 흐름을 유지하고 다시 클릭하면 해제합니다. 웹사이트 링크용 기본 컴포넌트는 클릭을 가로채지 않으며, 유지 기능은 data-hs-pin="true"를 넣은 미리보기 버튼에서만 사용합니다. 다운로드 PNG 자체는 정적입니다.

## 열기와 웹 호스팅

ZIP을 압축 해제하고 index.html을 브라우저로 열면 됩니다. Drive의 HTML 미리보기는 소스가 보일 수 있으므로 먼저 다운로드해서 여세요. Drive는 보관용이며 웹 이미지 CDN이 아닙니다. Drive 공유 링크를 img src로 쓰지 말고, PNG와 레이어 파일을 실제 웹서버의 public/assets/highsoul에 올려 사용하세요.

## 상태 이름
- default: 기본 (프로필·푸터·일반 링크)
- question: 문의 (이메일 문의·도움말·FAQ)
- sparkle: 후원·선물 (선물·후원·추천 링크)
- welcome: 환영 (소개·가입·시작하기)
- success: 완료 (전송 완료·저장·감사)
- thinking: 생각 중 (검색·처리·준비 중)
- notice: 공지 (새 소식·업데이트·안내)
- sleep: 대기 (휴식·오프라인·점검)

## 1. 정적인 PNG 한 장만 넣기

default를 question, sparkle 등 원하는 상태로 바꾸세요. 실제 이메일 주소로 교체하기 전에는 링크를 게시하지 마세요.

```html
<a href="mailto:hello@example.com" aria-label="이메일로 문의하기">
  <img src="/assets/highsoul/png/charcoal/highsoul-question-right.png"
       width="160" height="160" alt="" decoding="async">
</a>
```

## 2. 가장 간단한 색상 전환: PNG 두 장 + CSS

web/highsoul.css를 불러오면 아래 클래스가 작동합니다. JavaScript가 없어도 됩니다. 원본의 흰 눈·모노클·물음표가 같은 위치이므로 몸 색만 자연스럽게 바뀝니다.

```html
<link rel="stylesheet" href="/assets/highsoul/web/highsoul.css">
<a class="hs-png-link" href="mailto:hello@example.com"
   aria-label="이메일로 문의하기" style="--hs-size:160px">
  <img src="/assets/highsoul/png/charcoal/highsoul-question-right.png" alt="">
  <img class="hs-png-sky"
       src="/assets/highsoul/png/sky-blue/highsoul-question-right.png" alt="">
</a>
```

CSS에서 핵심은 두 번째 이미지의 opacity입니다. hover는 정밀 포인터에서만 적용하며 키보드 focus-visible은 즉시 전환합니다. 터치에서 마우스 hover를 강제로 흉내 내지 않습니다.

```css
.hs-png-link { position:relative; display:inline-block; width:160px; aspect-ratio:1; }
.hs-png-link img { position:absolute; inset:0; width:100%; height:100%; }
.hs-png-sky { opacity:0; transition:opacity 250ms cubic-bezier(.23,1,.32,1); }
@media (hover:hover) and (pointer:fine) {
  .hs-png-link:hover .hs-png-sky { opacity:1; }
}
.hs-png-link:focus-visible .hs-png-sky { opacity:1; transition:none; }
@media (prefers-reduced-motion:reduce) { .hs-png-sky { transition:none; } }
```

## 3. 실제로 흐르는 하늘빛: 마스크 + 별도 얼굴 레이어 + JS

PNG 자체는 움직이지 않습니다. 몸의 알파 마스크 안에서 색층을 움직여야 합니다. 이 컴포넌트가 그 작업을 합니다. 회색 PNG에 hue-rotate만 적용하면 원하는 하늘빛이 생기지 않으며 모노클까지 물들 수 있습니다.

폴더 전체를 웹사이트의 public/assets/highsoul로 복사했다고 가정한 예제입니다. ZIP은 실행하지 말고 먼저 압축을 해제하세요. 별도 빌드/패키지 설치는 필요 없습니다.

```html
<link rel="stylesheet" href="/assets/highsoul/web/highsoul.css">
<script src="/assets/highsoul/web/highsoul.js" defer></script>
<a href="mailto:hello@example.com" aria-label="이메일로 문의하기">
  <span data-hs-state="question"
        data-hs-assets="/assets/highsoul/layers"
        style="--hs-size:160px"></span>
</a>
<a href="YOUR_SUPPORT_URL" aria-label="선물과 후원 안내">
  <span data-hs-state="sparkle"
        data-hs-assets="/assets/highsoul/layers"
        style="--hs-size:160px"></span>
</a>
```

- body-charcoal.png: 기본 몸
- body-sky-blue.png: 반응 색상
- body-mask.png: 색이 흐를 수 있는 영역
- eyes-상태.png / mouth-상태.png / symbol-상태.png / monocle.png: 눈·입·기호·모노클 분리 레이어. 맨 위에서 색을 그대로 유지하며 눈만 따로 움직입니다.
- overlay-상태.png: 위 레이어를 한 장으로 합친 정적 이미지(JS는 사용하지 않음).
- 포인터가 나가면 차콜로 복귀하고 색층의 움직임을 멈춥니다.
- 키보드 포커스, 모션 감소 설정, 터치, 마스크 미지원 환경에서는 정적인 색 전환으로 대체합니다.
- 배경 탭과 화면 밖에서는 움직임을 멈춥니다.
- 다운로드 PNG(png/ 폴더)의 표정은 고정입니다. 움직임은 JS 컴포넌트에서만 나옵니다.

특정 캐릭터에서 흐르는 효과를 끄려면 data-hs-motion="static"을 추가하세요. 크기는 --hs-size로 조절합니다. 흰 눈·기호의 가독성을 위해 보통 120~240 CSS px를 권장합니다.

## 상태를 바꾸는 API / React 등

```js
const mascot = document.querySelector('[data-hs-state]');
Highsoul.setState(mascot, 'thinking');
// 실제 작업이 끝나면
Highsoul.setState(mascot, 'success');
// 동적으로 만든 DOM은 마운트 후 초기화
const container = document; // 또는 새로 마운트한 영역
Highsoul.init(container);
// SPA에서 제거하기 전에 정리
Highsoul.destroy(mascot);
```

React/Next.js도 PNG 파일은 public 폴더에 넣고 /assets/... 경로로 불러오면 됩니다. 흐르는 버전은 DOM 마운트 후 Highsoul.init(container)를 호출하고 언마운트 때 destroy를 호출하세요. 실제 사이트 구조에 맞춘 통합/배포는 아직 하지 않았습니다.

## 품질과 범위

승인한 원본 바디 비트맵(310×250)을 재사용하고 SVG로 표정·기호·모노클을 합성했습니다. 1024 PNG는 출력 캔버스이며 전체 캐릭터가 순수 벡터인 것은 아닙니다. 일반 웹 아이콘/링크 용도로 제작했습니다. 초대형 인쇄용 리마스터는 포함하지 않습니다.

Chrome에서 투명도와 실제 호버 흐름을 검수했습니다. 다른 브라우저/실제 모바일 기기는 서비스에 넣기 전 추가 확인을 권장합니다. 웹사이트·저장소·배포 설정은 변경하지 않았습니다.

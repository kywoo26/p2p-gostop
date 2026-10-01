# 수락된 공개 대상·착지 경계 제안 (#200)

상태: **실행 재현 완료, 공개 계약·제품 구현 승인 전 checkpoint**. 기준 main/v0.4.0 `42c374d61bb2df6dafe608792044c4ae01355c1f`. Refs [#200](https://github.com/kywoo26/p2p-gostop/issues/200), [#202](https://github.com/kywoo26/p2p-gostop/issues/202), 공유 설계 [PR #233](https://github.com/kywoo26/p2p-gostop/pull/233). #233의 `2764e`는 설계 제안이며 표현 revision 진행 중이다. 제품 승인·도상 식별·성능·실기기 PASS가 아니다.

요구: `intent/spec.md` FR-14~17·NF-03/08/09·AC-06/07, 직접 관련 FR-11~13·NP-02/03/04, `intent/plan.md` §1.6·§3-2. 규칙 기대값은 `docs/research/rules-commercial.md` §12(R1/R7/B2/E1/E6 등)만 사용한다. 최초 인계 분석 전체를 읽고 필요한 공개 소스 근거·익명 재현만 여기 보존했다. 개인 경로·계정·네트워크·실제 자격 자료는 포함하지 않는다.

## 1. 사용자 결과와 이번 소유

손패가 실제 짝에 접촉한 뒤 덱 공개·접촉을 읽고, 실제 Captured/PiStolen에서 획득한다. 약한 접촉 빛과 강한 획득 빛, 다른 월 두 짝은 각 짝을 유지한 두 묶음의 함께 출발이 사용자 방향이다. 보통 약0.5초 인지 간격은 목업 후보이며 고정 wait·빠름 예산 개정이 아니다. 뻑이면 가짜 획득0이다.

이번 diff는 이 제안, plan의 #200 자기 실행계획, protocol 전용 재현시험만이다. UI/Board/Floor/PromptPanel/skin/choreo/Playback·engine 규칙·wire 제품·저장·버전은 수정하지 않는다. 새 agent·live/Funnel/wrapper/release clone·실제 secret 접근0. 제품 승인 후 이 역할에서 좁은 protocol 경계를 이어갈 수 있으나 현재 승인으로 확대하지 않는다.

## 2. 실제 실패와 양좌석 송수신·복원 근거

추적 재현: [public-match-target.test.ts](../../packages/protocol/test/public-match-target.test.ts). `newRound → reduce → playerView → toBoardView`와 실제 `HostSession/GuestSession` 메모리 codec 왕복을 모두 실행했다. 덱 고정·엔진 상태 직접 대입 없이 합법 분배와 액션을 썼다. 테스트의 `secrets(36)/secrets(456)`은 기존 도우미의 합성 결정적 난수 공급기이며 실제 자격 자료가 아니다. 공급기로 얻은 seed는 `[3839809690,1129524092,3832060461,2933933213]`이다. dealer/행동 좌석0/1 각각 같은 관계를 재현한다.

| 경계 | 실제 관측 | 데이터 결론 |
|---|---|---|
| play7(월2) | `CardPlayed`; pending play target `[6,4]` | 7과 두 후보는 공개, 선택은 미정. 아직 29를 노출할 근거 없음 |
| choose6 수락 | `ctx.playTarget=6`; `CardFlipped(29)`; pending flip target `[28,30]`(월8) | 정확 선택6은 엔진에 남으나 해당 응답 list에는 Matched 없음 |
| 양 관찰자의 BoardView | `inFlight={played:7,staged:[29]}`; 상대 hand=null | 호스트0 뷰·게스트1 뷰 모두 playTarget 없음. 게스트 수신 뷰=host.guestView |
| 반대 선택 choose4 | ctx는4, **양 관찰자의 전체 BoardView와 해당 이벤트는 choose6과 동일** | 기존 공통 입력만으로 6/4를 식별하는 결정적 renderer는 불가능. 좌석별 클릭 추정을 대안으로 삼지 않음 |
| 뒤의 choose28 수락 | Matched(play,target6,cards[7,6])와 Matched(flip,target28,cards[29,28]); Captured `[6,7,28,29]` | 최종 Matched에서야 공통 선택6을 식별. 다른 월 두 짝이며 따닥 아님. Captured 배열 순서를 짝 순서로 가정하지 않음 |
| 잘못된 후보/좌석 요청 | ILLEGAL_ACTION, seq·ctx target 불변 | 거절한 클릭은 수락 근거가 아님 |
| 권위 timeout | 양 행동 좌석에서 합법 최소ID4를 딱1회 수락; 옛 key 입력 STALE_DECISION, seq/target 불변 | timeout 원인 메타데이터와 수락된 실제 target을 분리 |
| 호스트 저장 replay·새 epoch | 엔진 ctx6 회복; 재접속 차분 list는 CardFlipped만; 같은 seq의 빈 snapshot에도 target 없음 | 로컬 클릭 이력이 없는 관찰자·복원에도 같은 공백 |
| 이전 저장본으로 rollback | 새 epoch/더 낮은 seq로 pending play `[6,4]`, staged=[]·ctx target=null | 이전 세대의 수락6·덱29·좌표를 새 상태에 유지하면 안 됨 |
| v3 decode probe | 임의로 더한 `inFlight.playTarget=6`은 파싱 결과에서 제거됨 | 타입만 추가하거나 loose 필드로 wire를 우회할 수 없음 |

요구 실패를 의도적으로 분리한 scratch에서 `publicViewsDiffer = JSON.stringify(viewsAfter6) !== JSON.stringify(viewsAfter4)`에 `expect(publicViewsDiffer).toBe(true)`를 실행했다. **행동 좌석0/1 모두 `expected false to be true`, 2실패/exit1**이었다. 실패 scratch는 제품 suite에 포함하지 않고 제거했다. 추적 시험은 동일성·실제 경계의 characterization이며 그 통과가 착지 구현 성공을 뜻하지 않는다. 초기에 Captured 순서를 `[7,6,29,28]`로 가정한 시험 오류는 실제 정렬 `[6,7,28,29]`로 바로잡았으며 제품 결함 재현과 구별한다.

### 소스 경계

고정 기준 [main SHA 소스](https://github.com/kywoo26/p2p-gostop/tree/42c374d61bb2df6dafe608792044c4ae01355c1f): `engine/src/turn.ts` playCard/actTarget/flipStep/resolve, `engine/src/view.ts` playerView·redactEvent, `protocol/src/view.ts` inFlightOf·toBoardView, `view-types.ts` InFlight, `schema.ts` boardSchema. `HostSession.applyAction` 성공 reduce 뒤 publish→viewFor이며 hostView/guestView가 같은 projection을 쓴다. `resyncEvents`는 현재 view와 차분을 보내고 fromJSON은 저장 seed+actions를 replay한다. `GuestSession.receive`는 연속 seq/epoch 경계를 적용한다.

웹은 현재 `p2p/host.svelte.ts` onEventsSent와 `guest.svelte.ts` onEvents가 같은 Playback enqueue로 들어간다. enqueue `action`은 자기 입력 계측용이므로 상대의 수락 대상 계약으로 쓰지 않는다. snapshot은 빈 이벤트 enqueue이며 과거 선택/획득을 새 이벤트로 만들지 않는다. 이 문서는 protocol 실행을 검증했으며 웹 재생·DOM/실기기 실행은 하지 않았다.

## 3. wire를 먼저 정하지 않는 비교

| 후보 | 정확 ID와 시점 | 요구 충족/한계 |
|---|---|---|
| A 기존 공통 view·이벤트만 | 공개 단일 짝은 공개 incoming/floor로 잠정 관계 표현 가능. 비동등 두 후보는 위 동일성 반례로 구별 불가 | 선택 연쇄의 손패 접촉→덱 공개를 보장 못함 |
| A의 확정 강조 지연 | 현재 순서대로 CardFlipped 이후 실제 Matched(play)에서 접촉/강조, Matched(flip) 뒤 획득 | 이벤트열·최종 ID는 보존 가능하나 요구한 손패 접촉 선행이 역전됨 |
| A의 즉시 resolve 일반 Matched 활용 | seed8/dealer0: play35→후보[34,33]→choose34는 `CardFlipped,Matched(play),Matched(flip),Captured,ScoreChanged`; final ctx=null | 실제 Matched(play)를 먼저 **읽어 당겨서** 접촉시키는 것은 미래 prefix 사용. 수신된 전체 batch와 재생 공개 prefix를 혼동하지 않음 |
| A의 덱 그림 공개 유보 | 위 일반 경로에서 CardFlipped를 순서대로 내부 소비하되 앞면·ARIA·소리를 유보, 실제 Matched(play) 소비 후 P접촉→이미 소비한 F그림 공개→Matched(flip) | 미래 Matched를 미리 읽지 않는 presentation 후보. 기존 onEvent/commit·로그/소리·reduced/skip의 별도 UI 설계·검증 필요. engine 이벤트 순서 변경은 없음. 아래 따닥과 연쇄에는 보편 해법 아님 |
| A의 즉시 따닥 반례 | seed117/dealer0: play4→후보[7,5]→choose7/choose5 모두 `CardFlipped,Ttadak,Captured,InstantPayout,ScoreChanged`; **최종 상태와 이벤트까지 동일**, ctx=null | Matched 자체가 없어 선택한 원본 ID를 복구 못함. 모든 기존 사건을 소비해도 특정 수락 target 선행 접촉 보장은 불가 |
| B1 현재 inFlight에 이미 수락된 playTarget만 | 중간 ctx가 남은 선택 연쇄와 restore에서 정확 대상 공유 | 이번 최초 공백의 최소 후보. 즉시 resolve 후 ctx=null에서는 단독으로 전체 순서 요구를 해결하지 못함 |
| B 전체: 수락 전이 증거+현재 snapshot 관계 | 성공 수락 시점의 공개 target을 current batch 시작 경계에 제공; 중간 snapshot은 현재 ctx에서 재산출 | engine 이벤트 재배열·미공개 덱 노출 없이 전체 선택 경로의 데이터 부족을 해결할 후보. wire/저장/검증 리뷰와 제품 presentation은 별도 필요 |

**최소 추천:** 손패 선택의 정확 수락 대상까지 모든 경로에서 선행 접촉시켜야 한다면 B 전체를 검토한다. 선택 연쇄만 우선 좁게 고친다면 B1을 분리할 수 있으나 전체 #200 완료로 쓰지 않는다. 일반 Matched 경로만으로 기능을 제한하는 선택은 사용자의 따닥/복원/양좌석 요구를 줄이는 별도 수락이 필요하다. 기존 Matched와 Captured는 계속 권위 결과이며 새 필드는 ‘매칭/획득 확정’이 아니다.

## 4. B의 정확 필드 후보와 최소성 (미승인)

```ts
// BoardView.inFlight: 현재 미완료 턴의 공개 선택만. ctx 소실이면 null.
playTarget: CardId | null;

// HostMessage.events: 성공한 play 대상 선택 전이만, 없으면 필드 생략.
acceptedPlayTarget?: {
  seat: Seat;
  card: CardId;
  target: CardId;
  baseSeq: number;
};
```

첫 checkpoint의 범용 `acceptedTarget{source:'play'|'flip',...}`보다 좁힌 후보다. 현재 flip 대상은 이미 공개된 덱패의 실제 Matched(flip)에서 접촉 후 Captured로 이어질 수 있어 별도 flip 수락 필드 필요성은 입증되지 않았다. 신규 메시지·엔진 이벤트·액션 타입·추가 매초 전송은 제안하지 않는다.

- `inFlight.playTarget`은 playerView.ctx의 성공 수락 결과를 projection한다. played와 target이 공개·현재 턴·공개 floor에 있는 동안만 전달하고, 미선택/ctx=null은 null이다. 전체 ctx·deck·상대 hand를 전달하지 않는다. 최종 캡처·따닥을 선택한 한 짝의 조기 획득으로 해석하지 않는다.
- `acceptedPlayTarget`은 **성공한 reduce 이전 pending이 target(source=play)**일 때만, 그 pending의 seat/card/options와 실제 수락 action에서 구성한다. illegal/stale/paused 입력은 증거를 만들지 않는다. 로컬 클릭·계측 action·미래 Matched로 추정하지 않는다. 같은 월 따닥으로 ctx가 소실돼도 수락 사실만 남는다.
- `baseSeq`는 해당 수락 직전 **세션** 이벤트 순번이며 live events에서 `baseSeq=from−1`. card는 그 baseSeq까지 공개된 낸 카드, target은 그때 공개 후보 중 실제 수락된 원본이다. 공개 epoch는 인증 welcome의 기존 값, round는 envelope.view.round를 사용한다. engine-local seq와 섞지 않는다.
- consumer는 동일 epoch/round에서 baseSeq까지의 뷰/이벤트를 확보한 current batch에만 약한 접촉 관계를 사용할 수 있다. 이 증거 자체가 앞선 수락 공개이므로 첫 CardFlipped를 표시하기 전 접촉에 쓰되, 그 이벤트 카드·bonus·다음 pending을 미리 노출하지 않는다. 이벤트 list 및 onEvent 호출 순번·횟수는 그대로다.
- snapshot은 `inFlight.playTarget`으로 **현재 관계만** 복원한다. 복원 snapshot에 과거 수락 전이 필드를 붙여 모션을 재시작하지 않는다. live events가 크기 폴백으로 snapshot이 되면 final snap으로 수렴하며 과거 전이 재연 보장은 하지 않는다. 이 복구 의미는 현행 빈 snapshot과 같다.
- 왜 둘인가: snapshot 필드만이면 즉시 resolve의 target이 소실된다. 전이 필드만이면 현재 재접속 snapshot의 미완료 선택을 복구할 수 없다. snapshot에 마지막 수락 이력을 오래 남기는 단일 필드 대안은 새로운 이력 수명·판 경계·복원 저장을 요구하며 최소성이 입증되지 않았다. 이 두 목적을 분리하는 것이 추천이지 필드 개수 자체를 승인한 것은 아니다.

## 5. 세대·재전송·timeout·저장·구버전

| 경계 | 제안 불변식과 남은 검증 |
|---|---|
| 수동/원격 수락 | HostSession의 성공 적용 한 번에 귀속. 보는 좌석/로컬 요청 여부와 무관하게 동일 증거 제공. host outgoing observer도 wire와 같은 증거를 받아야 함 |
| 거절·중복 requestId | reject는 수락 관계0. 이미 완료한 요청의 snapshot ACK는 현재 관계만 전달하고 접촉을 두 번 시작하지 않음. 재전송 input ID와 수락 전이 identity를 혼동하지 않음 |
| baseSeq·차분 재접속 | 현행 events resync는 여러 actions를 한 차분으로 합칠 수 있어 단일 baseSeq 필드를 그대로 재전달하면 틀림. **추천은 복구 차분에 전이 증거를 생략하고 현재 snapshot 관계로 수렴**. 잃은 전이 재연까지 요구하면 순번별 여러 증거/이력 계약이 따로 필요; 현재 최소 범위에는 포함하지 않음 |
| 권위 timeout | 수동과 동일 applyAction 성공 경로에서 실제 target을 산출. TimeoutResult의 원인·key·actionIndex는 유지. 최소ID 선택/만료 확인·request 취소 정책을 바꾸지 않음 |
| 새로운 epoch/rollback | 이전 증거·geometry·재생 generation을 폐기. 새 snapshot에 ctx가 남으면 현재 target만 새 좌표로 재표시; 수락 전으로 되감겼으면 target=null. 같은 seq라도 epoch가 다르면 같은 전이 아님 |
| 호스트 저장 | 현행 HostSessionState.v=2, seed/actions replay가 ctx를 회복하므로 B1 때문에 저장 마이그레이션이 자동으로 필요한 것은 아님. geometry/수락 전이 캐시 저장은 제안하지 않음. 기존 v1 이관·timer clockUnknown 정책 보존 |
| 게스트 관찰 저장·공정성 | 현행 viewDigest는 inFlight/pending을 해시에 넣지 않는다. 기존 hash를 무심코 바꾸면 옛 저장 관찰의 거짓 실패 위험. B1을 기존 digest 밖에 둬도 선택 증거의 별도 공정성 검증이 완료되는 것은 아님. 신규 전이의 baseSeq/card/target을 판 종료 replay와 대조하려면 ObservedRound 및 GuestSessionState의 별도 관찰 저장·구버전 marker/미관찰 구간 검증 불가 정책이 필요. **추가 필드·저장 버전/이관은 근거와 독립 리뷰 대상**, 이번 구현0. 기존 관찰/timeout의 verified를 신규 target 검증 PASS로 재사용하지 않음 |
| wire 호환 | 현행 PROTOCOL_VERSION=3, docs/protocol.md §11.4는 모르는 필드 제거·필수 계약 비호환을 명시. B를 필수 UX 계약으로 채택하면 새 wire(후보4)와 VERSION_MISMATCH 안내를 같이 검토. 선택적 새 필드를 v3로 조용히 연결해 구버전도 같은 UX라고 주장하지 않음 |
| artifact·상한 | 같은 wire의 웹/APK artifact와 빌드 version 메타데이터 정책을 확인. 기존 16KiB 게임 frame, raw2,097,152B/초기 encoded1,500,000B 유지. 필드 증분·최대 snapshot/events/관찰 저장 바이트는 제품 단계에 실측. 라이브/release clone으로 검증하지 않음 |

스키마 구조 검사는 CardId0~50·seat0/1·안전 정수 baseSeq·events 범위 일치를 확인해야 한다. 이전 공개 pending 후보·월 관계·성공 수락과의 의미 대조는 host/guest 및 replay 경계에서 한다. 알 수 없는 필드를 보존하는 loose object나 미인증 raw 프레임을 선택 근거로 쓰지 않는다. 저장 이관을 선택한다면 별도 버전 명세가 선행이며 이 문서는 숫자를 확정하지 않는다.

## 6. #202와 target/before pose/capture의 경계

#202 최신 사용자 정정: 2장은 뒷패를 식별할 만큼 노출, 3+는 월 묶음·장수·보너스·뻑을 compact하고 일관되게 읽는다. 후보 선택에서는 온전한 그림과 실제 CardId를 연결한다. 고정36/−24·rotation0·상시 전면 노출을 계약에 넣지 않는다. 6~7장 가능성은 합법 증거와 stress를 구별한다.

- **authority target:** 성공 수락의 원본 CardId. **presentation anchor:** #202가 현재 압축 묶음을 배치하는 위치/대표 표현. 대표 패나 월 중심을 target ID로 대체하지 않는다.
- #202의 좁은 읽기 계약은 압축 그림에서 개별 앞면이 보이지 않는 **공개 floor CardId도** 원본 ID→현재 before pose를 제공해야 한다. DOM에 그 ID의 img가 없을 수 있으므로 querySelector/getBoundingClientRect 존재를 전제하지 않는다. 실제 layout projection의 좌표/회전·공유 대표 pose 여부를 명시한 ID 매핑 후보이며 새로운 DOM registry/API를 확정한 것은 아니다.
- #200 소비자는 원본 카드별 pose를 기존 round/eventSeq/Playback generation에 묶어 capture 출발까지 예약한다. popup 복제 rect는 원본 pose가 아니다. AABB에 offset/rotation을 중복 적용하지 않는다. geometry는 wire/저장에 넣지 않는다.
- UX-02 위치 고정·pointerdown/up·Enter의 gesture 안전성은 #202가 제안한다. viewport 변경으로 미제출 gesture·old pixel pose를 취소/재활성화할 수 있어도 **수락된 게임 선택은 취소되지 않는다**. 애니메이션 cancel/skip 역시 선택 undo가 아니다(FR-17).
- 원격 수락/timeout이 먼저 완료되면 오래된 gesture는 새 pending에 제출하지 않는다. 좌표 재측정은 현재 권위 ID에만 연결하고, reject/stale/새 epoch이면 과거 preview·예약을 폐기한다. 공간 재배치가 requestId/DecisionKey/수락 결과의 단일 귀속을 바꾸지 않는다.
- R1/B2+flipStep/resolve에서 기본3장 뻑+held bonus3→바닥6, 남은 월1의 matchSingle 전체 Captured라는 #233 reviewer의 **정적 경계**를 인계받았다. display CardPlayed/addToFloor에서 원6+incoming1의 UI7 transient 가능성은 상시 floor7과 다르다. 원6 묶음의 정확 IDs/before poses→마지막1 접촉→실제7 멤버의 capture 출발을 회귀 경계로 둔다. 실행 fixture PASS·합법 seed 확인·6/7 모두 실측으로 승격하지 않으며 이번 대형 탐색0이다.

강한 획득 표현·최종 배치는 실제 Captured/PiStolen만 변경한다. 따닥·뻑·폭탄·마지막 턴·보너스는 일반 두 장 Matched로 축소하지 않는다. 표적6/7, 장수 변화, resize/회전, snapshot/reset, skip/reduced의 geometry 수용은 후속 담당과 root 소유 조율 뒤 검증한다.

## 7. 정확 diff 소유·승인 지점·checkpoint

현재 소유: 이 문서, plan §3-2의 #200 자기 단위, `protocol/test/public-match-target.test.ts`. 승인 뒤 후보 소유는 `protocol/src/{view,view-types,schema}.ts`의 해당 필드와 `messages.ts` events 구조·`host.ts` 성공 수락/publish·`guest.ts` 증거 수신/관찰, `verify.ts` 필요한 독립 대조·직접 protocol 시험이다. `codec.ts` 버전/의미 검증·`docs/protocol.md` 버전 정책·게스트 저장 형식 변경은 독립 리뷰에 포함한다. 이 후보가 승인 전 제품 diff 범위를 넓히지는 않는다.

### 솔로 생산·전달 및 순번 namespace 인계 (독립 리뷰 P2 보완)

[독립 COMMENT](https://github.com/kywoo26/p2p-gostop/pull/234#pullrequestreview-5380723146)의 유일 P2는 host/guest뿐 아니라 솔로의 성공 수락 전이 생산·전달도 후속 인계에 포함하라는 지적이다. 아래는 기준 소스 대조와 미완 인계 조건이며 솔로 제품·wire·저장 구현을 추가한 것이 아니다.

공통 **현재 뷰 projection**과 **성공 전이 증거 생산/전달**은 다른 접점이다. [solo.svelte.ts:197](../../packages/web/src/game/solo.svelte.ts#L197)의 viewOf/boardOf는 [adapter.ts:55](../../packages/web/src/game/adapter.ts#L55)의 protocol toBoardView 호출로 이어져 B1 현재 관계를 공유할 수 있다. 그러나 즉시 resolve에서 ctx=null이면 projection만으로 소실된 선택 target을 만들 수 없다. HostSession만 변경해서 솔로의 전체 착지가 충족됐다고 하지 않는다.

| 솔로 생산 경계 | 성공 귀속·공통 전달의 후속 조건 |
|---|---|
| 수동 `submit` ([273행](../../packages/web/src/game/solo.svelte.ts#L273)) | disposed/canAct/seat 검사→sessionAct 성공 확인→commitState→enqueue. 성공 전 prev.pending(source=play)의 공개 seat/card/options·실제 적용 action·판/순번을 확보해 수락 증거를 생산한 뒤 공통 consumer로 전달 |
| CPU `runCpu` ([431행](../../packages/web/src/game/solo.svelte.ts#L431)) | 합법 AI 결정 또는 합법 fallback→disposed/generation 재검사→sessionAct 성공→commitState→enqueue. 이전 상태를 잃기 전에 수동과 같은 공개 증거를 생산. 오래된 generation/거절에는 증거0 |
| 기존 자동 선택 | [AutoChoice callback](../../packages/web/src/game/solo.svelte.ts#L144)은 submit을 호출. [controller.ts:129](../../packages/web/src/game/controller.ts#L129)의 최신 round/eventSeq/합법 action 재검사 뒤 같은 성공 경계 사용. 자동 제출 예정값은 수락 증거가 아님 |

[session.ts:161](../../packages/web/src/game/session.ts#L161)의 sessionAct는 phase 검사 및 reduce 성공 뒤 실제 action을 actions에 추가하고 events를 반환한다. 성공 전 pending/실제 action→증거→enqueue의 후보 생산점은 이 순수 성공 전이 또는 그 결과를 가진 호출부다. 공통 전이 projection을 sessionAct에서 부르는 안과 각 호출부가 같은 projection을 쓰는 안의 파일 소유/최소성은 후속 root 인계로 정한다. 수동·CPU·자동은 같은 성공 predicate와 공개 payload 의미를 사용하며 엔진 좌석은0/1이다. 생산자 종류를 엔진 seat 정체나 규칙 타입으로 추가하지 않는다. [현재 enqueue:369](../../packages/web/src/game/solo.svelte.ts#L369)의 action/tapAt은 계측용이고 CPU 호출은 action=null이므로 공통 수락 근거로 쓸 수 없다.

**순번 namespace:** P2P HostSession.viewFor는 BoardView.eventSeq를 세션 전체 seq로 덮고 publish의 list seq도 같은 세션 순번이다. §4의 P2P baseSeq는 성공 수락 직전 session seq이며 live events.from−1이다. 솔로 boardOf는 game.eventSeq를 그대로 쓰고, engine newRound/blankDraft는 eventSeq0에서 시작하며 session.startNextRound는 새 game/round·actions=[]를 만든다. 솔로 local baseSeq는 같은 판의 이전 game.eventSeq로 다뤄야 한다. P2P의 from−1·welcome epoch·DecisionKey/timeout 정책을 솔로에 복제하지 않는다.

전이 소속 판은 성공 전 game.round.number에 귀속하고 성공 결과/배치 판과 대조한다. 마지막 액션은 판을 끝내지만 판 번호를 바꾸지 않으며 다음 판 시작은 별도 전이다. 이후 BoardView.round로 옛 증거를 재명명하지 않는다. P2P epoch/rollback과 솔로 판별 seq 재사용을 구분하고, 모드/세션 수명·round·해당 seq namespace 및 기존 Playback generation에 맞춰 오래된 증거·좌표를 폐기한다. 새 솔로 epoch/저장 필드를 확정한 것은 아니다. 솔로 복원도 현재 game.ctx의 권위 관계로 수렴하며 저장된 액션이나 모션을 새 수락 전이로 재연하지 않는다. 솔로 재생용 전달과 게스트 commit-reveal 관찰 저장은 별개 범위다.

**후속 root 소유 인계 미완:** `p2p/{host,guest}.svelte.ts`의 local observer/guest enqueue뿐 아니라 `game/solo.svelte.ts`의 submit/runCpu/공통 enqueue, 필요 시 `game/{session,adapter}.ts`의 성공 전이 projection·현재 뷰 보존 접점 및 직접 검증도 인계 후보로 포함한다. 동일 증거를 local observer·guest·solo consumer에 전달하고 중복 접촉을 막는 검증이 남는다. 솔로 좌석0/1 성공 수락·CPU fallback/오래된 generation·자동 선택 수락/거절·즉시 resolve/선택 연쇄·마지막 액션 후 명시 다음 판·복원은 후속 검증 조건이며 이번 실행 PASS가 아니다. 웹 adapter 파일 소유는 현재 확대하지 않는다. Playback/display/choreo 및 Board/Floor·geometry API도 현재 소유 밖이다.

독립 리뷰가 인정한 것은 새 공개 정보의 필요성이다. §4의 네 필드 tuple은 자기 설명·대조가 쉬운 후보이며 필드별 최소성/최종 wire 채택은 미승인이다. 이전 공개 pending과 live from−1을 반드시 확보하는 target-only 모델, 첫 CardFlipped의 권위 target 확장과 EngineEvent/ProtocolEvent·eventDigest·replay/저장 관찰 호환 영향 비교는 후속 계약 선택에 남는다. 이 P2 인계 보완이 그 대안들을 기각하거나 필드/버전/저장 구현을 승인하지 않는다.

root 결정은 최대2점이다. (1) 기존 이벤트 지연 표현의 한계와 B1/B 전체 중 이번 구현 계약/복구 수용 범위 선택. (2) 채택한 wire·관찰 저장/구버전 처리와 파일 인계를 독립 리뷰 후 확정. 사용자에게 같은 UX 질문·commit/push 승인을 다시 묻지 않는다.

검증: 핀 Node24.21.0/npm11.19.0 `nvm use`, 최초 `npm ci` 완료. protocol 표적10시험, protocol TS7 타입 검사, 재현 파일의 type-aware oxlint/oxfmt 통과. privacy 자체16시험 통과·추적 finding0, staged whitespace 오류0이다. Vitest API는 Context7 callable이 없는 세션에서 plan §0.1의 공식 문서 대안을 사용해 [Test API](https://vitest.dev/api/test), [expect](https://vitest.dev/api/expect.html)를 구현 전에 조회했다. 신규 dependency0.

재현 명령은 저장소 루트에서 이미 설치한 nvm의 `nvm use` 뒤 `npx vitest run packages/protocol/test/public-match-target.test.ts`이다. 값 치환 placeholder나 새 환경변수는 없다. 요구 실패 assertion과 characterization 통과의 의미를 §2처럼 구별한다. 제품 단계 승인 후 AGENTS §5 한회: lint/check/test/test:browser/build/e2e:smoke/Android, `PLAYWRIGHT_PORT=4259`, E2E≤4·timing직렬·Gradle≤4. 지금 full suite·브라우저·성능·실기기·bundle/serving 계측 PASS0이다.

checkpoint의 결론은 **공개 데이터 공백을 실행으로 입증하고 최소 계약 후보를 제출한 것**이다. wire 구현·저장 이관·착지 제품·정본 UX 개정은 미완이며, root 계약 선택 뒤 같은 역할에서 이어간다. 계획 commit full SHA·기준 SHA·수락 범위·검증/미검증·프로토콜 변경 후보는 Draft PR 본문에 기록한다. 이슈는 역링크 댓글만, merge0.

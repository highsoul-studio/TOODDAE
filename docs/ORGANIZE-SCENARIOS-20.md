# Twenty contextual organization prompts and UI test plan

## Current candidate

- Local branch: `aside/prompt-structure-20261007`; published baseline `d1ead64289a3772d24e4536b8ae6ede15e532616`.
- `Dayline/lib/ai.js` SHA256: `03ed237717aa49530011cd2d68be48fa831745598c2095381060026c0a819845`.
- Baseline inventory: 9 keys. Added: 11. Total: 20. All are sectioned/bulleted guidance in the same organization request; there is no additional classifier call.
- Only the `SYSTEM_PROMPTS` block changes in the production file intended for the runtime test. Non-prompt code is byte-identical to the active baseline. The separate local Do prompt rewrite is not part of this runtime application.
- Write system message: 19,700 characters. Input-cost growth is a limitation of sending all 20 playbooks; no token-price or billing estimate is claimed.
- The older `PROMPT-REVIEW-2026-10-07.md` records the preceding nine-module stage, not this new 20-module candidate.

## Inventory

1. common: 일반 메모 요약·정리
2. coding: 개발·디버깅 기록
3. numeric: 수치·옵션 비교
4. meeting: 회의록·결정·미결 사항
5. action: 할 일·담당자·기한
6. learning: 학습·개념·질문 정리
7. journal: 일기·경험·감정 정리
8. ideas: 아이디어·가설·대안 정리
9. project: 프로젝트·마일스톤 계획
10. decision: 의사결정·선택지 비교
11. research: 조사·출처·근거 정리
12. reading: 독서·기사·강의 기록
13. requirements: 제품 요구사항·수락 기준
14. feedback: 고객 피드백·지원 기록
15. budget: 예산·지출·정산 기록
16. schedule: 일정·여행·행사 계획
17. procedure: 절차·운영 가이드 정리
18. health: 건강·증상·생활 기록
19. contract: 계약·정책·조건 정리
20. mixed: 복합 메모 통합 정리

## Completed validation

- Final affected unit/HTTP tests: 78/78 PASS, no failures, skips or cancellations. The inventory fixture maps one-to-one to all 20 keys.
- JavaScript syntax and `git diff --check`: PASS.
- Independent prompt-focused reviewer: Aside child `F2XK7lDsL16YnUzV`, verified lane `openai-codex/gpt-6-luna`. PASS on the exact current `ai.js` hash after clarifying that meaningful historical chronology takes precedence over action deadline sorting. No blanket release approval is inferred.
- Reviewer count wording was corrected to 9 + 11 = 20. Its earlier broad-suite launcher timeout is outside the prompt-focused pass; it did not establish whether that launcher touched an active service. Do not present that broad suite as green.
- All 20 real-provider UI scenarios have now run, been applied, and read back on the reviewed prompt hash. Independent semantic review is PASS 20 / MINOR 0 / FAIL 0. Exact persisted title/body matching is 20/20. Detailed evidence and version boundaries are in `ORGANIZE-APP-QA20-2026-10-08.md` and its JSON.

## Synthetic UI fixtures

- File: `Dayline/test/organize-scenarios.json`, SHA256 `25d15b6568947b0a755970d9c81e870d9f4040e12daf3df3c7ab56736003503b`.
- All 20 bodies are explicitly fictional. They contain no original user notes, genuine health records, customer identities or actual contracts.
- Cases include numeric status/units, missing versus explicit zero, independent transactions, protected code/task lines/quotations, decisions versus proposals, chronology/dependencies, sending prohibitions and non-invention of medical/legal conclusions.
- Required keywords are only a preliminary check. A passing keyword check is not proof that every fact or condition survived; inspect the actual proposal and rendered result case by case.

## App test preparation and authorization boundary

- User explicitly requested real app tests for all 20 situations after viewing the title list. Current selected AI is DeepSeek / deepseek-flash / high; retain that configuration and use only the synthetic fixtures.
- Initial plan required a separate temporary folder. The owner then explicitly confirmed that the current `<TEMP_VAULT>` is already a temporary vault and permitted touching/deleting its existing notes for this test task. That scope does not extend to other vaults, keys, accounts or unrelated destructive actions. Use new `[QA20-*]` notes, avoid unnecessary deletion, and do not switch folders.
- Authorized preparation executed: backed up only the old `lib/ai.js`, recorded 28 existing Markdown hashes, atomically applied the reviewed file, and used the app's existing `/api/restart` endpoint because there is no frontend restart control. Independently confirmed PID 75499 → 94166, identical app/runtime-home/vault identities, and active source hash `03ed237717aa49530011cd2d68be48fa831745598c2095381060026c0a819845`. No service install, folder switch or credential change was performed.
- Do not copy private keys/home into a test repository. Existing credential use occurs only through the normal app and approved synthetic inference scope.
- Complete the required explicit connection test for the effective test folder/provider configuration, then create and organize one virtual note per scenario using the UI.
- Capture source, actual proposal, rendered formatting, protected text and acceptance findings per case. Do not automatically retry an unknown paid inference result.
- No folder restoration is needed because no folder switch occurs. Confirm the original data/configuration and separately account for the new test notes. Any actual inference results remain unconfirmed until observed.
- No GitHub push or unrelated unreleased source bundle is included.

## Current UI execution status

- 20/20 executed and applied for this prompt candidate. Cases 06–20 completed sequentially after invalid parallel attempts were stopped. Required tables 5/5 and protected source strings all preserved. Original non-settings Markdown hashes are 27/27 unchanged; `Set/Settings.md` changed and is explicitly excluded from that claim.
- Permission blocker cleared by the owner's current explicit temporary-vault authorization. Candidate activation and the UI connection test are confirmed; current provider/model/reasoning remained DeepSeek/deepseek-flash/high, and the Set screen reports connected.
- The two separate UI correction requests are in `UI-FOLLOWUPS-2026-10-08.md`; neither is fixed by these prompts. Active UI files changed during validation without being written by this prompt task. Current two-level nested-list rendering was rechecked successfully; full toast/UI regression is not claimed. Finder is excluded. No GitHub push was performed.


## Subsequent GitHub publication authorization

- After QA completion, the owner explicitly requested checking the current local/GitHub state and uploading changes not already present.
- Inspection found the UI fixes already on `origin/main` at `8131c88`; the prompt and QA changes remained local.
- Publication target is `highsoul-studio/TOODDAE`, branch `aside/prompt-structure-20261007`, based on the latest inspected `origin/main`. No main-branch merge or additional runtime deployment is included.
- The local Do prompt rewrite and its mock/unit regression are part of the earlier runtime-prompt review. They are published as candidate source, not claimed to have been activated or real-provider tested by QA20.
- Earlier “no GitHub push” statements describe the QA-completion checkpoint before this subsequent authorization. Publication success must be verified against the accepted remote branch/commit.

# usage-reporter

Keeps the weekly subscription limit reading (`seven_day` window: percent used and reset time)
that Claude Code already has after each main-thread turn, shows it in `/usage-reporter`, and,
only when you set it up, POSTs each new reading once to the account's usage endpoint.

**Off by default.** With `enabled` false, or with `postUrl`, `accountId` or `postToken` missing,
nothing is sent; `/usage-reporter` says which.

## 설치와 설정 (한국어)

준비물: Claude Code 2.1.287 이상(최신 버전 권장), Python 3, git. 플러그인 ID는
`usage-reporter@claude-code-mods`입니다.

GitHub와 복제한 Git 저장소는 같은 마켓플레이스 이름 `claude-code-mods`를 씁니다. 한 곳만
추가하세요. 다른 곳으로 바꾸려면 `claude plugin marketplace remove claude-code-mods`로 먼저
지웁니다.

GitHub에서 설치:

```bash
git clone https://github.com/cskwork/claude-code-mods.git
cd claude-code-mods
python3 scripts/setup-usage-reporter.py
```

다른 Git 서버에서 설치 (`git.example.com/your-team`은 실제 저장소 주소로 바꾸세요):

```bash
git clone https://git.example.com/your-team/claude-code-mods.git
cd claude-code-mods
python3 scripts/setup-usage-reporter.py --marketplace https://git.example.com/your-team/claude-code-mods.git
```

Windows에서는 `python3` 대신 `py -3`를 사용하세요. macOS와 Claude Code 2.1.300에서 검증했습니다.

스크립트가 하는 일:

1. 본인 계정 UUID, 전체 HTTPS 수신 URL, 수신 키를 묻습니다. 수신 URL은 기본값이 없으며
   반드시 직접 입력해야 합니다. 키는 화면에 표시되지 않습니다. URL은 `https://`여야 하고,
   `user:password@`를 넣을 수 없으며,
   같은 UUID를 포함해야 합니다.
2. `claude plugin install usage-reporter --marketplace <저장소> --scope user`로 설치합니다.
   마켓플레이스가 없으면 Claude Code가 먼저 추가합니다.
3. 값을 `claude plugin configure usage-reporter@claude-code-mods --values-stdin`의 stdin으로만
   넘깁니다. `postUrl`과 `postToken`은 Claude Code 보안 저장소에 저장됩니다.

각 설치자가 본인의 계정 UUID와 수신 키를 넣습니다. 이 저장소에는 운영 주소, 실제 UUID, 키가 없습니다.
수신 URL은 직접 입력해야 합니다.
키를 명령줄 인자, 셸 기록, 채팅에 붙여 넣지 마세요.

보고는 마지막 질문에 `y`라고 답할 때만 켜집니다. 기본값은 꺼짐입니다. 나중에 켜려면
`--skip-install`을 붙여 스크립트를 다시 실행합니다. 설정 후 Claude Code에서 `/reload-plugins`를
실행하고 `/usage-reporter`로 상태를 확인하세요.

Claude Code 안에서 직접 설치해도 됩니다. 이때 설정은 위 스크립트를 `--skip-install`로 실행해서 넣습니다.

```
/plugin marketplace add cskwork/claude-code-mods
/plugin install usage-reporter@claude-code-mods
/reload-plugins
```

업데이트는 이 플러그인만 대상으로 합니다. 적용하려면 Claude Code를 다시 시작하세요.

```bash
claude plugin marketplace update claude-code-mods
claude plugin update usage-reporter@claude-code-mods
```

스크립트를 쓸 수 없을 때는 편집기로 저장소 밖(예: `~/usage-reporter.json`)에 JSON 파일을 만들고 권한을 `600`으로 제한한 뒤 stdin으로
넘깁니다. 아래 값은 예시이며 모든 값은 한 줄 문자열입니다. 적용 후 파일은 지우세요.

```json
{"enabled": "false", "postUrl": "https://receiver.example/api/accounts/00000000-0000-0000-0000-000000000000/usage", "accountId": "00000000-0000-0000-0000-000000000000", "postToken": "FAKE-RECEIVER-KEY"}
```

```bash
chmod 600 ~/usage-reporter.json
claude plugin configure usage-reporter@claude-code-mods --values-stdin < ~/usage-reporter.json
```

보내는 내용과 한계(아래 영어 절에 자세히 있음):

- 본문은 `weekly_usage_percent`, `weekly_resets_at` 두 필드뿐입니다.
- 값은 Claude Code가 마지막 API 응답에서 받아 둔 주간 사용량입니다. Anthropic에 따로 조회하지 않고,
  OAuth 정보를 읽지도 않습니다.
- Claude Code 세션이 열려 있고 컴퓨터가 깨어 있을 때만 한 시간마다 보냅니다. 데몬이나 cron은 없습니다.
- 읽은 값이 없거나, 한 시간보다 오래됐거나, 이미 보낸 값이면 건너뜁니다. 새 관측값만 보냅니다.

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Send reports. |
| `postUrl` | `""` | Sensitive, kept in Claude secure storage. The account's usage URL. Must be `https:`; `user:password@` is rejected. |
| `accountId` | `""` | The account UUID. Used only locally, to label the receiver in `/usage-reporter`; it must match the UUID in `postUrl`. Not sent in the body. |
| `postToken` | `""` | Required, sensitive, kept in Claude secure storage. The per-account receiver key, sent only as `Authorization: Bearer <key>`. Never a Claude credential. |

`/usage-reporter` prints the reading, its age, why a report is waiting, whether reporting is off,
misconfigured or on (the receiver's origin only, never its path or the token), and the last POST
and last success.

## The report

`POST https://receiver.example/api/accounts/{account UUID}/usage` with
`content-type: application/json` and `Authorization: Bearer <receiver key>`. The body has exactly
two fields:

```json
{ "weekly_usage_percent": 42.5, "weekly_resets_at": "2026-10-20T08:00:00.000Z" }
```

- `weekly_usage_percent`: the `seven_day` window's `percentUsed`, 0 to 100, as Claude Code reports it.
- `weekly_resets_at`: the window's reset time, ISO 8601. A reading without one is not sent. Never guessed.
- Success means a 2xx response. Any other status or a network error is shown in `/usage-reporter`;
  there are no retries between hourly ticks.

## When a report is sent

The plugin stamps each reading with a local `observedAt`: when it read Claude Code's cached usage
after a main-thread turn. It is **not a timestamp from Anthropic**, and the server has no confirmed
input field for it yet, so it is not sent. Until that contract is confirmed, the plugin cannot
guarantee that the receiver preserves the original observation time, and does not replay:

- An hourly tick POSTs the last reading only if it is under an hour old, has a known reset time
  that has not passed, and has not already been sent successfully.
- Stale, missing or repeated readings are skipped, not re-sent. After a failed POST, a later hourly
  tick tries again when a new, fresh observation is available.
- A missing `seven_day` window, or a percentage outside 0 to 100, is "unknown", never 0. It clears
  the prior reading; reporting resumes after the next valid one.

## Limits

- Nothing is fetched from Anthropic. `$.session.usage()` returns what the last API response
  reported; no background query, cron, launchd or daemon exists. No turn, no new reading, no report.
- Hourly ticks run only in a live, awake Claude Code session. After exit or sleep nothing is sent.
- Two sessions open at once each send their own reports.
- One request at a time: a request still pending at the next tick is not started again. Network
  errors hide request details.
- Subagent turns are ignored. Subscription billing dates are not reported.

## Check

```bash
claude plugin validate usage-reporter && claude plugin test usage-reporter
python3 usage-reporter/scripts/test-enabled.py
```

Tests mock the clock, usage, config and HTTP; they make no network calls. The script runs the
same hooks in an isolated plugin copy with enabled fixture defaults, without changing user settings.

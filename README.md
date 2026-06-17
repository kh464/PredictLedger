# PredictLedger 预测账本系统

简化版预测平台后端，重点实现账户余额管理、幂等处理、下注状态机、追加式账本和管理端对账。

## Tech Stack

- Node.js
- TypeScript
- Express
- Prisma
- SQLite
- Vitest
- Zod

## Getting Started

```bash
npm install
cp .env.example .env
npm run db:push
npm run prisma:seed
npm run dev
```

Windows PowerShell 中也可以使用：

```bash
Copy-Item .env.example .env
```

请在启动后端服务前执行 `npm run db:push`。如果后端开发服务已经在运行，Windows 下 Prisma Client 生成阶段可能因为文件占用报 `EPERM`，停止服务后重新执行即可。

如果需要生成迁移文件，可以执行 `npm run prisma:migrate`。如果本机 Prisma schema engine 无法执行 SQLite 建表，可以使用项目提供的 SQL 初始化兜底：`npm run db:init`，该命令要求本机已安装 `sqlite3` 命令行工具。

默认服务地址：

```text
http://localhost:3000
```

健康检查：

```http
GET /health
```

## Running Tests

```bash
npm test
```

当前测试覆盖充值、下注、结算、取消、幂等冲突、对账异常和并发扣款等核心场景。

## 前端控制台

可选的 Web 控制台位于 `frontend/`，只使用本作业已经实现的后端接口。

```bash
cd frontend
npm install
npm run dev
```

Vite 开发服务器会把 `/api` 和 `/health` 代理到 `http://localhost:3000`，因此需要同时保持后端运行：

```bash
npm run dev
```

控制台提供：

- 接口健康检查
- 带幂等键的充值
- 带幂等键的下注
- 结算 / 取消状态机操作
- 管理端对账
- 最近一次请求 / 响应控制台

## Environment

```text
DATABASE_URL="file:./dev.db"
PORT=3000
```

## Architecture

```text
src/
  controllers/   HTTP 输入输出
  services/      业务流程和事务
  domain/        状态机、错误、金额规则
  middlewares/   错误处理和异步捕获
  routes/        REST 路由
  lib/           Prisma client、hash 工具
prisma/
  schema.prisma
  seed.ts
tests/
```

Controller 不承载业务逻辑，资金变更和状态流转集中在 Service 与 Domain 中。

## Data Model

### User

- `id`
- `username`
- `balance`
- `createdAt`
- `updatedAt`

`balance` 是查询快照，真实资金流转由 `Ledger` 审计。

### Bet

- `id`
- `userId`
- `gameId`
- `amount`
- `status`: `PLACED | SETTLED | CANCELLED`
- `result`: `WIN | LOSE | null`

### Ledger

追加式账本，不更新、不删除历史记录。

| Type | Meaning | Amount |
| --- | --- | --- |
| `DEPOSIT` | 用户充值 | 正数 |
| `BET_DEBIT` | 下注扣款 | 负数 |
| `BET_CREDIT` | WIN 派奖 | 正数 |
| `BET_REFUND` | 取消退款 | 正数 |

### IdempotencyRecord

用于记录幂等请求：

- `scope`
- `key`
- `requestHash`
- `responseStatus`
- `responseBody`

数据库唯一约束：

```text
UNIQUE(scope, key)
```

## API Reference

### Deposit

```http
POST /api/users/:id/deposit
Idempotency-Key: dep-001
Content-Type: application/json

{
  "amount": 1000
}
```

成功响应：

```json
{
  "userId": 1,
  "balance": 1000,
  "ledgerId": 1
}
```

### Create Bet

```http
POST /api/bets
Idempotency-Key: bet-001
Content-Type: application/json

{
  "userId": 1,
  "gameId": "game-001",
  "amount": 300
}
```

成功响应：

```json
{
  "betId": 1,
  "userId": 1,
  "gameId": "game-001",
  "amount": 300,
  "status": "PLACED",
  "balance": 700
}
```

### Settle Bet

```http
POST /api/bets/:id/settle
Content-Type: application/json

{
  "result": "WIN"
}
```

`WIN` 使用简化赔率：`payout = bet.amount * 2`，即返还本金并获得等额盈利。

### Cancel Bet

```http
POST /api/bets/:id/cancel
```

仅允许取消 `PLACED` 状态的下注，取消后创建 `BET_REFUND` 并退回下注金额。

### Reconcile

```http
GET /api/admin/reconcile?userId=1
```

返回：

```json
{
  "userId": 1,
  "databaseBalance": 1300,
  "ledgerBalance": 1300,
  "matched": true,
  "betStats": {
    "PLACED": 0,
    "SETTLED": 1,
    "CANCELLED": 0
  },
  "issues": []
}
```

## Idempotency Design

幂等不仅保存 `Idempotency-Key`，还会保存请求哈希。

- 相同 `scope + key + requestHash`: 返回首次响应。
- 相同 `scope + key` 但不同 `requestHash`: 返回 `409 Conflict`。
- `UNIQUE(scope, key)` 用于兜住并发重复请求。

充值和下注接口均支持幂等。

## State Machine

允许：

```text
PLACED -> SETTLED
PLACED -> CANCELLED
```

禁止：

```text
SETTLED -> SETTLED
SETTLED -> CANCELLED
CANCELLED -> SETTLED
CANCELLED -> CANCELLED
```

结算和取消使用状态条件更新：

```text
WHERE id = betId AND status = PLACED
```

这样可以避免并发重复结算和重复退款。

## Ledger Design

所有余额变化都必须写入追加式账本：

- 充值写 `DEPOSIT`
- 下注写 `BET_DEBIT`
- WIN 结算写 `BET_CREDIT`
- 取消写 `BET_REFUND`

`User.balance` 被保留为查询快照，`Ledger` 是审计事实来源。对账接口会比较：

```text
User.balance === SUM(Ledger.amount)
```

seed 用户余额默认为 `0`，因此系统启动时余额和账本天然一致。

## Transaction Boundaries

- Deposit: 幂等记录、`DEPOSIT`、余额更新。
- Bet: 条件扣款、Bet、`BET_DEBIT`、幂等记录。
- Settle WIN: 状态条件更新、`BET_CREDIT`、余额更新。
- Cancel: 状态条件更新、`BET_REFUND`、余额更新。

## Reconciliation Issues

对账接口会报告：

- `BALANCE_MISMATCH`
- `MISSING_BET_DEBIT`
- `MISSING_BET_CREDIT`
- `MISSING_BET_REFUND`
- `DUPLICATE_BET_CREDIT`
- `DUPLICATE_BET_REFUND`
- `NEGATIVE_USER_BALANCE`
- `INVALID_LEDGER_AMOUNT_DIRECTION`

## Error Format

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient balance"
  }
}
```

## Design Trade-offs

- 金额使用整数，避免浮点精度问题。
- `User.balance` 保留为读模型，方便业务查询。
- `Ledger` 作为审计事实来源，便于对账和异常发现。
- SQLite 并发能力有限，因此资金操作使用短事务和条件更新。
- `LOSE` 不创建金额账本，因为没有余额变化。

## Submission

- GitHub 仓库地址：https://github.com/kh464/PredictLedger.git
- 在线预览地址：作业要求中为可选项，本项目默认本地运行。
- 后端测试命令：`npm test`
- 后端构建命令：`npm run build`
- 前端构建命令：`cd frontend && npm run build`

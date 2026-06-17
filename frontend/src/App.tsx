import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  DatabaseZap,
  Play,
  RefreshCcw,
  RotateCcw,
  Send,
  Server,
  ShieldCheck,
  WalletCards,
  XCircle
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { ApiLog, Reconciliation } from './types';

type Result = 'WIN' | 'LOSE';
type BetStatus = 'PLACED' | 'SETTLED' | 'CANCELLED';

function newKey(): string {
  return crypto.randomUUID();
}

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function StatusBadge({ label, tone }: { label: string; tone: 'green' | 'red' | 'blue' | 'gray' | 'amber' }) {
  return <span className={`status-badge ${tone}`}>{label}</span>;
}

function Panel({
  icon,
  title,
  subtitle,
  children
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-icon">{icon}</div>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="json-block">{JSON.stringify(localizeForDisplay(value), null, 2)}</pre>;
}

const betStatusLabels: Record<BetStatus, string> = {
  PLACED: '已下注',
  SETTLED: '已结算',
  CANCELLED: '已取消'
};

const errorLabels: Record<string, string> = {
  BAD_REQUEST: '请求参数错误',
  MISSING_IDEMPOTENCY_KEY: '缺少幂等键',
  USER_NOT_FOUND: '用户不存在',
  BET_NOT_FOUND: '下注不存在',
  IDEMPOTENCY_CONFLICT: '幂等键冲突',
  BET_STATE_CONFLICT: '下注状态冲突',
  INSUFFICIENT_BALANCE: '余额不足',
  INTERNAL_ERROR: '服务内部错误',
  REQUEST_FAILED: '请求失败'
};

const displayKeyLabels: Record<string, string> = {
  method: '请求方法',
  url: '请求地址',
  headers: '请求头',
  body: '请求体',
  status: '状态码',
  response: '响应内容',
  error: '错误',
  code: '代码',
  message: '说明',
  userId: '用户ID',
  balance: '余额',
  ledgerId: '账本ID',
  betId: '下注ID',
  gameId: '游戏ID',
  amount: '金额',
  result: '结果',
  payout: '派奖金额',
  refund: '退款金额',
  databaseBalance: '数据库余额',
  ledgerBalance: '账本推导余额',
  matched: '是否一致',
  betStats: '下注状态统计',
  issues: '异常列表',
  metadata: '元数据',
  resourceType: '资源类型',
  resourceId: '资源ID',
  'Content-Type': '内容类型',
  'Idempotency-Key': '幂等键'
};

const displayValueLabels: Record<string, string> = {
  GET: '读取',
  POST: '提交',
  true: '是',
  false: '否',
  PLACED: '已下注',
  SETTLED: '已结算',
  CANCELLED: '已取消',
  WIN: '赢',
  LOSE: '输',
  DEPOSIT: '充值',
  BET_DEBIT: '下注扣款',
  BET_CREDIT: '结算派奖',
  BET_REFUND: '取消退款',
  BALANCE_MISMATCH: '余额不一致',
  MISSING_BET_DEBIT: '缺少下注扣款账本',
  MISSING_BET_CREDIT: '缺少结算派奖账本',
  MISSING_BET_REFUND: '缺少取消退款账本',
  DUPLICATE_BET_CREDIT: '重复结算派奖',
  DUPLICATE_BET_REFUND: '重复取消退款',
  NEGATIVE_USER_BALANCE: '用户余额为负',
  INVALID_LEDGER_AMOUNT_DIRECTION: '账本金额方向异常'
};

function readableError(code?: string) {
  if (!code) return '操作失败';
  return errorLabels[code] ?? code;
}

function localizeForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => localizeForDisplay(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        displayKeyLabels[key] ?? key,
        localizeForDisplay(item)
      ])
    );
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }

  if (typeof value === 'string') {
    return displayValueLabels[value] ?? errorLabels[value] ?? value;
  }

  return value;
}

export function App() {
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [currentUserId, setCurrentUserId] = useState('1');
  const [lastBalance, setLastBalance] = useState<number | null>(null);
  const [lastBetId, setLastBetId] = useState('');
  const [lastBetStatus, setLastBetStatus] = useState<BetStatus | null>(null);
  const [lastAction, setLastAction] = useState('就绪');
  const [lastLog, setLastLog] = useState<ApiLog | null>(null);

  const [depositUserId, setDepositUserId] = useState('1');
  const [depositAmount, setDepositAmount] = useState('1000');
  const [depositKey, setDepositKey] = useState(() => newKey());

  const [betUserId, setBetUserId] = useState('1');
  const [gameId, setGameId] = useState('示例游戏-1');
  const [betAmount, setBetAmount] = useState('300');
  const [betKey, setBetKey] = useState(() => newKey());

  const [settleBetId, setSettleBetId] = useState('');
  const [settleResult, setSettleResult] = useState<Result>('WIN');
  const [reconcileUserId, setReconcileUserId] = useState('1');
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);

  const userIdNumber = useMemo(() => toNumber(currentUserId, 1), [currentUserId]);

  async function handleHealth() {
    const result = await api.health();
    setLastLog(result.log);
    setApiOnline(Boolean(result.data?.ok));
    setLastAction(result.data?.ok ? '接口在线' : '接口不可用');
  }

  useEffect(() => {
    void handleHealth();
  }, []);

  function syncUserId(value: string) {
    setCurrentUserId(value);
    setDepositUserId(value);
    setBetUserId(value);
    setReconcileUserId(value);
  }

  async function handleDeposit() {
    const result = await api.deposit({
      userId: toNumber(depositUserId, userIdNumber),
      amount: toNumber(depositAmount),
      idempotencyKey: depositKey
    });

    setLastLog(result.log);
    if (result.data) {
      setLastBalance(result.data.balance);
      setLastAction(`用户 ${result.data.userId} 充值 ${depositAmount} 成功`);
    } else {
      setLastAction(readableError(result.log.error?.code));
    }
  }

  async function handleCreateBet() {
    const result = await api.createBet({
      userId: toNumber(betUserId, userIdNumber),
      gameId,
      amount: toNumber(betAmount),
      idempotencyKey: betKey
    });

    setLastLog(result.log);
    if (result.data) {
      setLastBetId(String(result.data.betId));
      setSettleBetId(String(result.data.betId));
      setLastBetStatus(result.data.status);
      setLastBalance(result.data.balance);
      setLastAction(`下注 ${result.data.betId} 已创建`);
    } else {
      setLastAction(readableError(result.log.error?.code));
    }
  }

  async function handleSettle() {
    const result = await api.settleBet({
      betId: toNumber(settleBetId),
      result: settleResult
    });

    setLastLog(result.log);
    if (result.data) {
      setLastBetStatus(result.data.status);
      setLastBalance(result.data.balance);
      setLastAction(`下注 ${result.data.betId} 已结算`);
    } else {
      setLastAction(readableError(result.log.error?.code));
    }
  }

  async function handleCancel() {
    const result = await api.cancelBet(toNumber(settleBetId));

    setLastLog(result.log);
    if (result.data) {
      setLastBetStatus(result.data.status);
      setLastBalance(result.data.balance);
      setLastAction(`下注 ${result.data.betId} 已取消`);
    } else {
      setLastAction(readableError(result.log.error?.code));
    }
  }

  async function handleReconcile() {
    const result = await api.reconcile(toNumber(reconcileUserId, userIdNumber));

    setLastLog(result.log);
    if (result.data) {
      setReconciliation(result.data);
      setLastAction(result.data.matched ? '对账一致' : '对账发现异常');
    } else {
      setLastAction(readableError(result.log.error?.code));
    }
  }

  return (
    <main className="app-shell">
      <header className="hero-bar">
        <div>
          <div className="eyebrow">
            <ShieldCheck size={16} />
            后端作业演示控制台
          </div>
          <h1>预测平台操作控制台</h1>
        </div>
        <div className="status-grid">
          <div className="status-card">
            <span>接口状态</span>
            {apiOnline ? <StatusBadge label="在线" tone="green" /> : <StatusBadge label="离线" tone="red" />}
          </div>
          <label className="status-card user-card">
            <span>当前用户 ID</span>
            <input value={currentUserId} onChange={(event) => syncUserId(event.target.value)} />
          </label>
          <div className="status-card">
            <span>最新余额</span>
            <strong>{lastBalance === null ? '-' : lastBalance}</strong>
          </div>
          <div className="status-card">
            <span>最新下注</span>
            <strong>{lastBetId || '-'}</strong>
          </div>
          <div className="status-card">
            <span>下注状态</span>
            {lastBetStatus ? (
              <StatusBadge
                label={betStatusLabels[lastBetStatus]}
                tone={lastBetStatus === 'PLACED' ? 'blue' : lastBetStatus === 'SETTLED' ? 'green' : 'amber'}
              />
            ) : (
              <StatusBadge label="无" tone="gray" />
            )}
          </div>
          <button className="icon-button" onClick={handleHealth} aria-label="检查接口">
            <Server size={18} />
            检查接口
          </button>
        </div>
      </header>

      <div className="content-grid">
        <Panel
          icon={<WalletCards size={22} />}
          title="用户与充值"
          subtitle="调用充值接口，并携带幂等键。"
        >
          <div className="form-grid">
            <Field label="用户 ID" value={depositUserId} onChange={setDepositUserId} type="number" />
            <Field label="金额" value={depositAmount} onChange={setDepositAmount} type="number" />
            <Field label="幂等键" value={depositKey} onChange={setDepositKey} />
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={() => setDepositKey(newKey())}>
              <RefreshCcw size={16} />
              生成幂等键
            </button>
            <button className="primary-button" onClick={() => void handleDeposit()}>
              <Coins size={16} />
              充值
            </button>
          </div>
        </Panel>

        <Panel
          icon={<Send size={22} />}
          title="提交下注"
          subtitle="调用下注接口。游戏 ID 是后端支持的普通字符串。"
        >
          <div className="form-grid">
            <Field label="用户 ID" value={betUserId} onChange={setBetUserId} type="number" />
            <Field label="游戏 ID" value={gameId} onChange={setGameId} placeholder="示例游戏-1" />
            <Field label="金额" value={betAmount} onChange={setBetAmount} type="number" />
            <Field label="幂等键" value={betKey} onChange={setBetKey} />
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={() => setBetKey(newKey())}>
              <RefreshCcw size={16} />
              生成幂等键
            </button>
            <button className="primary-button" onClick={() => void handleCreateBet()}>
              <Play size={16} />
              提交下注
            </button>
          </div>
        </Panel>

        <Panel
          icon={<Activity size={22} />}
          title="下注状态机"
          subtitle="调用结算或取消接口，演示终态冲突。"
        >
          <div className="form-grid">
            <Field label="下注 ID" value={settleBetId} onChange={setSettleBetId} type="number" />
            <label className="field">
              <span>结算结果</span>
              <select value={settleResult} onChange={(event) => setSettleResult(event.target.value as Result)}>
                <option value="WIN">赢</option>
                <option value="LOSE">输</option>
              </select>
            </label>
          </div>
          <div className="button-row">
            <button className="primary-button" onClick={() => void handleSettle()}>
              <CheckCircle2 size={16} />
              结算
            </button>
            <button className="danger-button" onClick={() => void handleCancel()}>
              <XCircle size={16} />
              取消
            </button>
            <button className="secondary-button" onClick={() => void handleSettle()}>
              <RotateCcw size={16} />
              再次结算
            </button>
            <button className="secondary-button" onClick={() => void handleCancel()}>
              <RotateCcw size={16} />
              再次取消
            </button>
          </div>
        </Panel>

        <Panel
          icon={<DatabaseZap size={22} />}
          title="管理端对账"
          subtitle="调用对账接口，展示账本推导结果。"
        >
          <div className="form-grid compact">
            <Field label="用户 ID" value={reconcileUserId} onChange={setReconcileUserId} type="number" />
          </div>
          <div className="button-row">
            <button className="primary-button" onClick={() => void handleReconcile()}>
              <ClipboardCheck size={16} />
              执行对账
            </button>
          </div>

          {reconciliation && (
            <div className="reconcile-box">
              <div className="metric-row">
                <div>
                  <span>数据库余额</span>
                  <strong>{reconciliation.databaseBalance}</strong>
                </div>
                <div>
                  <span>账本推导余额</span>
                  <strong>{reconciliation.ledgerBalance}</strong>
                </div>
                <div>
                  <span>是否一致</span>
                  <StatusBadge label={reconciliation.matched ? '是' : '否'} tone={reconciliation.matched ? 'green' : 'red'} />
                </div>
              </div>
              <div className="bet-stats">
                <StatusBadge label={`已下注 ${reconciliation.betStats.PLACED}`} tone="blue" />
                <StatusBadge label={`已结算 ${reconciliation.betStats.SETTLED}`} tone="green" />
                <StatusBadge label={`已取消 ${reconciliation.betStats.CANCELLED}`} tone="amber" />
              </div>
              <div className="issues">
                <h3>异常</h3>
                {reconciliation.issues.length === 0 ? (
                  <p className="empty-state">暂无对账异常。</p>
                ) : (
                  reconciliation.issues.map((issue) => (
                    <div className="issue-item" key={`${issue.code}-${issue.message}`}>
                      <AlertTriangle size={16} />
                      <div>
                        <strong>{displayValueLabels[issue.code] ?? issue.code}</strong>
                        <span>请根据该异常检查业务状态。</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <section className="console-panel">
        <div className="console-head">
          <div>
            <h2>请求与响应控制台</h2>
            <p>展示最近一次真实接口请求和响应。</p>
          </div>
          <StatusBadge label={lastAction} tone={lastLog?.error ? 'red' : 'gray'} />
        </div>
        {lastLog ? <JsonBlock value={lastLog} /> : <p className="empty-state">暂无接口调用。</p>}
      </section>
    </main>
  );
}

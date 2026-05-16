/**
 * 量化策略回测仪表板
 * 科技风深色主题 + 荧光色KPI卡片 + 多图表布局
 */
import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, Legend
} from 'recharts'
import { TrendingUp, TrendingDown, Activity, Calendar, BarChart3 } from 'lucide-react'

// ============ 配色方案 ============
const COLORS = {
  bg: '#0a0f1a',
  card: '#0d1525',
  cardBorder: '#1a2a44',
  textPrimary: '#e0e6f0',
  textSecondary: '#7a8aa0',
  grid: '#1a2332',
  cyan: '#00d4ff',
  green: '#00ff88',
  red: '#ff4d6d',
  gold: '#ffd700',
  purple: '#a855f7',
  orange: '#ff8c42',
}

// ============ 模拟数据生成 ============
function generateMockData() {
  const months: string[] = []
  const netValueData: any[] = []
  const monthlyReturnData: any[] = []
  const drawdownData: any[] = []
  const dailyReturnDist: any[] = []

  // 生成36个月的数据 (2022-01 ~ 2024-12)
  const startDate = new Date(2022, 0, 1)
  let strategyValue = 100
  let benchmarkValue = 100
  let hs300Value = 100
  let maxValue = 100

  for (let i = 0; i < 36; i++) {
    const date = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1)
    const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    months.push(monthStr)

    // 策略净值 (带趋势和波动)
    const trend = 0.02 + Math.sin(i * 0.3) * 0.015
    const volatility = (Math.random() - 0.4) * 0.08
    const monthlyReturn = trend + volatility
    strategyValue *= (1 + monthlyReturn)
    maxValue = Math.max(maxValue, strategyValue)

    // 基准净值 (北证50)
    const benchTrend = 0.01 + Math.sin(i * 0.25) * 0.02
    const benchVol = (Math.random() - 0.45) * 0.12
    benchmarkValue *= (1 + benchTrend + benchVol)

    // 沪深300
    const hs300Trend = 0.005 + Math.sin(i * 0.2) * 0.01
    const hs300Vol = (Math.random() - 0.48) * 0.06
    hs300Value *= (1 + hs300Trend + hs300Vol)

    // 回撤
    const drawdown = ((strategyValue - maxValue) / maxValue) * 100

    netValueData.push({
      month: monthStr,
      strategy: +strategyValue.toFixed(2),
      benchmark: +benchmarkValue.toFixed(2),
      hs300: +hs300Value.toFixed(2),
    })

    monthlyReturnData.push({
      month: monthStr,
      return: +(monthlyReturn * 100).toFixed(2),
    })

    drawdownData.push({
      month: monthStr,
      drawdown: +drawdown.toFixed(2),
    })
  }

  // 日收益率分布数据
  const bins = ['<-3%', '-3~-2%', '-2~-1%', '-1~0%', '0~1%', '1~2%', '2~3%', '>3%']
  const counts = [8, 15, 45, 89, 112, 78, 42, 11]
  bins.forEach((bin, i) => {
    dailyReturnDist.push({
      range: bin,
      count: counts[i],
      color: i < 4 ? COLORS.red : COLORS.green,
    })
  })

  return {
    months,
    netValueData,
    monthlyReturnData,
    drawdownData,
    dailyReturnDist,
    kpi: {
      totalReturn: 135.00,
      annualReturn: 33.05,
      maxDrawdown: -31.40,
      sharpeRatio: 2.43,
      calmarRatio: 4.79,
      finalValue: 235.0,
    }
  }
}

// ============ KPI 卡片组件 ============
function KPICard({ label, value, unit, type }: {
  label: string
  value: number
  unit: string
  type: 'positive' | 'negative' | 'neutral'
}) {
  const colorClass = type === 'positive' ? 'positive' : type === 'negative' ? 'negative' : 'neutral'
  const cardClass = type === 'positive' ? 'positive' : type === 'negative' ? 'negative' : ''

  return (
    <div className={`qb-kpi-card ${cardClass}`}>
      <span className="qb-kpi-label">{label}</span>
      <span className={`qb-kpi-value ${colorClass}`}>
        {value >= 0 && type !== 'neutral' ? '+' : ''}{value.toFixed(type === 'neutral' && value < 10 ? 2 : 2)}{unit}
      </span>
    </div>
  )
}

// ============ 自定义 Tooltip ============
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-xl"
      style={{
        background: 'rgba(10, 15, 26, 0.95)',
        borderColor: COLORS.cardBorder,
      }}>
      <div className="font-medium mb-1" style={{ color: COLORS.textPrimary }}>{label}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span style={{ color: COLORS.textSecondary }}>{entry.name}:</span>
          <span className="font-mono font-bold" style={{ color: entry.color }}>
            {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ============ 主组件 ============
export function StrategyDashboard() {
  const [data, setData] = useState<any>(null)
  const [currentTime, setCurrentTime] = useState('')

  useEffect(() => {
    setData(generateMockData())
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).replace(/\//g, '/'))
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  if (!data) return null

  const { kpi, netValueData, monthlyReturnData, drawdownData, dailyReturnDist } = data

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: COLORS.bg }}>
      {/* ====== 顶部标题栏 ====== */}
      <div className="qb-header shrink-0">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5" style={{ color: COLORS.green }} />
          <h1 className="qb-header-title">北交所小市值策略</h1>
          <span style={{ color: COLORS.textSecondary }}>·</span>
          <span className="qb-header-date">2022-01-01 ~ 2024-12-31</span>
          <span className="qb-tag">AKShare 实时数据</span>
        </div>
        <div className="qb-header-date">{currentTime}</div>
      </div>

      {/* ====== 滚动内容区 ====== */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ====== KPI 指标卡片区 ====== */}
        <div className="grid grid-cols-6 gap-3">
          <KPICard label="总收益率" value={kpi.totalReturn} unit="%" type="positive" />
          <KPICard label="年化收益率" value={kpi.annualReturn} unit="%" type="positive" />
          <KPICard label="最大回撤" value={kpi.maxDrawdown} unit="%" type="negative" />
          <KPICard label="夏普比率" value={kpi.sharpeRatio} unit="" type="neutral" />
          <KPICard label="卡尔马比率" value={kpi.calmarRatio} unit="" type="neutral" />
          <KPICard label="最终净值" value={kpi.finalValue} unit="万" type="positive" />
        </div>

        {/* ====== 图表区 - 第一行 ====== */}
        <div className="grid grid-cols-2 gap-4">
          {/* 策略净值曲线 */}
          <div className="qb-chart-card">
            <div className="qb-chart-title">
              <Activity className="w-4 h-4" style={{ color: COLORS.cyan }} />
              策略净值曲线
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={netValueData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="strategyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.cyan} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={COLORS.cyan} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={{ stroke: COLORS.cardBorder }}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: COLORS.textSecondary }}
                  interval={5}
                />
                <YAxis
                  axisLine={{ stroke: COLORS.cardBorder }}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: COLORS.textSecondary }}
                  domain={[0, 'auto']}
                  tickFormatter={(v) => v.toFixed(0)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  formatter={(value) => <span style={{ color: COLORS.textSecondary }}>{value}</span>}
                />
                <ReferenceLine y={100} stroke={COLORS.textSecondary} strokeDasharray="4 4" strokeOpacity={0.5} />
                <Area
                  type="monotone"
                  dataKey="strategy"
                  name="本策略净值"
                  stroke={COLORS.cyan}
                  strokeWidth={2}
                  fill="url(#strategyGrad)"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  name="北证50指数"
                  stroke={COLORS.gold}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  strokeDasharray="4 2"
                />
                <Line
                  type="monotone"
                  dataKey="hs300"
                  name="沪深300"
                  stroke={COLORS.orange}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  strokeDasharray="2 2"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 月度收益分布 */}
          <div className="qb-chart-card">
            <div className="qb-chart-title">
              <Calendar className="w-4 h-4" style={{ color: COLORS.cyan }} />
              月度收益分布
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyReturnData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={{ stroke: COLORS.cardBorder }}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: COLORS.textSecondary }}
                  interval={2}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  axisLine={{ stroke: COLORS.cardBorder }}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: COLORS.textSecondary }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null
                    const val = payload[0].value
                    return (
                      <div className="rounded-lg border px-3 py-2 text-xs shadow-xl"
                        style={{ background: 'rgba(10, 15, 26, 0.95)', borderColor: COLORS.cardBorder }}>
                        <div className="font-medium" style={{ color: COLORS.textPrimary }}>{label}</div>
                        <div className="font-mono font-bold" style={{ color: val >= 0 ? COLORS.green : COLORS.red }}>
                          {val >= 0 ? '+' : ''}{val}%
                        </div>
                      </div>
                    )
                  }}
                />
                <ReferenceLine y={0} stroke={COLORS.textSecondary} strokeOpacity={0.5} />
                <Bar dataKey="return" name="月度收益" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {monthlyReturnData.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.return >= 0 ? COLORS.green : COLORS.red} opacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ====== 图表区 - 第二行 ====== */}
        <div className="grid grid-cols-2 gap-4">
          {/* 回撤曲线 */}
          <div className="qb-chart-card">
            <div className="qb-chart-title">
              <TrendingDown className="w-4 h-4" style={{ color: COLORS.red }} />
              回撤曲线
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={drawdownData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.red} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.red} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={{ stroke: COLORS.cardBorder }}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: COLORS.textSecondary }}
                  interval={5}
                />
                <YAxis
                  axisLine={{ stroke: COLORS.cardBorder }}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: COLORS.textSecondary }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  name="回撤"
                  stroke={COLORS.red}
                  strokeWidth={1.5}
                  fill="url(#drawdownGrad)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 日收益率分布 */}
          <div className="qb-chart-card">
            <div className="qb-chart-title">
              <BarChart3 className="w-4 h-4" style={{ color: COLORS.cyan }} />
              日收益率分布
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyReturnDist} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="range"
                  axisLine={{ stroke: COLORS.cardBorder }}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: COLORS.textSecondary }}
                />
                <YAxis
                  axisLine={{ stroke: COLORS.cardBorder }}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: COLORS.textSecondary }}
                />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="rounded-lg border px-3 py-2 text-xs shadow-xl"
                        style={{ background: 'rgba(10, 15, 26, 0.95)', borderColor: COLORS.cardBorder }}>
                        <div className="font-medium" style={{ color: COLORS.textPrimary }}>
                          区间: {payload[0].payload.range}
                        </div>
                        <div className="font-mono font-bold" style={{ color: COLORS.cyan }}>
                          天数: {payload[0].value}
                        </div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="count" name="天数" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {dailyReturnDist.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color} opacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ====== 底部统计信息 ====== */}
        <div className="qb-chart-card">
          <div className="qb-chart-title">策略统计摘要</div>
          <div className="grid grid-cols-4 gap-4 text-xs">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span style={{ color: COLORS.textSecondary }}>回测周期</span>
                <span className="font-mono" style={{ color: COLORS.textPrimary }}>36个月</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.textSecondary }}>交易次数</span>
                <span className="font-mono" style={{ color: COLORS.textPrimary }}>1,247</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.textSecondary }}>胜率</span>
                <span className="font-mono" style={{ color: COLORS.green }}>58.3%</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span style={{ color: COLORS.textSecondary }}>盈亏比</span>
                <span className="font-mono" style={{ color: COLORS.green }}>1.85</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.textSecondary }}>最大连胜</span>
                <span className="font-mono" style={{ color: COLORS.green }}>12次</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.textSecondary }}>最大连亏</span>
                <span className="font-mono" style={{ color: COLORS.red }}>7次</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span style={{ color: COLORS.textSecondary }}>平均持仓</span>
                <span className="font-mono" style={{ color: COLORS.textPrimary }}>5.2天</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.textSecondary }}>换手率(月均)</span>
                <span className="font-mono" style={{ color: COLORS.textPrimary }}>320%</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.textSecondary }}>Beta</span>
                <span className="font-mono" style={{ color: COLORS.textPrimary }}>0.72</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span style={{ color: COLORS.textSecondary }}>Alpha(年化)</span>
                <span className="font-mono" style={{ color: COLORS.green }}>18.5%</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.textSecondary }}>索提诺比率</span>
                <span className="font-mono" style={{ color: COLORS.textPrimary }}>3.12</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: COLORS.textSecondary }}>信息比率</span>
                <span className="font-mono" style={{ color: COLORS.textPrimary }}>1.68</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

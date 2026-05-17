/**
 * K线图组件 - 支持日线/周线
 * 堆叠Bar模拟蜡烛图 + 成交量 + MA均线
 */
import { useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell
} from 'recharts'

interface KLineData {
  date: string
  open: number
  close: number
  low: number
  high: number
  volume: number
}

interface Props {
  data: KLineData[]
  stock?: any
  height?: number
  period?: 'day' | 'week'
}

// 中国市场：红涨绿跌
const COLOR_UP = '#ff4d4f'
const COLOR_DOWN = '#00b826'
const COLOR_BG = '#000000'
const GRID_COLOR = '#222222'
const AXIS_COLOR = '#666666'
const MA5_COLOR = '#fbbf24'
const MA10_COLOR = '#60a5fa'
const MA20_COLOR = '#a78bfa'
const WICK_COLOR = '#888888'

/** 计算MA均线 */
function calcMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let sum = 0
      for (let j = 0; j < period; j++) sum += data[i - j]
      result.push(+(sum / period).toFixed(2))
    }
  }
  return result
}

/** 计算涨跌幅 */
function calcChangePct(cur: number, pre: number) {
  if (pre <= 0) return 0
  return +((cur - pre) / pre * 100).toFixed(2)
}

export function KLineChart({ data, stock, height = 360, period = 'day' }: Props) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []
    const closes = data.map(d => d.close)
    const ma5 = calcMA(closes, 5)
    const ma10 = calcMA(closes, 10)
    const ma20 = calcMA(closes, 20)

    return data.map((d, i) => {
      const isUp = d.close >= d.open
      const changePct = i > 0 ? calcChangePct(d.close, data[i - 1].close) : 0
      const bodyBottom = Math.min(d.open, d.close)
      const bodyHeight = Math.max(Math.abs(d.close - d.open), 0.01)
      const lowerWick = Math.max(bodyBottom - d.low, 0)
      const upperWick = Math.max(d.high - Math.max(d.open, d.close), 0)
      return {
        ...d,
        isUp,
        changePct,
        // 堆叠字段（总高 = low + lowerWick + bodyHeight + upperWick = high）
        stackLow: d.low,
        lowerWick,
        bodyHeight,
        upperWick,
        ma5: ma5[i],
        ma10: ma10[i],
        ma20: ma20[i],
      }
    })
  }, [data])

  // 价格范围（基于high/low，不从0开始）
  const { yMin, yMax } = useMemo(() => {
    if (chartData.length === 0) return { yMin: 0, yMax: 100 }
    const highs = chartData.map(d => d.high)
    const lows = chartData.map(d => d.low)
    const min = Math.min(...lows)
    const max = Math.max(...highs)
    const pad = (max - min) * 0.05 || min * 0.02
    return { yMin: +(min - pad).toFixed(2), yMax: +(max + pad).toFixed(2) }
  }, [chartData])

  // 成交量范围
  const { vMax } = useMemo(() => {
    if (chartData.length === 0) return { vMax: 100 }
    const max = Math.max(...chartData.map(d => d.volume))
    return { vMax: Math.ceil(max * 1.2) }
  }, [chartData])

  const barSize = Math.max(2, Math.min(12, Math.floor(700 / chartData.length)))

  if (chartData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center rounded" style={{ backgroundColor: COLOR_BG }}>
        <div className="text-[#666666] text-sm">暂无K线数据</div>
      </div>
    )
  }

  const last = chartData[chartData.length - 1]
  const stockColor = (stock?.change_pct ?? 0) >= 0 ? COLOR_UP : COLOR_DOWN

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    if (!d) return null
    const color = d.isUp ? COLOR_UP : COLOR_DOWN
    return (
      <div className="bg-[#1a1a1a] border border-[#333333] rounded px-2.5 py-2 text-xs shadow-xl min-w-[170px]">
        <div className="text-[#999999] mb-1 font-mono font-bold">{d.date} {period === 'week' ? '周K' : '日K'}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <span className="text-[#888]">开盘</span><span className="font-mono text-right" style={{ color }}>{d.open.toFixed(2)}</span>
          <span className="text-[#888]">收盘</span><span className="font-mono text-right" style={{ color }}>{d.close.toFixed(2)}</span>
          <span className="text-[#888]">最高</span><span className="font-mono text-right text-white">{d.high.toFixed(2)}</span>
          <span className="text-[#888]">最低</span><span className="font-mono text-right text-white">{d.low.toFixed(2)}</span>
          <span className="text-[#888]">涨跌</span><span className="font-mono text-right" style={{ color }}>{d.changePct >= 0 ? '+' : ''}{d.changePct.toFixed(2)}%</span>
          <span className="text-[#888]">成交量</span><span className="font-mono text-right text-white">{(d.volume / 100).toFixed(0)}手</span>
        </div>
        <div className="mt-1 pt-1 border-t border-[#333] flex gap-3 text-[10px]">
          <span style={{ color: MA5_COLOR }}>MA5: {d.ma5?.toFixed(2) ?? '--'}</span>
          <span style={{ color: MA10_COLOR }}>MA10: {d.ma10?.toFixed(2) ?? '--'}</span>
          <span style={{ color: MA20_COLOR }}>MA20: {d.ma20?.toFixed(2) ?? '--'}</span>
        </div>
      </div>
    )
  }

  // X轴刻度
  const xTicks = useMemo(() => {
    const n = chartData.length
    if (n <= 5) return chartData.map(d => d.date)
    const step = Math.floor(n / 5)
    const ticks = []
    for (let i = 0; i < 5; i++) {
      const idx = Math.min(i * step, n - 1)
      ticks.push(chartData[idx].date)
    }
    return ticks
  }, [chartData])

  return (
    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'transparent' }}>
      <div className="flex flex-col rounded overflow-hidden relative w-full h-full" style={{ backgroundColor: COLOR_BG }}>
      {/* 浮动股票信息 */}
      <div className="absolute top-1 left-2 z-10 flex items-center gap-3 pointer-events-none">
        <span className="text-white font-bold text-sm">{stock?.name || '--'}</span>
        <span className="font-mono font-bold text-lg" style={{ color: stockColor }}>
          {stock?.price?.toFixed(2) || last?.close?.toFixed(2) || '--'}
        </span>
        <span className="font-mono text-sm" style={{ color: stockColor }}>
          {stock?.change_pct >= 0 ? '+' : ''}{stock?.change_pct?.toFixed(2) ?? '--'}%
        </span>
      </div>

      {/* 右上角周期标签 */}
      <div className="absolute top-1 right-16 z-10 text-[10px] pointer-events-none" style={{ color: '#555' }}>
        {period === 'week' ? '周K线' : '日K线'}
      </div>

      {/* 均线图例 */}
      <div className="absolute top-1 right-28 z-10 flex items-center gap-2 pointer-events-none text-[10px]">
        <span style={{ color: MA5_COLOR }}>MA5</span>
        <span style={{ color: MA10_COLOR }}>MA10</span>
        <span style={{ color: MA20_COLOR }}>MA20</span>
      </div>

      {/* K线图主体 */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 64, left: 56, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} strokeWidth={0.5} />
            <XAxis
              dataKey="date"
              axisLine={{ stroke: '#333', strokeWidth: 0.5 }}
              tickLine={false}
              tick={{ fontSize: 9, fill: AXIS_COLOR }}
              ticks={xTicks}
              interval={0}
            />
            <YAxis
              yAxisId="price"
              domain={[yMin, yMax]}
              axisLine={{ stroke: '#333', strokeWidth: 0.5 }}
              tickLine={false}
              tick={{ fontSize: 9, fill: AXIS_COLOR }}
              width={52}
              tickFormatter={(v: number) => v.toFixed(2)}
              orientation="left"
            />
            <YAxis
              yAxisId="pct"
              domain={[yMin, yMax]}
              axisLine={{ stroke: '#333', strokeWidth: 0.5 }}
              tickLine={false}
              tick={{ fontSize: 9, fill: AXIS_COLOR }}
              width={52}
              orientation="right"
            />

            {/* 均线 */}
            <Line yAxisId="price" type="monotone" dataKey="ma5" stroke={MA5_COLOR} strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line yAxisId="price" type="monotone" dataKey="ma10" stroke={MA10_COLOR} strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line yAxisId="price" type="monotone" dataKey="ma20" stroke={MA20_COLOR} strokeWidth={1} dot={false} isAnimationActive={false} />

            {/* K线堆叠（低→下影线→实体→上影线） */}
            {/* 1. 底部到low：透明 */}
            <Bar yAxisId="price" dataKey="stackLow" stackId="kline" fill="transparent" stroke="none" barSize={barSize} isAnimationActive={false} />
            {/* 2. 下影线 */}
            <Bar yAxisId="price" dataKey="lowerWick" stackId="kline" fill={WICK_COLOR} barSize={barSize} isAnimationActive={false} />
            {/* 3. 实体 */}
            <Bar yAxisId="price" dataKey="bodyHeight" stackId="kline" barSize={barSize} isAnimationActive={false}>
              {chartData.map((entry, i) => (
                <Cell key={`body-${i}`} fill={entry.isUp ? COLOR_UP : COLOR_DOWN} />
              ))}
            </Bar>
            {/* 4. 上影线 */}
            <Bar yAxisId="price" dataKey="upperWick" stackId="kline" fill={WICK_COLOR} barSize={barSize} isAnimationActive={false} />

            <Tooltip content={<CustomTooltip />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 成交量 */}
      <div className="shrink-0" style={{ height: '28%', borderTop: '1px solid #1a1a1a' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 0, right: 64, left: 56, bottom: 0 }}>
            <XAxis dataKey="date" axisLine={false} tick={false} height={0} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#444' }} width={52} domain={[0, vMax]} />
            <YAxis yAxisId="volRight" axisLine={false} tickLine={false} tick={false} width={52} orientation="right" domain={[0, vMax]} />
            <Bar dataKey="volume" barSize={barSize} isAnimationActive={false}>
              {chartData.map((entry, i) => (
                <Cell key={`vol-${i}`} fill={entry.isUp ? COLOR_UP : COLOR_DOWN} opacity={0.6} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </div>
    </div>
  )
}

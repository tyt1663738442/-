/**
 * 分时图 - 同花顺 v3.0 风格
 * 纯黑背景 + 红涨绿跌分时线 + 黄色虚线均价 + 灰色网格 + 底部成交量柱状图
 * 时间轴：只显示交易时段 9:30-11:30, 13:00-15:00，每30分钟刻度
 */
import { useEffect, useState, useMemo } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Area, AreaChart, Cell } from 'recharts'
import { MinuteTick } from '../types'

interface Props {
  data: MinuteTick[]
  stock: any
  height?: number
}

// ====== 同花顺 v3.0 配色 ======
const COLOR_UP = '#ff4d4f'
const COLOR_DOWN = '#00b826'
const COLOR_AVG = '#ffeb3b'
const COLOR_BG = '#000000'
const GRID_COLOR = '#333333'
const AXIS_COLOR = '#666666'
const TEXT_PRIMARY = '#ffffff'
const TEXT_SECONDARY = '#999999'

// 交易时段刻度
const TRADING_TICKS = ['09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00']

export function MinuteChart({ data, stock, height = 320 }: Props) {
  const [chartData, setChartData] = useState<any[]>([])
  const [preClose, setPreClose] = useState(0)

  useEffect(() => {
    if (!data || data.length === 0) {
      setChartData([])
      setPreClose(stock?.pre_close || 0)
      return
    }
    setPreClose(stock?.pre_close || 0)

    // 1. 过滤：只保留交易时段 9:30-11:30, 13:00-15:00
    const parseMM = (t: string) => {
      const p = (t || '').split(':')
      if (p.length < 2) return 0
      return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0)
    }

    const tradingData = data.filter((d: any) => {
      const t = (d.time || '')
      if (t.length < 5) return false
      const minutes = parseMM(t)
      return (minutes >= 570 && minutes <= 690) || (minutes >= 780 && minutes <= 900)
    })

    if (tradingData.length === 0) {
      setChartData([])
      return
    }

    // 2. 只保留当天的数据：找到最后一个跨天断点
    // 跨天断点：时间向前跳变超过60分钟（如从15:00跳到09:30）
    let lastBreakIdx = -1
    for (let i = 1; i < tradingData.length; i++) {
      const prevMM = parseMM(tradingData[i - 1].time)
      const currMM = parseMM(tradingData[i].time)
      if (currMM < prevMM - 60) {
        lastBreakIdx = i
      }
    }

    const todaysData = lastBreakIdx >= 0 ? tradingData.slice(lastBreakIdx) : tradingData

    // 3. 格式化
    const formatted = todaysData.map((d: any) => ({
      time: (d.time || '').slice(0, 5),
      price: d.price,
      avg: d.avg_price,
      volume: d.volume,
      change_pct: d.change_pct ?? 0,
    }))
    setChartData(formatted)
  }, [data, stock])

  const { yMin, yMax } = useMemo(() => {
    if (chartData.length === 0) return { yMin: 0, yMax: 100 }
    const prices = chartData.map(d => d.price).filter(p => p > 0)
    if (prices.length === 0) return { yMin: 0, yMax: 100 }
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const padding = (max - min) * 0.15 || preClose * 0.02
    return { yMin: +(min - padding).toFixed(2), yMax: +(max + padding).toFixed(2) }
  }, [chartData, preClose])

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    if (!d) return null
    const color = d.change_pct >= 0 ? COLOR_UP : COLOR_DOWN
    return (
      <div className="bg-[#1a1a1a] border border-[#333333] rounded px-2 py-1.5 text-xs shadow-xl">
        <div className="text-[#999999] mb-1 font-mono">{label}</div>
        <div className="flex items-center gap-3">
          <span className="text-[#999999]">价格:</span>
          <span className="font-mono font-bold text-sm" style={{ color }}>{d.price?.toFixed(2)}</span>
          <span className="text-[#999999]">均价:</span>
          <span className="font-mono text-sm" style={{ color: COLOR_AVG }}>{d.avg?.toFixed(2)}</span>
        </div>
        <div className="text-[#666666] mt-0.5">成交量: {d.volume}</div>
      </div>
    )
  }

  // 空状态
  if (chartData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center rounded" style={{ backgroundColor: COLOR_BG }}>
        <div className="text-[#666666] text-sm">暂无分时数据</div>
      </div>
    )
  }

  const chartHeight = height - 80

  return (
    <div className="flex flex-col h-full rounded overflow-hidden" style={{ backgroundColor: COLOR_BG }}>
      {/* 标题栏 */}
      <div className="flex items-center gap-4 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid #222' }}>
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-lg">{stock?.name || '--'}</span>
          <span className="font-mono font-bold" style={{ color: stock?.change_pct >= 0 ? COLOR_UP : COLOR_DOWN, fontSize: '28px' }}>
            {stock?.price?.toFixed(2) || '--'}
          </span>
          <span className="font-mono text-base" style={{ color: stock?.change_pct >= 0 ? COLOR_UP : COLOR_DOWN }}>
            {stock?.change_pct >= 0 ? '+' : ''}{stock?.change_pct?.toFixed(2)}%
          </span>
        </div>
        <span className="text-[11px] ml-auto" style={{ color: TEXT_SECONDARY }}>分时图</span>
      </div>

      {/* 价格图 */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <AreaChart data={chartData} margin={{ top: 8, right: 50, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="upGradV3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLOR_UP} stopOpacity={0.15}/>
                <stop offset="95%" stopColor={COLOR_UP} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} strokeWidth={0.5} />
            <XAxis
              dataKey="time"
              axisLine={{ stroke: '#333', strokeWidth: 0.5 }}
              tickLine={false}
              tick={{ fontSize: 10, fill: AXIS_COLOR }}
              ticks={TRADING_TICKS}
              interval={0}
            />
            <YAxis
              domain={[yMin, yMax]}
              axisLine={{ stroke: '#333', strokeWidth: 0.5 }}
              tickLine={false}
              tick={{ fontSize: 9, fill: AXIS_COLOR }}
              width={52}
              tickFormatter={(v: number) => v.toFixed(2)}
              orientation="right"
            />
            <ReferenceLine y={preClose} stroke="#555" strokeDasharray="4 4" strokeWidth={0.5} />
            <Line type="monotone" dataKey="avg" stroke={COLOR_AVG} strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="price" stroke={COLOR_UP} fill="url(#upGradV3)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
            <Tooltip content={<CustomTooltip />} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 成交量柱状图 */}
      <div className="h-[70px] shrink-0" style={{ borderTop: '1px solid #222' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 2, right: 50, left: 2, bottom: 0 }}>
            <XAxis dataKey="time" axisLine={false} tick={false} height={0} />
            <YAxis axisLine={false} tick={false} width={0} />
            <Bar dataKey="volume" isAnimationActive={false}>
              {chartData.map((entry: any, i: number) => (
                <Cell key={`cell-${i}`} fill={entry.change_pct >= 0 ? COLOR_UP : COLOR_DOWN} opacity={0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

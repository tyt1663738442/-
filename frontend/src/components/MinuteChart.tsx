/**
 * 分时图 v5.0 - 同花顺风格
 * 左轴：价格(红涨绿跌) | 右轴：涨跌幅百分比
 * 价格线白色 + 均价线黄色 + 参考线灰色虚线
 * 成交量在底部，带左右Y轴刻度
 */
import { useEffect, useState, useMemo } from 'react'
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts'
import { MinuteTick } from '../types'

interface Props {
  data: MinuteTick[]
  stock: any
  height?: number
}

const COLOR_UP = '#ff4d4f'
const COLOR_DOWN = '#00b826'
const COLOR_AVG = '#ffeb3b'
const COLOR_BG = '#000000'
const GRID_COLOR = '#1a1a2e'
const AXIS_COLOR = '#666666'

const TRADING_TICKS = ['09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00']

export function MinuteChart({ data, stock }: Props) {
  const [chartData, setChartData] = useState<any[]>([])
  const [preClose, setPreClose] = useState(0)
  useEffect(() => {
    if (!data || data.length === 0) {
      setChartData([])
      setPreClose(stock?.pre_close || 0)
      return
    }
    setPreClose(stock?.pre_close || 0)

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

    let lastBreakIdx = -1
    for (let i = 1; i < tradingData.length; i++) {
      const prevMM = parseMM(tradingData[i - 1].time)
      const currMM = parseMM(tradingData[i].time)
      if (currMM < prevMM - 60) {
        lastBreakIdx = i
      }
    }

    const todaysData = lastBreakIdx >= 0 ? tradingData.slice(lastBreakIdx) : tradingData

    const formatted = todaysData.map((d: any) => ({
      time: (d.time || '').slice(0, 5),
      price: d.price,
      avg: d.avg_price,
      volume: d.volume,
      change_pct: d.change_pct ?? 0,
    }))
    setChartData(formatted)
  }, [data, stock])

  const { yMin, yMax, priceTicks, pctTicks } = useMemo(() => {
    if (chartData.length === 0 || preClose <= 0) {
      return { yMin: 0, yMax: 100, priceTicks: [], pctTicks: [] }
    }
    const prices = chartData.map(d => d.price).filter(p => p > 0)
    if (prices.length === 0) {
      return { yMin: 0, yMax: 100, priceTicks: [], pctTicks: [] }
    }
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const maxDev = Math.max(Math.abs(max - preClose), Math.abs(min - preClose))
    const halfRange = maxDev * 1.12 || preClose * 0.015
    const yMinVal = +(preClose - halfRange).toFixed(2)
    const yMaxVal = +(preClose + halfRange).toFixed(2)

    const steps = 5
    const step = (yMaxVal - yMinVal) / (steps * 2)
    const pTicks = []
    const cTicks = []
    for (let i = -steps; i <= steps; i++) {
      const price = +(preClose + i * step).toFixed(2)
      const pct = +((price - preClose) / preClose * 100).toFixed(2)
      pTicks.push(price)
      cTicks.push(pct)
    }
    return { yMin: yMinVal, yMax: yMaxVal, priceTicks: pTicks, pctTicks: cTicks }
  }, [chartData, preClose])

  const volMax = useMemo(() => {
    if (chartData.length === 0) return 100
    const max = Math.max(...chartData.map(d => d.volume))
    return Math.ceil(max * 1.2)
  }, [chartData])

  const pctFmt = (v: number) => {
    if (preClose <= 0) return '--'
    const pct = ((v - preClose) / preClose) * 100
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
  }

  const tickColor = (v: number) => {
    if (preClose <= 0) return AXIS_COLOR
    return v > preClose ? COLOR_UP : v < preClose ? COLOR_DOWN : AXIS_COLOR
  }

  if (chartData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center rounded" style={{ backgroundColor: COLOR_BG }}>
        <div className="text-[#666666] text-sm">暂无分时数据</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'transparent' }}>
      <div className="flex flex-col rounded overflow-hidden relative w-full h-full" style={{ backgroundColor: COLOR_BG }}>
        {/* 浮动信息 overlay */}
        <div className="absolute top-1 left-2 z-10 flex items-center gap-3 pointer-events-none">
          <span className="text-white font-bold text-sm">{stock?.name || '--'}</span>
          <span className="font-mono font-bold text-lg" style={{ color: stock?.change_pct >= 0 ? COLOR_UP : COLOR_DOWN }}>
            {stock?.price?.toFixed(2) || '--'}
          </span>
          <span className="font-mono text-sm" style={{ color: stock?.change_pct >= 0 ? COLOR_UP : COLOR_DOWN }}>
            {stock?.change_pct >= 0 ? '+' : ''}{stock?.change_pct?.toFixed(2)}%
          </span>
        </div>
        <div className="absolute top-1 right-16 z-10 text-[10px] pointer-events-none" style={{ color: '#555' }}>分时图</div>

        {/* 价格图 */}
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 56, left: 56, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} strokeWidth={0.5} />
              <XAxis
                dataKey="time"
                axisLine={{ stroke: '#333', strokeWidth: 0.5 }}
                tickLine={false}
                tick={{ fontSize: 9, fill: AXIS_COLOR }}
                ticks={TRADING_TICKS}
                interval={0}
              />
              <YAxis
                yAxisId="price"
                domain={[yMin, yMax]}
                axisLine={{ stroke: '#333', strokeWidth: 0.5 }}
                tickLine={false}
                tick={{ fontSize: 9, fill: AXIS_COLOR }}
                width={48}
                tickFormatter={(v: number) => v.toFixed(2)}
                orientation="left"
                ticks={priceTicks}
              />
              <YAxis
                yAxisId="pct"
                domain={[yMin, yMax]}
                axisLine={{ stroke: '#333', strokeWidth: 0.5 }}
                tickLine={false}
                tick={{ fontSize: 9, fill: AXIS_COLOR }}
                width={48}
                tickFormatter={pctFmt}
                orientation="right"
                ticks={priceTicks}
              />
              <ReferenceLine yAxisId="price" y={preClose} stroke="#444" strokeDasharray="4 4" strokeWidth={0.5} />
              <Line yAxisId="price" type="monotone" dataKey="avg" stroke={COLOR_AVG} strokeWidth={1} dot={false} isAnimationActive={false} />
              <Line yAxisId="price" type="monotone" dataKey="price" stroke="#ffffff" strokeWidth={1} dot={false} isAnimationActive={false} />
              <Tooltip
                content={({ active, payload, label }: any) => {
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
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* 成交量 */}
        <div className="shrink-0" style={{ height: '22%', borderTop: '1px solid #1a1a2e' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 0, right: 56, left: 56, bottom: 0 }}>
              <XAxis dataKey="time" axisLine={false} tick={false} height={0} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 8, fill: '#555' }}
                width={48}
                domain={[0, volMax]}
                orientation="left"
                tickFormatter={(v: number) => (v >= 10000 ? (v / 10000).toFixed(0) + '万' : v.toString())}
              />
              <YAxis
                yAxisId="volRight"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 8, fill: '#555' }}
                width={48}
                domain={[0, volMax]}
                orientation="right"
                tickFormatter={(v: number) => (v >= 10000 ? (v / 10000).toFixed(0) + '万' : v.toString())}
              />
              <Bar dataKey="volume" isAnimationActive={false}>
                {chartData.map((entry: any, i: number) => (
                  <Cell key={`cell-${i}`} fill={entry.change_pct >= 0 ? COLOR_UP : COLOR_DOWN} opacity={0.7} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

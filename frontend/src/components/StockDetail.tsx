import { useEffect, useState, useMemo } from 'react'
import { ArrowLeft, TrendingUp, TrendingDown, Activity, BarChart3, RefreshCw, Lock, Clock, Zap } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ComposedChart, Area
} from 'recharts'

interface StockDetailProps {
  code: string
  onBack: () => void
  hideBackButton?: boolean
}

type ChartType = 'minute' | 'daily' | 'weekly'

export function StockDetail({ code, onBack, hideBackButton = false }: StockDetailProps) {
  const [stock, setStock] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('minute')

  const fetchDetail = async () => {
    try {
      const res = await fetch(`/api/stock/${code}`)
      if (res.ok) {
        const data = await res.json()
        setStock(data)
      }
    } catch (err) {
      console.error('获取详情失败:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchDetail()
  }, [code])

  // 图表数据
  const chartData = useMemo(() => {
    if (!stock) return []
    if (chartType === 'minute' && stock.minute_data) {
      return stock.minute_data.map((d: any, i: number) => ({
        time: d.time || `${9 + Math.floor(i / 60)}:${String(30 + (i % 60)).padStart(2, '0')}`,
        price: d.price,
        volume: d.volume,
        avg: stock.minute_data.slice(0, i + 1).reduce((s: number, x: any) => s + x.price, 0) / (i + 1),
      }))
    }
    if (chartType === 'daily' && stock.daily_data) {
      return stock.daily_data.map((d: any) => ({
        date: d.date || d.日期,
        open: parseFloat(d.open || d.开盘),
        close: parseFloat(d.close || d.收盘),
        high: parseFloat(d.high || d.最高),
        low: parseFloat(d.low || d.最低),
        volume: parseFloat(d.volume || d.成交量),
      }))
    }
    if (chartType === 'weekly' && stock.weekly_data) {
      return stock.weekly_data.map((d: any) => ({
        date: d.date || d.日期,
        open: parseFloat(d.open || d.开盘),
        close: parseFloat(d.close || d.收盘),
        high: parseFloat(d.high || d.最高),
        low: parseFloat(d.low || d.最低),
        volume: parseFloat(d.volume || d.成交量),
      }))
    }
    return []
  }, [stock, chartType])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-2 border-[#f23645] border-t-transparent rounded-full mx-auto"></div>
          <p className="text-[#8a8d93] mt-4">加载中...</p>
        </div>
      </div>
    )
  }

  if (!stock) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#8a8d93]">未找到股票信息</p>
          <button onClick={onBack} className="mt-4 px-4 py-2 bg-[#f23645] text-white rounded-lg">返回</button>
        </div>
      </div>
    )
  }

  const isUp = stock.change_pct >= 0
  const isLimitUp = stock.change_pct >= 9.9
  const isLimitDown = stock.change_pct <= -9.9
  const color = isUp ? '#f23645' : '#15b755'

  return (
    <div className="min-h-screen bg-[#1a1a2e]">
      {/* 顶部信息栏 */}
      <div className="bg-[#0d1b3e] border-b border-[#2d3748]">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            {!hideBackButton && (
              <button onClick={onBack} className="p-1.5 rounded hover:bg-[#2d3748]">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-xl font-bold ${isLimitUp ? 'text-[#f23645]' : ''}`}>
                  {stock.name}
                </span>
                <span className="text-sm text-[#8a8d93]">{stock.code}</span>
                {isLimitUp && <Lock className="w-4 h-4 text-[#f23645]" />}
              </div>
            </div>
            {!hideBackButton && (
              <button
                onClick={() => { setRefreshing(true); fetchDetail() }}
                className="p-1.5 rounded hover:bg-[#2d3748]"
              >
                <RefreshCw className={`w-4 h-4 text-[#8a8d93] ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          {/* 价格信息 */}
          <div className="mt-3 flex items-end gap-4">
            <div className={`text-3xl font-bold font-mono ${isUp ? 'text-[#f23645]' : 'text-[#15b755]'}`}>
              {stock.price?.toFixed(2)}
            </div>
            <div className={`flex items-center gap-1 text-lg font-bold ${isUp ? 'text-[#f23645]' : 'text-[#15b755]'}`}>
              {isUp ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              <span className="font-mono">
                {stock.change >= 0 ? '+' : ''}{stock.change?.toFixed(2)}
              </span>
              <span className="font-mono">
                ({stock.change_pct >= 0 ? '+' : ''}{stock.change_pct?.toFixed(2)}%)
              </span>
            </div>
          </div>

          {/* 详细数据 */}
          <div className="mt-3 grid grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[#8a8d93]">今开</span>
              <span className={`ml-1 font-mono ${stock.open >= stock.pre_close ? 'text-[#f23645]' : 'text-[#15b755]'}`}>
                {stock.open?.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[#8a8d93]">最高</span>
              <span className="ml-1 font-mono text-[#f23645]">{stock.high?.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[#8a8d93]">最低</span>
              <span className="ml-1 font-mono text-[#15b755]">{stock.low?.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[#8a8d93]">昨收</span>
              <span className="ml-1 font-mono text-white">{stock.pre_close?.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[#8a8d93]">涨停</span>
              <span className="ml-1 font-mono text-[#f23645]">{stock.limit_up?.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[#8a8d93]">跌停</span>
              <span className="ml-1 font-mono text-[#15b755]">{stock.limit_down?.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[#8a8d93]">成交额</span>
              <span className="ml-1 font-mono text-white">{fmtAmount(stock.amount)}</span>
            </div>
            <div>
              <span className="text-[#8a8d93]">换手率</span>
              <span className="ml-1 font-mono text-white">{stock.turnover?.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 图表切换 */}
      <div className="flex border-b border-[#2d3748] bg-[#1a1a2e]">
        {[
          { key: 'minute', label: '分时' },
          { key: 'daily', label: '日K' },
          { key: 'weekly', label: '周K' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setChartType(key as ChartType)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              chartType === key
                ? 'text-white border-b-2 border-[#f23645] bg-[#0d1b3e]'
                : 'text-[#8a8d93] hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 图表区域 */}
      <div className="p-4">
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#2d3748]">
          {chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-[#8a8d93]">
              暂无图表数据
            </div>
          ) : chartType === 'minute' ? (
            <div className="space-y-2">
              {/* 分时图 */}
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="gradient-up" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f23645" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#f23645" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gradient-down" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#15b755" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#15b755" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#2d3748" strokeDasharray="2 2" opacity={0.3} />
                  <XAxis dataKey="time" stroke="#8a8d93" fontSize={10} interval="preserveStartEnd" tickLine={false} hide />
                  <YAxis stroke="#8a8d93" fontSize={10} domain={['dataMin - 0.05', 'dataMax + 0.05']} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#16213e', border: '1px solid #2d3748', color: '#fff', fontSize: '12px' }}
                    labelStyle={{ color: '#8a8d93' }}
                    formatter={(value: any) => [parseFloat(value).toFixed(2), '']}
                  />
                  <ReferenceLine y={stock.pre_close} stroke="#8a8d93" strokeDasharray="2 2" />
                  <Area type="monotone" dataKey="price" stroke={color} fill={color} fillOpacity={0.1} />
                  <Line type="monotone" dataKey="price" stroke="#fff" strokeWidth={1.5} dot={false} name="价格" />
                  <Line type="monotone" dataKey="avg" stroke="#f59e0b" strokeWidth={1} dot={false} name="均价" strokeDasharray="3 2" />
                </ComposedChart>
              </ResponsiveContainer>

              {/* 成交量柱 */}
              <ResponsiveContainer width="100%" height={60}>
                <BarChart data={chartData} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                  <XAxis dataKey="time" stroke="#8a8d93" fontSize={8} interval="preserveStartEnd" tickLine={false} />
                  <YAxis stroke="#8a8d93" fontSize={8} tickLine={false} tickFormatter={(v) => v >= 10000 ? `${(v/10000).toFixed(0)}万` : v} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#16213e', border: '1px solid #2d3748', color: '#fff', fontSize: '12px' }}
                    labelStyle={{ color: '#8a8d93' }}
                    formatter={(value: any) => [fmtVol(value), '成交量']}
                  />
                  <Bar
                    dataKey="volume"
                    fill={(entry: any) => {
                      const prev = chartData[chartData.indexOf(entry) - 1]?.price || stock.pre_close
                      return entry.price >= prev ? '#f23645' : '#15b755'
                    }}
                    opacity={0.7}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData}>
                <CartesianGrid stroke="#2d3748" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#8a8d93" fontSize={10} interval="preserveStartEnd" />
                <YAxis stroke="#8a8d93" fontSize={10} domain={['dataMin', 'dataMax']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#16213e', border: '1px solid #2d3748', color: '#fff' }}
                  labelStyle={{ color: '#8a8d93' }}
                />
                <Bar dataKey="volume" fill="#4a5568" opacity={0.5} />
                <Line type="monotone" dataKey="close" stroke={color} dot={false} strokeWidth={1.5} />
                <Line type="monotone" dataKey="high" stroke="#f23645" dot={false} strokeWidth={0.5} opacity={0.5} />
                <Line type="monotone" dataKey="low" stroke="#15b755" dot={false} strokeWidth={0.5} opacity={0.5} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

function fmtAmount(a: number): string {
  if (a >= 100000000) return (a / 100000000).toFixed(1) + '亿'
  if (a >= 10000) return (a / 10000).toFixed(0) + '万'
  return a?.toFixed(0) || '--'
}

function fmtVol(v: number): string {
  if (v >= 1000000) return (v / 1000000).toFixed(1) + '万手'
  if (v >= 10000) return (v / 10000).toFixed(0) + '万手'
  return v + '手'
}

/**
 * 底部状态栏 - 同花顺 v3.0 风格
 * 红涨绿跌 + 指数数据 + 实时时钟
 */
import { useEffect, useState } from 'react'
import { IndexData } from '../types'

interface Props {
  indexData: IndexData
  phase: string
}

// ====== 同花顺 v3.0 配色 ======
const COLOR_UP = '#ff4d4f'
const COLOR_DOWN = '#00b826'
const COLOR_BG = '#1a1a1a'
const COLOR_BORDER = '#333333'
const TEXT_PRIMARY = '#ffffff'
const TEXT_SECONDARY = '#999999'

export function StatusBar({ indexData, phase }: Props) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const indexList = [
    { key: 'sh', name: '上证指数', data: indexData?.['sh'] },
    { key: 'sz', name: '深证成指', data: indexData?.['sz'] },
    { key: 'cyb', name: '创业板指', data: indexData?.['cyb'] },
    { key: 'kc', name: '科创50',   data: indexData?.['kc'] },
  ]

  const phaseColor: Record<string, string> = {
    '集合竞价': '#ff9800',
    '连续竞价': COLOR_UP,
    '午间休市': TEXT_SECONDARY,
    '已休市':   TEXT_SECONDARY,
  }

  return (
    <footer className="px-4 py-1.5 flex items-center justify-between shrink-0 text-[10px]"
      style={{
        backgroundColor: COLOR_BG,
        borderTop: `1px solid ${COLOR_BORDER}`,
      }}
    >
      {/* 左侧：市场阶段 + 时间 */}
      <div className="flex items-center gap-3">
        <span className="font-bold" style={{ color: phaseColor[phase] || TEXT_SECONDARY }}>
          {phase || '--'}
        </span>
        <span style={{ color: TEXT_SECONDARY }} className="font-mono">
          {now.toLocaleTimeString('zh-CN', { hour12: false })}
        </span>
      </div>

      {/* 中间：指数数据 */}
      <div className="flex items-center gap-5">
        {indexList.map(({ key, name, data }) => {
          if (!data) return (
            <div key={key} style={{ color: TEXT_SECONDARY }}>
              {name}: --
            </div>
          )
          const isUp = data.change >= 0
          const color = isUp ? COLOR_UP : COLOR_DOWN
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span style={{ color: TEXT_SECONDARY }}>{name}</span>
              <span className="font-mono font-bold" style={{ color }}>{data.price.toFixed(2)}</span>
              <span className="font-mono" style={{ color }}>{isUp ? '+' : ''}{data.change.toFixed(2)}</span>
              <span className="font-mono" style={{ color }}>{isUp ? '+' : ''}{data.change_pct.toFixed(2)}%</span>
            </div>
          )
        })}
      </div>

      {/* 右侧：连接状态 */}
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: COLOR_UP }} />
        <span style={{ color: TEXT_SECONDARY }}>实时</span>
      </div>
    </footer>
  )
}

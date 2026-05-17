/**
 * A股实时监控系统 v3.0 - 同花顺风格
 * 单页面 + Tab 切换
 */
import { useState } from 'react'
import { AuctionPanel } from './components/AuctionPanel'
import { FormulaPanel } from './components/FormulaPanel'
import { SectorPanel } from './components/SectorPanel'
import { ReviewPanel } from './components/ReviewPanel'
import { HotTrendPage } from './components/HotTrendPage'
import { Zap, Grid3x3, Flame, ClipboardList, Wind } from 'lucide-react'

type TabKey = 'auction' | 'formula' | 'sector' | 'review' | 'hottrend'

// 科技风配色
const TABS: { key: TabKey; label: string; icon: any; color: string }[] = [
  { key: 'auction',    label: '竞价分析',   icon: Zap,              color: '#a855f7' },
  { key: 'formula',    label: '竞价选股',   icon: Flame,            color: '#f23645' },
  { key: 'sector',     label: '板块行情',   icon: Grid3x3,          color: '#06b6d4' },
  { key: 'review',     label: '复盘分析',   icon: ClipboardList,    color: '#00d4ff' },
  { key: 'hottrend',   label: '最强风口',   icon: Wind,             color: '#f59e0b' },
]

// 辅助函数：将十六进制颜色转换为RGB
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (result) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
  }
  return '255, 255, 255'
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('auction')

  return (
    <div className="h-screen flex flex-col text-white overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a0f1a 0%, #0d1525 100%)' }}>
      {/* 顶部主Tab栏 - 科技风 */}
      <nav className="flex items-center gap-1 px-4 py-2 shrink-0 border-b"
        style={{
          background: 'linear-gradient(90deg, rgba(10, 15, 26, 0.98) 0%, rgba(13, 21, 37, 0.95) 100%)',
          borderColor: '#1a2a44',
        }}>
        {/* Logo区域 */}
        <div className="flex items-center gap-2 mr-4">
          <div className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: '#00ff88', boxShadow: '0 0 8px #00ff88' }} />
          <span className="font-bold text-sm tracking-wider"
            style={{ color: '#00d4ff', textShadow: '0 0 10px rgba(0, 212, 255, 0.3)' }}>
            A股监控
          </span>
        </div>

        {/* Tab按钮 */}
        {TABS.map(({ key, label, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              color: activeTab === key ? '#e0e6f0' : '#7a8aa0',
              background: activeTab === key
                ? `linear-gradient(135deg, rgba(${hexToRgb(color)}, 0.15) 0%, rgba(${hexToRgb(color)}, 0.05) 100%)`
                : 'transparent',
              border: activeTab === key ? `1px solid ${color}40` : '1px solid transparent',
            }}
          >
            {activeTab === key && (
              <div className="absolute inset-x-0 -bottom-px h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
            )}
            <Icon className="w-3.5 h-3.5" style={{ color: activeTab === key ? color : undefined }} />
            <span>{label}</span>
          </button>
        ))}

        {/* 右侧状态 */}
        <div className="ml-auto flex items-center gap-4">
          <span className="text-[11px] font-mono" style={{ color: '#7a8aa0' }}>
            v3.0 科技风
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00ff88' }} />
            <span className="text-[10px]" style={{ color: '#7a8aa0' }}>实时</span>
          </div>
        </div>
      </nav>

      {/* 内容区 */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'auction' && <AuctionPanel />}
        {activeTab === 'formula' && <FormulaPanel />}
        {activeTab === 'sector' && <SectorPanel />}
        {activeTab === 'review' && <ReviewPanel />}
        {activeTab === 'hottrend' && <HotTrendPage />}
      </main>
    </div>
  )
}

export default App

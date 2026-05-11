import { Wifi, WifiOff, Clock } from 'lucide-react'

interface WebSocketStatusProps {
  isConnected: boolean
  lastUpdate: string
}

export function WebSocketStatus({ isConnected, lastUpdate }: WebSocketStatusProps) {
  return (
    <div className="flex items-center gap-4">
      {/* 更新时间 */}
      {lastUpdate && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Clock className="w-3.5 h-3.5" />
          <span>更新: {lastUpdate}</span>
        </div>
      )}
      
      {/* 连接状态 */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <Wifi className="w-4 h-4 text-green-500" />
            <span className="text-xs text-green-500 font-medium">已连接</span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4 text-red-500" />
            <span className="text-xs text-red-500 font-medium">连接中...</span>
          </>
        )}
      </div>
    </div>
  )
}

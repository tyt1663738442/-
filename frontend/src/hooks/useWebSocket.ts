import { useEffect, useRef, useCallback, useState } from 'react'

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<any>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(url)

      ws.onopen = () => {
        setIsConnected(true)
        console.log('[WS] 已连接')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setLastMessage(data)
        } catch (e) {
          // 非 JSON 消息
          setLastMessage({ type: 'raw', data: event.data })
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        console.log('[WS] 连接断开，尝试重连...')
        // 5秒后重连
        reconnectTimeoutRef.current = setTimeout(connect, 5000)
      }

      ws.onerror = (e) => {
        console.error('[WS] 错误:', e)
      }

      wsRef.current = ws
    } catch (e) {
      console.error('[WS] 创建失败:', e)
    }
  }, [url])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
  }, [])

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return {
    isConnected,
    lastMessage,
    send,
    connect,
    disconnect,
  }
}

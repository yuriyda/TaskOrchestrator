import { useEffect, useRef } from 'react'

function Drawer({ open, onClose, children }) {
  const drawerRef = useRef(null)

  useEffect(() => {
    const el = drawerRef.current
    if (!el || !open) return
    let startX = 0, dx = 0, horizontal = false
    const onStart = (e) => { startX = e.touches[0].clientX; dx = 0; horizontal = false }
    const onMove = (e) => {
      const curDx = e.touches[0].clientX - startX
      const dy = Math.abs(e.touches[0].clientY - e.touches[0].clientY)
      if (!horizontal && Math.abs(curDx) > 15) horizontal = true
      if (horizontal && curDx < 0) dx = curDx
    }
    const onEnd = () => { if (dx < -60) onClose(); startX = 0; dx = 0; horizontal = false }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [open, onClose])

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />}
      <div
        ref={drawerRef}
        className={`fixed top-0 left-0 bottom-0 w-72 bg-slate-800 z-50 transform transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        {children}
      </div>
    </>
  )
}

export { Drawer }

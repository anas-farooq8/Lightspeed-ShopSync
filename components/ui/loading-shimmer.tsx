import { cn } from "@/lib/utils"

interface LoadingShimmerProps {
  /**
   * Position of the shimmer - 'top' for a bar at the top, 'overlay' for full content overlay
   */
  position?: 'top' | 'overlay'
  /**
   * Custom className for additional styling
   */
  className?: string
  /**
   * Show the shimmer or not
   */
  show?: boolean
}

/**
 * Global loading shimmer component
 * Can be used as a top loading bar or as an overlay on content
 */
export function LoadingShimmer({ 
  position = 'top', 
  className,
  show = true 
}: LoadingShimmerProps) {
  if (!show) return null

  if (position === 'top') {
    return (
      <div
        className={cn(
          "fixed left-0 right-0 z-50 h-0.5 sm:h-1 bg-red-600",
          "top-[env(safe-area-inset-top,0px)]",
          className
        )}
        role="progressbar"
        aria-label="Loading"
      >
        <div className="h-full w-full animate-shimmer" />
      </div>
    )
  }

  // Overlay shimmer
  return (
    <div
      className={cn(
        "absolute inset-0 z-10 bg-background/50 backdrop-blur-[2px] flex items-center justify-center p-4",
        className
      )}
      role="progressbar"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-2 sm:gap-3">
        <div className="relative w-32 sm:w-40 md:w-48 h-1.5 sm:h-2 bg-muted rounded-full overflow-hidden">
          <div className="absolute inset-0 animate-shimmer bg-red-600" />
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground animate-pulse">Loading...</p>
      </div>
    </div>
  )
}

/**
 * Skeleton shimmer for content loading placeholders
 */
interface SkeletonShimmerProps {
  className?: string
  /**
   * Number of lines to show
   */
  lines?: number
  /**
   * Show avatar circle
   */
  showAvatar?: boolean
}

export function SkeletonShimmer({
  className,
  lines = 3,
  showAvatar = false,
}: SkeletonShimmerProps) {
  return (
    <div className={cn("space-y-2 sm:space-y-3", className)}>
      {showAvatar && (
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5 sm:space-y-2 min-w-0">
            <div className="h-3 sm:h-4 bg-muted rounded animate-pulse w-1/3" />
            <div className="h-2.5 sm:h-3 bg-muted rounded animate-pulse w-1/4" />
          </div>
        </div>
      )}

      <div className="space-y-1.5 sm:space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 sm:h-4 bg-muted rounded animate-pulse"
            style={{
              width: i === lines - 1 ? '60%' : '100%',
            }}
          />
        ))}
      </div>
    </div>
  )
}

import { Button } from '@/components/ui/button'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft } from 'lucide-react'

interface ProductHeaderProps {
  onBack: () => void
  identifier: {
    label: string
    value: string | number
  }
  targetTabs?: {
    tlds: string[]
    activeTab?: string
  }
}

export function ProductHeader({ onBack, identifier, targetTabs }: ProductHeaderProps) {
  return (
    <div className="flex flex-row items-center flex-wrap gap-2 sm:gap-4 mb-4 sm:mb-6">
      <Button 
        variant="outline" 
        onClick={onBack} 
        className="cursor-pointer min-h-[40px] sm:min-h-0 touch-manipulation shrink-0"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5 sm:mr-2" />
        <span className="hidden sm:inline">Back to List</span>
        <span className="sm:hidden">Back</span>
      </Button>
      <div className="text-xs sm:text-sm text-muted-foreground min-w-0">
        {identifier.label}: <code className="text-xs sm:text-sm bg-muted px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-mono">{identifier.value}</code>
      </div>
      {targetTabs && targetTabs.tlds.length > 1 && (
        <div className="ml-auto shrink-0">
          <TabsList className="flex gap-0.5 sm:gap-1 border border-border rounded-md p-0.5 sm:p-1.5 md:p-2 bg-muted/50 h-auto">
            {targetTabs.tlds.map(tld => (
              <TabsTrigger
                key={tld}
                value={tld}
                className="cursor-pointer rounded-md px-2.5 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 text-xs sm:text-sm md:text-base font-medium transition-all duration-200 ease-out min-h-[36px] sm:min-h-[40px] md:min-h-[44px] touch-manipulation data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-sm hover:data-[state=active]:bg-red-700 data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:text-foreground/80"
              >
                .{tld}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      )}
    </div>
  )
}

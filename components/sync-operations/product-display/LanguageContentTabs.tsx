import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Language, ProductContent } from '@/types/product'
import { toSafeExternalHref } from '@/lib/utils'

interface LanguageContentTabsProps {
  languages: Language[]
  content: Record<string, ProductContent>
  baseUrl?: string
  onLanguageChange?: (language: string) => void
  className?: string
  /** When false, slug/url is hidden (e.g. source panel on create-preview) */
  showSlug?: boolean
}

export function LanguageContentTabs({
  languages,
  content,
  baseUrl,
  onLanguageChange,
  className = '',
  showSlug = true
}: LanguageContentTabsProps) {
  const sortedLanguages = [...languages].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1
    if (!a.is_default && b.is_default) return 1
    return a.code.localeCompare(b.code)
  })

  const defaultLanguage = sortedLanguages.find(l => l.is_default)?.code || sortedLanguages[0]?.code || 'nl'
  const [activeLanguage, setActiveLanguage] = useState(defaultLanguage)

  const handleLanguageChange = (lang: string) => {
    setActiveLanguage(lang)
    onLanguageChange?.(lang)
  }

  const shopUrl = baseUrl ? toSafeExternalHref(baseUrl) : null

  if (sortedLanguages.length === 0) return null

  return (
    <Tabs value={activeLanguage} onValueChange={handleLanguageChange} className={`w-full min-w-0 ${className}`}>
      <TabsList className="h-9 sm:h-10 mb-3 sm:mb-4 w-full flex p-0.5 sm:p-1 items-stretch flex-wrap sm:flex-nowrap gap-0.5 sm:gap-0">
        {sortedLanguages.map(lang => (
          <TabsTrigger 
            key={lang.code} 
            value={lang.code}
            className="cursor-pointer uppercase font-medium text-xs sm:text-sm flex-1 min-w-0 py-2 px-2 sm:px-3 touch-manipulation flex items-center justify-center gap-1 h-full"
          >
            <span className="inline-flex items-center gap-1">
              {lang.code}
              {lang.is_default && <span className="leading-none">★</span>}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {sortedLanguages.map(lang => {
        const langContent = content[lang.code] || {}
        return (
          <TabsContent key={lang.code} value={lang.code} className="space-y-4 mt-0">
            {showSlug && langContent.url && (
              <div className="min-w-0 overflow-hidden">
                <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Slug:</label>
                <div className="text-sm sm:text-base font-mono truncate" title={langContent.url}>
                  {shopUrl ? (
                    <a
                      href={`${shopUrl.replace(/\/$/, '')}${!lang.is_default ? `/${lang.code}` : ''}/${langContent.url}.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 hover:underline truncate block cursor-pointer"
                    >
                      {langContent.url}
                    </a>
                  ) : (
                    <span className="truncate block">{langContent.url}</span>
                  )}
                </div>
              </div>
            )}
            {langContent.title && (
              <div>
                <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Title:</label>
                <div className="text-sm sm:text-base break-words">{langContent.title}</div>
              </div>
            )}
            {langContent.fulltitle && (
              <div>
                <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Full Title:</label>
                <div className="text-sm sm:text-base break-words text-muted-foreground">{langContent.fulltitle}</div>
              </div>
            )}
            {langContent.description && (
              <div>
                <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Description:</label>
                <div className="text-sm sm:text-base text-muted-foreground break-words whitespace-pre-wrap max-h-24 sm:max-h-32 overflow-y-auto">
                  {langContent.description}
                </div>
              </div>
            )}
            {langContent.content && (
              <div>
                <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Content:</label>
                <div className="text-sm sm:text-base break-words max-h-[20rem] sm:max-h-[28rem] overflow-y-auto border border-border/40 rounded-lg p-3 sm:p-4 bg-muted/30">
                  <div 
                    dangerouslySetInnerHTML={{ __html: langContent.content }} 
                    className="prose prose-base max-w-none [&>:first-child]:mt-0 prose-headings:text-foreground prose-headings:font-bold prose-headings:mt-6 prose-headings:mb-2 prose-p:text-muted-foreground prose-p:my-2 prose-li:text-muted-foreground prose-strong:text-foreground prose-ul:my-2 prose-ol:my-2"
                  />
                </div>
              </div>
            )}
          </TabsContent>
        )
      })}
    </Tabs>
  )
}

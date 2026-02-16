import { useState, useRef, useEffect, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RotateCcw, RefreshCw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getOriginLabel, getLanguageOrigin } from '@/lib/utils/translation'
import type { TranslationMetaByLang, TranslationOrigin } from '@/types/product'
import dynamic from 'next/dynamic'
import type { default as ReactQuillType } from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'

const ReactQuill = dynamic(
  () => import('react-quill-new'),
  { ssr: false }
) as React.ComponentType<React.ComponentProps<typeof ReactQuillType>>

interface Language {
  code: string
  is_default: boolean
}

interface ProductContent {
  title?: string
  fulltitle?: string
  description?: string
  content?: string
}

const QL_TOOLBAR_TITLES: Record<string, string> = {
  'ql-bold': 'Bold',
  'ql-italic': 'Italic',
  'ql-underline': 'Underline',
  'ql-strike': 'Strikethrough',
  'ql-list': 'List',
  'ql-ordered': 'Ordered list',
  'ql-bullet': 'Bullet list',
  'ql-color': 'Text color',
  'ql-background': 'Highlight',
  'ql-link': 'Insert link',
  'ql-image': 'Insert image',
  'ql-clean': 'Clear formatting',
  'ql-header': 'Heading',
}

interface EditableLanguageContentTabsProps {
  languages: Language[]
  content: Record<string, ProductContent>
  dirtyFields: Set<string>
  translationMeta?: TranslationMetaByLang
  sourceDefaultLang?: string
  resettingField?: string | null // "lang:field" or "lang:all"
  retranslatingField?: string | null // "lang:field" or "lang:all"
  onUpdateField: (lang: string, field: keyof ProductContent, value: string) => void
  onResetField: (lang: string, field: keyof ProductContent) => void
  onResetLanguage: (lang: string) => void
  onRetranslateField?: (lang: string, field: keyof ProductContent) => void
  onRetranslateLanguage?: (lang: string) => void
}

export function EditableLanguageContentTabs({
  languages,
  content,
  dirtyFields,
  translationMeta,
  sourceDefaultLang = 'nl',
  resettingField,
  retranslatingField,
  onUpdateField,
  onResetField,
  onResetLanguage,
  onRetranslateField,
  onRetranslateLanguage
}: EditableLanguageContentTabsProps) {
  const sortedLanguages = useMemo(
    () => [...languages].sort((a, b) => {
      if (a.is_default && !b.is_default) return -1
      if (!a.is_default && b.is_default) return 1
      return a.code.localeCompare(b.code)
    }),
    [languages]
  )
  const defaultLanguage = sortedLanguages.find(l => l.is_default)?.code || sortedLanguages[0]?.code || 'nl'
  const [activeLanguage, setActiveLanguage] = useState(defaultLanguage)
  const contentWrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = setTimeout(() => {
      const el = contentWrapperRef.current
      if (!el) return
      el.querySelectorAll('.ql-toolbar').forEach((toolbar) => {
        toolbar.querySelectorAll('button, .ql-picker-label, .ql-picker-item').forEach((btn) => {
          const el = btn as HTMLElement
          if (el.getAttribute('title')) return
          for (const [cls, title] of Object.entries(QL_TOOLBAR_TITLES)) {
            if (el.classList.contains(cls) || el.closest(`.${cls}`)) {
              el.setAttribute('title', title)
              return
            }
          }
          if (el.classList.contains('ql-picker-label')) el.setAttribute('title', el.parentElement?.classList.contains('ql-header') ? 'Heading' : (el.textContent?.trim() || 'Options'))
          else if (el.classList.contains('ql-picker-item')) el.setAttribute('title', el.textContent?.trim() || '')
        })
      })
    }, 150)
    return () => clearTimeout(id)
  }, [activeLanguage, content])

  if (sortedLanguages.length === 0) return null

  const hasLanguageChanges = Array.from(dirtyFields).some(f => f.startsWith(`${activeLanguage}.`))
  const isResettingLanguage = resettingField === `${activeLanguage}:all`
  const isRetranslatingLanguage = retranslatingField === `${activeLanguage}:all`
  const canRetranslate = activeLanguage !== sourceDefaultLang && onRetranslateField
  
  const getOriginBadge = (origin: TranslationOrigin | undefined) => {
    if (!origin) return null
    
    const labels: Record<TranslationOrigin, string> = {
      copied: 'Copied',
      translated: 'Translated',
      manual: 'Edited'
    }
    
    const colors: Record<TranslationOrigin, string> = {
      copied: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      translated: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      manual: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
    }
    
    return (
      <Badge variant="secondary" className={cn('ml-1 text-[10px] px-1.5 py-0', colors[origin])}>
        {labels[origin]}
      </Badge>
    )
  }

  return (
    <div ref={contentWrapperRef} className="w-full min-w-0">
    <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="w-full min-w-0">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <TabsList className="flex-1 h-9 sm:h-10 flex p-0.5 sm:p-1 items-stretch gap-0">
          {sortedLanguages.map(lang => {
            const origin = getLanguageOrigin(translationMeta?.[lang.code])
            
            return (
              <TabsTrigger
                key={lang.code}
                value={lang.code}
                className="cursor-pointer uppercase font-medium text-xs sm:text-sm flex-1 min-w-0 py-2 px-2 sm:px-3 touch-manipulation flex items-center justify-center gap-1 h-full"
              >
                <span className="inline-flex items-center gap-1">
                  {lang.code}
                  {lang.is_default && <span className="leading-none">★</span>}
                  {origin && getOriginBadge(origin)}
                </span>
              </TabsTrigger>
            )
          })}
        </TabsList>
        <div className="flex items-center gap-2 ml-2">
          {hasLanguageChanges && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResetLanguage(activeLanguage)}
              disabled={isResettingLanguage || isRetranslatingLanguage}
              className="text-xs cursor-pointer"
            >
              {isResettingLanguage ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3 mr-1" />
              )}
              Reset
            </Button>
          )}
          {canRetranslate && onRetranslateLanguage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetranslateLanguage(activeLanguage)}
              disabled={isResettingLanguage || isRetranslatingLanguage}
              className="text-xs cursor-pointer"
            >
              {isRetranslatingLanguage ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Re-translate
            </Button>
          )}
        </div>
      </div>
      
      {sortedLanguages.map(lang => {
        const langContent = content[lang.code] || {}
        const langMeta = translationMeta?.[lang.code]
        const isResettingTitle = resettingField === `${lang.code}:title`
        const isRetranslatingTitle = retranslatingField === `${lang.code}:title`
        const canRetranslateTitle = lang.code !== sourceDefaultLang && onRetranslateField
        
        return (
          <TabsContent key={lang.code} value={lang.code} className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-bold uppercase">Title</Label>
                  {langMeta?.title && (
                    <span className="text-xs text-muted-foreground">
                      {getOriginLabel(langMeta.title)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {dirtyFields.has(`${lang.code}.title`) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onResetField(lang.code, 'title')}
                      disabled={isResettingTitle || isRetranslatingTitle}
                      className="h-6 text-xs px-2 cursor-pointer"
                    >
                      {isResettingTitle ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                  {canRetranslateTitle && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRetranslateField(lang.code, 'title')}
                      disabled={isResettingTitle || isRetranslatingTitle}
                      className="h-6 text-xs px-2 cursor-pointer"
                      title="Re-translate this field"
                    >
                      {isRetranslatingTitle ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
              <Input
                value={langContent.title || ''}
                onChange={(e) => onUpdateField(lang.code, 'title', e.target.value)}
                placeholder="Enter product title..."
                className={cn(
                  "cursor-text",
                  dirtyFields.has(`${lang.code}.title`) && 'border-amber-500'
                )}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-bold uppercase">Full Title</Label>
                  {langMeta?.fulltitle && (
                    <span className="text-xs text-muted-foreground">
                      {getOriginLabel(langMeta.fulltitle)}
                    </span>
                  )}
                </div>
                {dirtyFields.has(`${lang.code}.fulltitle`) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onResetField(lang.code, 'fulltitle')}
                    className="h-6 text-xs px-2 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Input
                value={langContent.fulltitle || ''}
                onChange={(e) => onUpdateField(lang.code, 'fulltitle', e.target.value)}
                placeholder="Enter full title..."
                className={cn(
                  "cursor-text",
                  dirtyFields.has(`${lang.code}.fulltitle`) && 'border-amber-500'
                )}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-bold uppercase">Description</Label>
                  {langMeta?.description && (
                    <span className="text-xs text-muted-foreground">
                      {getOriginLabel(langMeta.description)}
                    </span>
                  )}
                </div>
                {dirtyFields.has(`${lang.code}.description`) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onResetField(lang.code, 'description')}
                    className="h-6 text-xs px-2 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Textarea
                value={langContent.description || ''}
                onChange={(e) => onUpdateField(lang.code, 'description', e.target.value)}
                placeholder="Enter description..."
                className={cn(
                  "cursor-text min-h-[100px] resize-y bg-transparent dark:bg-input/30",
                  dirtyFields.has(`${lang.code}.description`) && 'border-amber-500'
                )}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-bold uppercase">Content</Label>
                  {langMeta?.content && (
                    <span className="text-xs text-muted-foreground">
                      {getOriginLabel(langMeta.content)}
                    </span>
                  )}
                </div>
                {dirtyFields.has(`${lang.code}.content`) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onResetField(lang.code, 'content')}
                    className="h-6 text-xs px-2 cursor-pointer"
                    title="Reset to original content"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div
                className={cn(
                  "rounded-md overflow-hidden border transition-[color,box-shadow] focus-within:ring-1 focus-within:ring-red-400 focus-within:border-red-300",
                  dirtyFields.has(`${lang.code}.content`) ? 'border-amber-500' : 'border-border'
                )}
              >
                <ReactQuill
                  value={langContent.content || ''}
                  onChange={(value) => onUpdateField(lang.code, 'content', value)}
                  theme="snow"
                  modules={{
                    toolbar: {
                      container: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'color': [] }, { 'background': [] }],
                        ['link', 'image'],
                        ['clean']
                      ]
                    },
                  }}
                  className="bg-transparent dark:bg-input/30 [&_.ql-editor]:min-h-[20rem] [&_.ql-editor]:max-h-[28rem] [&_.ql-editor]:cursor-text [&_.ql-toolbar]:cursor-pointer [&_.ql-toolbar_button]:cursor-pointer [&_.ql-toolbar_.ql-picker]:cursor-pointer"
                />
              </div>
            </div>
          </TabsContent>
        )
      })}
    </Tabs>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RotateCcw, RefreshCw, Loader2 } from 'lucide-react'
import {
  cn,
  getOriginLabel,
  getOriginShortLabel,
  getLanguageOrigin,
  sortLanguages,
  getDefaultLanguageCode,
} from '@/lib/utils'
import { QL_TOOLBAR_TITLES } from '@/lib/constants/product-ui'
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

interface EditableLanguageContentTabsProps {
  shopTld: string
  languages: Language[]
  content: Record<string, ProductContent>
  dirtyFields: Set<string>
  translationMeta?: TranslationMetaByLang
  sourceDefaultLang?: string
  resettingField?: string | null // "tld:lang:field" or "tld:lang:all"
  retranslatingField?: string | null // "tld:lang:field" or "tld:lang:all"
  onUpdateField: (lang: string, field: keyof ProductContent, value: string) => void
  onResetField: (lang: string, field: keyof ProductContent) => void
  onResetLanguage: (lang: string) => void
  onRetranslateField?: (lang: string, field: keyof ProductContent) => void
  onRetranslateLanguage?: (lang: string) => void
}

export function EditableLanguageContentTabs({
  shopTld,
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
  const sortedLanguages = sortLanguages(languages)
  const defaultLanguage = getDefaultLanguageCode(languages)
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
  const isResettingLanguage = resettingField === `${shopTld}:${activeLanguage}:all`
  const isRetranslatingLanguage = retranslatingField === `${shopTld}:${activeLanguage}:all`
  const canRetranslate = activeLanguage !== sourceDefaultLang && onRetranslateField
  
  const originBadgeColors: Record<TranslationOrigin, string> = {
    copied: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    translated: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    manual: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
  }

  const getOriginBadge = (origin: TranslationOrigin | undefined) => {
    if (!origin) return null
    const label = getOriginShortLabel(origin)
    if (!label) return null
    return (
      <Badge variant="secondary" className={cn('ml-1 text-[10px] px-1.5 py-0', originBadgeColors[origin])}>
        {label}
      </Badge>
    )
  }

  function FieldHeader({
    label,
    lang,
    field,
    meta,
    isResetting,
    isRetranslating,
    canRetranslate,
    onReset,
    onRetranslate,
  }: {
    label: string
    lang: string
    field: keyof ProductContent
    meta?: TranslationOrigin
    isResetting: boolean
    isRetranslating: boolean
    canRetranslate: boolean
    onReset: () => void
    onRetranslate: () => void
  }) {
    return (
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-bold uppercase">{label}</Label>
          {meta && (
            <span className="text-xs text-muted-foreground">{getOriginLabel(meta)}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {dirtyFields.has(`${lang}.${field}`) && (
            <Button variant="ghost" size="sm" onClick={onReset} disabled={isResetting || isRetranslating} className="h-6 text-xs px-2 cursor-pointer" title="Reset to original value">
              {isResetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            </Button>
          )}
          {canRetranslate && onRetranslateField && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!isResetting && !isRetranslating) onRetranslate() }}
              disabled={isResetting || isRetranslating}
              className="h-6 text-xs px-2 cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
              title="Re-translate this field from source"
            >
              {isRetranslating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          )}
        </div>
      </div>
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
              title="Reset all fields to original translated values"
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
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!isResettingLanguage && !isRetranslatingLanguage) {
                  onRetranslateLanguage(activeLanguage)
                }
              }}
              disabled={isResettingLanguage || isRetranslatingLanguage}
              className="text-xs cursor-pointer text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
              title="Re-translate all fields from source language"
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
        const canRetranslate = lang.code !== sourceDefaultLang && onRetranslateField
        
        // Loading states for each field
        const isResettingTitle = resettingField === `${shopTld}:${lang.code}:title`
        const isRetranslatingTitle = retranslatingField === `${shopTld}:${lang.code}:title`
        const isResettingFulltitle = resettingField === `${shopTld}:${lang.code}:fulltitle`
        const isRetranslatingFulltitle = retranslatingField === `${shopTld}:${lang.code}:fulltitle`
        const isResettingDescription = resettingField === `${shopTld}:${lang.code}:description`
        const isRetranslatingDescription = retranslatingField === `${shopTld}:${lang.code}:description`
        const isResettingContent = resettingField === `${shopTld}:${lang.code}:content`
        const isRetranslatingContent = retranslatingField === `${shopTld}:${lang.code}:content`
        
        return (
          <TabsContent key={lang.code} value={lang.code} className="space-y-3">
            <div>
              <FieldHeader
                label="Title"
                lang={lang.code}
                field="title"
                meta={langMeta?.title}
                isResetting={isResettingTitle}
                isRetranslating={isRetranslatingTitle}
                canRetranslate={!!canRetranslate}
                onReset={() => onResetField(lang.code, 'title')}
                onRetranslate={() => onRetranslateField!(lang.code, 'title')}
              />
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
              <FieldHeader
                label="Full Title"
                lang={lang.code}
                field="fulltitle"
                meta={langMeta?.fulltitle}
                isResetting={isResettingFulltitle}
                isRetranslating={isRetranslatingFulltitle}
                canRetranslate={!!canRetranslate}
                onReset={() => onResetField(lang.code, 'fulltitle')}
                onRetranslate={() => onRetranslateField!(lang.code, 'fulltitle')}
              />
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
              <FieldHeader
                label="Description"
                lang={lang.code}
                field="description"
                meta={langMeta?.description}
                isResetting={isResettingDescription}
                isRetranslating={isRetranslatingDescription}
                canRetranslate={!!canRetranslate}
                onReset={() => onResetField(lang.code, 'description')}
                onRetranslate={() => onRetranslateField!(lang.code, 'description')}
              />
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
              <FieldHeader
                label="Content"
                lang={lang.code}
                field="content"
                meta={langMeta?.content}
                isResetting={isResettingContent}
                isRetranslating={isRetranslatingContent}
                canRetranslate={!!canRetranslate}
                onReset={() => onResetField(lang.code, 'content')}
                onRetranslate={() => onRetranslateField!(lang.code, 'content')}
              />
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

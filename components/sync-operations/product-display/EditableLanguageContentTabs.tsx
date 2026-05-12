import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RotateCcw, RefreshCw, Loader2, ArrowDownToLine } from 'lucide-react'
import {
  cn,
  getOriginShortLabel,
  getLanguageOrigin,
  sortLanguages,
  getDefaultLanguageCode,
} from '@/lib/utils'
import { TipTapEditor } from '@/components/sync-operations/editors/TipTapEditor'
import type { TranslationMetaByLang, TranslationOrigin, ProductData } from '@/types/product'

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
  mode?: 'create' | 'edit'  // Mode for determining diff behavior
  sourceProduct?: ProductData  // Source product for comparison in edit mode
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
  onContentFocus?: (lang: string) => void
}

export function EditableLanguageContentTabs({
  mode = 'create',  // Default to create mode
  sourceProduct,
  shopTld,
  languages,
  content,
  dirtyFields,
  translationMeta,
  sourceDefaultLang,
  resettingField,
  retranslatingField,
  onUpdateField,
  onResetField,
  onResetLanguage,
  onRetranslateField,
  onRetranslateLanguage,
  onContentFocus
}: EditableLanguageContentTabsProps) {
  const sortedLanguages = sortLanguages(languages)
  const defaultLanguage = getDefaultLanguageCode(languages)
  const [activeLanguage, setActiveLanguage] = useState(defaultLanguage)
  
  // Track content editor mode per language (source/edit/visual)
  const [contentMode, setContentMode] = useState<Record<string, 'source' | 'edit' | 'visual'>>({})

  if (sortedLanguages.length === 0) return null

  const hasLanguageChanges = Array.from(dirtyFields).some(f => f.startsWith(`${activeLanguage}.`))
  const isResettingLanguage = resettingField === `${shopTld}:${activeLanguage}:all`
  const isRetranslatingLanguage = retranslatingField === `${shopTld}:${activeLanguage}:all`
  const canRetranslate = activeLanguage !== sourceDefaultLang && onRetranslateField
  const isSameLanguage = activeLanguage === sourceDefaultLang
  const resetLanguageTooltip = isSameLanguage 
    ? "Reset all fields to original values for this language"
    : "Reset all fields to original translated values for this language"
  
  const originBadgeColors: Record<TranslationOrigin, string> = {
    copied: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    translated: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    manual: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
    existing: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300',
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

  // Get the status text for a field
  const getFieldStatusText = (
    lang: string,
    field: keyof ProductContent,
    meta: TranslationOrigin | undefined,
    isDirty: boolean
  ): string => {
    const isSameLanguage = lang === sourceDefaultLang

    if (mode === 'create') {
      // Use meta as source of truth when set (avoids comparison issues, fixes reset labels)
      if (meta === 'manual') return 'Manually edited'
      if (meta === 'copied') return 'Copied from source'
      if (meta === 'translated') return 'Translated from source'
      // Fallback when meta not set
      if (isDirty) return 'Manually edited'
      if (isSameLanguage) return 'Copied from source'
      return 'Translated from source'
    } else {
      // EDIT mode - use meta to determine status
      if (!meta || meta === 'existing') {
        return 'Original value from target'
      }
      if (meta === 'copied') {
        return 'Copied from source'
      }
      if (meta === 'translated') {
        return 'Translated from source'
      }
      if (meta === 'manual') {
        return 'Manually edited'
      }
      return 'Original value from target'
    }
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
    currentValue,
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
    currentValue: string
  }) {
    const isDirty = dirtyFields.has(`${lang}.${field}`)
    const isSameLanguage = lang === sourceDefaultLang
    const statusText = getFieldStatusText(lang, field, meta, isDirty)
    
    // Button visibility logic
    let showPickFromSourceButton = false
    let showResetButton = false
    let showRetranslateButton = false
    
    if (mode === 'create') {
      // Use meta as source of truth when set (icons disappear after reset)
      const showAsEdited = meta === 'manual' || (meta == null && isDirty)
      if (isSameLanguage) {
        showPickFromSourceButton = showAsEdited
        showResetButton = false
      } else {
        showPickFromSourceButton = false
        showResetButton = showAsEdited
        showRetranslateButton = true
      }
    } else {
      // EDIT mode - button logic based on meta
      if (meta === 'existing') {
        // Original value from target: Show ONLY pick button
        showPickFromSourceButton = true
        showResetButton = false
      } else if (meta === 'copied' || meta === 'translated') {
        // Copied/Translated from source: Show ONLY reset button
        showPickFromSourceButton = false
        showResetButton = true
      } else if (meta === 'manual') {
        // Manually edited: Show BOTH buttons
        showPickFromSourceButton = true
        showResetButton = true
      } else {
        // Fallback: treat as existing
        showPickFromSourceButton = true
        showResetButton = false
      }
      showRetranslateButton = false
    }

    const handlePickFromSource = async () => {
      if (mode === 'create' && isSameLanguage) {
        // CREATE + SAME LANG: Reset to original (which is source)
        onReset()
      } else if (mode === 'edit') {
        // EDIT mode: Use retranslateField to properly update meta
        // This will set meta to 'copied' for same language or 'translated' for different language
        if (onRetranslateField && !isResetting && !isRetranslating) {
          onRetranslateField(lang, field)
        }
      } else if (!isSameLanguage) {
        // CREATE + DIFFERENT LANG: Trigger retranslation
        if (onRetranslateField && !isResetting && !isRetranslating) {
          onRetranslateField(lang, field)
        }
      }
    }

    return (
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-bold uppercase">{label}</Label>
          <span className="text-xs text-muted-foreground">{statusText}</span>
        </div>
        <div className="flex items-center gap-1">
          {showPickFromSourceButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePickFromSource}
              disabled={isResetting || isRetranslating}
              className="h-7 w-7 p-0 cursor-pointer text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-50"
              title={!isSameLanguage ? "Pick from source (auto-translated)" : "Pick from source"}
            >
              {isRetranslating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
            </Button>
          )}
          {showResetButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={isResetting || isRetranslating}
              className="h-7 w-7 p-0 cursor-pointer"
              title={mode === 'create' && !isSameLanguage ? "Reset to last translated value" : "Reset to original value"}
            >
              {isResetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            </Button>
          )}
          {showRetranslateButton && canRetranslate && onRetranslateField && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!isResetting && !isRetranslating) onRetranslate() }}
              disabled={isResetting || isRetranslating}
              className="h-7 w-7 p-0 cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
              title="Re-translate this field from source"
            >
              {isRetranslating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-w-0">
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
              title={resetLanguageTooltip}
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
                currentValue={langContent.title || ''}
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
                currentValue={langContent.fulltitle || ''}
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
                currentValue={langContent.description || ''}
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
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-bold uppercase">Content</Label>
                  <span className="text-xs text-muted-foreground">
                    {getFieldStatusText(lang.code, 'content', langMeta?.content, dirtyFields.has(`${lang.code}.content`))}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Field action buttons */}
                  <div className="flex items-center gap-1">
                    {(() => {
                      const isDirty = dirtyFields.has(`${lang.code}.content`)
                      const isSameLanguage = lang.code === sourceDefaultLang
                      const meta = langMeta?.content
                      
                      // Button visibility logic (same as FieldHeader)
                      let showPickFromSourceButton = false
                      let showResetButton = false
                      let showRetranslateButton = false
                      
                      if (mode === 'create') {
                        const showAsEdited = meta === 'manual' || (meta == null && isDirty)
                        if (isSameLanguage) {
                          showPickFromSourceButton = showAsEdited
                          showResetButton = false
                        } else {
                          showPickFromSourceButton = false
                          showResetButton = showAsEdited
                          showRetranslateButton = true
                        }
                      } else {
                        if (meta === 'existing') {
                          showPickFromSourceButton = true
                          showResetButton = false
                        } else if (meta === 'copied' || meta === 'translated') {
                          showPickFromSourceButton = false
                          showResetButton = true
                        } else if (meta === 'manual') {
                          showPickFromSourceButton = true
                          showResetButton = true
                        } else {
                          showPickFromSourceButton = true
                          showResetButton = false
                        }
                        showRetranslateButton = false
                      }

                      const handlePickFromSource = async () => {
                        if (mode === 'create' && isSameLanguage) {
                          onResetField(lang.code, 'content')
                        } else if (mode === 'edit') {
                          if (onRetranslateField && !isResettingContent && !isRetranslatingContent) {
                            onRetranslateField(lang.code, 'content')
                          }
                        } else if (!isSameLanguage) {
                          if (onRetranslateField && !isResettingContent && !isRetranslatingContent) {
                            onRetranslateField(lang.code, 'content')
                          }
                        }
                      }

                      return (
                        <>
                          {showPickFromSourceButton && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handlePickFromSource}
                              disabled={isResettingContent || isRetranslatingContent}
                              className="h-7 w-7 p-0 cursor-pointer text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-50"
                              title={!isSameLanguage ? "Pick from source (auto-translated)" : "Pick from source"}
                            >
                              {isRetranslatingContent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                          {showResetButton && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onResetField(lang.code, 'content')}
                              disabled={isResettingContent || isRetranslatingContent}
                              className="h-7 w-7 p-0 cursor-pointer"
                              title={mode === 'create' && !isSameLanguage ? "Reset to last translated value" : "Reset to original value"}
                            >
                              {isResettingContent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                          {showRetranslateButton && canRetranslate && onRetranslateField && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!isResettingContent && !isRetranslatingContent) onRetranslateField(lang.code, 'content') }}
                              disabled={isResettingContent || isRetranslatingContent}
                              className="h-7 w-7 p-0 cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                              title="Re-translate this field from source"
                            >
                              {isRetranslatingContent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                        </>
                      )
                    })()}
                  </div>
                  <Select
                    value={contentMode[lang.code] || 'edit'}
                    onValueChange={(value: 'source' | 'edit' | 'visual') =>
                      setContentMode((prev) => ({ ...prev, [lang.code]: value }))
                    }
                  >
                    <SelectTrigger className="w-[130px] h-8 text-xs cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="source">Source</SelectItem>
                      <SelectItem value="edit">Edit</SelectItem>
                      <SelectItem value="visual">Visual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <TipTapEditor
                value={langContent.content || ''}
                onChange={(value) => onUpdateField(lang.code, 'content', value)}
                onFocus={() => onContentFocus?.(lang.code)}
                mode={contentMode[lang.code] || 'edit'}
                isDirty={dirtyFields.has(`${lang.code}.content`)}
              />
            </div>
          </TabsContent>
        )
      })}
    </Tabs>
    </div>
  )
}

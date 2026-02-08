import { useState, useRef, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  languages: Language[]
  content: Record<string, ProductContent>
  dirtyFields: Set<string>
  onUpdateField: (lang: string, field: keyof ProductContent, value: string) => void
  onResetField: (lang: string, field: keyof ProductContent) => void
  onResetLanguage: (lang: string) => void
}

export function EditableLanguageContentTabs({
  languages,
  content,
  dirtyFields,
  onUpdateField,
  onResetField,
  onResetLanguage
}: EditableLanguageContentTabsProps) {
  const sortedLanguages = [...languages].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1
    if (!a.is_default && b.is_default) return 1
    return a.code.localeCompare(b.code)
  })

  const defaultLanguage = sortedLanguages.find(l => l.is_default)?.code || sortedLanguages[0]?.code || 'nl'
  const [activeLanguage, setActiveLanguage] = useState(defaultLanguage)
  const contentWrapperRef = useRef<HTMLDivElement>(null)

  const toolbarTitles: Record<string, string> = {
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

  useEffect(() => {
    const el = contentWrapperRef.current
    if (!el) return
    el.querySelectorAll('.ql-toolbar').forEach((toolbar) => {
      toolbar.querySelectorAll('button, .ql-picker-label, .ql-picker-item').forEach((btn) => {
      const el = btn as HTMLElement
      if (el.hasAttribute('title')) return
      for (const [cls, title] of Object.entries(toolbarTitles)) {
        if (el.classList.contains(cls) || el.closest(`.${cls}`)) {
          el.setAttribute('title', title)
          break
        }
      }
      if (!el.getAttribute('title')) {
        if (el.classList.contains('ql-picker-label')) el.setAttribute('title', (el.parentElement?.classList.contains('ql-header') ? 'Heading' : el.textContent?.trim() || 'Options'))
        else if (el.classList.contains('ql-picker-item')) el.setAttribute('title', el.textContent?.trim() || '')
      }
      })
    })
  }, [activeLanguage, content])

  if (sortedLanguages.length === 0) return null

  const hasLanguageChanges = Array.from(dirtyFields).some(f => f.startsWith(`${activeLanguage}.`))

  return (
    <div ref={contentWrapperRef} className="w-full min-w-0">
    <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="w-full min-w-0">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <TabsList className="flex-1 h-9 sm:h-10 flex p-0.5 sm:p-1 items-stretch gap-0">
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
        {hasLanguageChanges && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onResetLanguage(activeLanguage)}
            className="text-xs ml-2 cursor-pointer"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        )}
      </div>
      
      {sortedLanguages.map(lang => {
        const langContent = content[lang.code] || {}
        return (
          <TabsContent key={lang.code} value={lang.code} className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-bold uppercase">Title</Label>
                {dirtyFields.has(`${lang.code}.title`) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onResetField(lang.code, 'title')}
                    className="h-6 text-xs px-2 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
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
                <Label className="text-sm font-bold uppercase">Full Title</Label>
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
                <Label className="text-sm font-bold uppercase">Description</Label>
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
                  "cursor-text min-h-[100px] resize-y",
                  dirtyFields.has(`${lang.code}.description`) && 'border-amber-500'
                )}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-bold uppercase">Content</Label>
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
                  "rounded-md overflow-hidden border",
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
                      ],
                      handlers: {}
                    },
                  }}
                  className="bg-background [&_.ql-editor]:min-h-[20rem] [&_.ql-editor]:max-h-[28rem] [&_.ql-editor]:cursor-text [&_.ql-toolbar]:cursor-pointer [&_.ql-toolbar_button]:cursor-pointer [&_.ql-toolbar_.ql-picker]:cursor-pointer"
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

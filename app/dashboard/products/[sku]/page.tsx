import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type PageProps = {
  params: Promise<{ sku: string }>
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { sku } = await params

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Back Button */}
      <div className="mb-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Product Details</h1>
        <p className="text-muted-foreground">SKU: {decodeURIComponent(sku)}</p>
      </div>

      {/* Placeholder Content */}
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            Product detail page coming soon...
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            This page will show full product details, variant management, and sync options.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

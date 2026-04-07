"use client";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Code, FileText, Globe, ShoppingBag, Eye, Wrench, Star, BadgeCheck } from "lucide-react";
import { getCurrencyDisplay } from "@/lib/chain-config";

interface Resource {
  id: string;
  slug: string;
  name: string;
  description?: string;
  type: string;
  priceUsdc: number;
  accessCount: number;
  isActive: boolean;
  averageRating?: number;
  totalRatings?: number;
}

interface ResourceCardProps {
  resource: Resource;
  onAccess: () => void;
}

const resourceIcons = {
  api: Code,
  file: FileText,
  article: Globe,
  shopify: ShoppingBag,
  service: Wrench,
};

const resourceColors = {
  api: "text-sp-blue bg-sp-blue/10 border-sp-blue/20",
  file: "text-sp-gold bg-sp-gold/10 border-sp-gold/20",
  article: "text-sp-coral bg-sp-coral/10 border-sp-coral/20",
  shopify: "text-sp-pink bg-sp-pink/10 border-sp-pink/20",
  service: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
};

export function ResourceCard({ resource, onAccess }: ResourceCardProps) {
  const Icon = resourceIcons[resource.type as keyof typeof resourceIcons] || Code;
  const colorClass = resourceColors[resource.type as keyof typeof resourceColors] || resourceColors.api;

  const isVerified = (resource.averageRating || 0) >= 4.0 && (resource.totalRatings || 0) >= 3;
  const hasRatings = (resource.totalRatings || 0) > 0;

  return (
    <Card className={`bg-card border-border hover:border-primary/30 transition-all group ${isVerified ? "ring-1 ring-primary/20" : ""}`}>
      <CardContent className="pt-6">
        {/* Icon + Verified Badge */}
        <div className="flex items-start justify-between mb-4">
          <div className={`h-12 w-12 rounded-xl ${colorClass} flex items-center justify-center group-hover:scale-110 transition-transform`}>
            <Icon className="h-6 w-6" />
          </div>
          {isVerified && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20" title="Verified — highly rated by buyers">
              <BadgeCheck className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">Verified</span>
            </div>
          )}
        </div>

        {/* Type Badge + Rating */}
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className="capitalize border-border text-muted-foreground">
            {resource.type}
          </Badge>
          {hasRatings && (
            <div className="flex items-center gap-1 text-xs text-yellow-500">
              <Star className="h-3 w-3 fill-current" />
              <span className="font-medium">{resource.averageRating?.toFixed(1)}</span>
              <span className="text-muted-foreground">({resource.totalRatings})</span>
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-lg mb-2 line-clamp-1">{resource.name}</h3>

        {/* Description */}
        {resource.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
            {resource.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {resource.accessCount} accesses
          </div>
        </div>

        {/* Price */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-primary">
              ${resource.priceUsdc.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">{getCurrencyDisplay()} per access</div>
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <Button
          onClick={onAccess}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Access Resource
        </Button>
      </CardFooter>
    </Card>
  );
}

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Dumbbell, Calendar, Star } from 'lucide-react';
import { TrainerTier } from '@/types';

interface TierPreviewProps {
  values: Partial<TrainerTier>;
}

export function TierPreview({ values }: TierPreviewProps) {
  const {
    name = 'Tier Name',
    shortDescription = 'Description goes here',
    badgeColor = '#000000',
    badgeTextColor = '#FFFFFF',
    borderColor = '#000000',
    gradientStart = '#444444',
    gradientEnd = '#000000',
    icon = 'workspace_premium',
    pricing,
  } = values;

  const gradientStyle = {
    background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})`
  };

  const individualPlans = Object.values(pricing?.subscriptions?.individual ?? {}).flat();
  const samplePlan = individualPlans.length > 0
    ? individualPlans[0]
    : { title: "1 Month", price: 14999, popular: true, durationValue: 1, durationType: "month" };

  return (
    <div className="space-y-6">
      {/* Badge Preview */}
      <div>
        <h3 className="text-sm font-medium mb-3 text-muted-foreground">Badge Preview</h3>
        <Badge 
          style={{ 
            backgroundColor: badgeColor, 
            color: badgeTextColor,
            border: `1px solid ${borderColor}`
          }}
          className="px-3 py-1 text-sm font-semibold uppercase tracking-wider"
        >
          {icon && <span className="material-icons text-[16px] mr-1">{icon}</span>}
          {name}
        </Badge>
      </div>

      {/* Trainer Card Preview */}
      <div>
        <h3 className="text-sm font-medium mb-3 text-muted-foreground">Trainer Card (App)</h3>
        <Card style={{ borderColor: borderColor }} className="overflow-hidden border-2 shadow-md max-w-sm">
          <div className="h-24 w-full relative" style={gradientStyle}>
            <div className="absolute -bottom-10 left-4">
              <div className="h-20 w-20 rounded-full border-4 border-background bg-muted flex items-center justify-center">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
            </div>
          </div>
          <CardContent className="pt-12 pb-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-bold text-lg">John Doe</h4>
                <p className="text-sm text-muted-foreground">Fitness Coach</p>
              </div>
              <Badge 
                style={{ backgroundColor: badgeColor, color: badgeTextColor }}
                className="shadow-sm"
              >
                {name}
              </Badge>
            </div>
            <p className="mt-4 text-sm text-muted-foreground italic">&quot;{shortDescription}&quot;</p>
            <div className="mt-4 flex items-center space-x-4 text-sm font-medium">
              <div className="flex items-center text-yellow-500">
                <Star className="h-4 w-4 mr-1 fill-current" /> 4.9
              </div>
              <div className="flex items-center text-muted-foreground">
                <Dumbbell className="h-4 w-4 mr-1" /> Strength
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Card Preview */}
      <div>
        <h3 className="text-sm font-medium mb-3 text-muted-foreground">Booking Plan Selection</h3>
        <Card className="max-w-sm border-2 transition-all cursor-pointer hover:shadow-lg" style={{ borderColor: borderColor }}>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">{samplePlan.title}</CardTitle>
              {samplePlan.popular && (
                <Badge style={{ backgroundColor: badgeColor, color: badgeTextColor }}>Popular</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-2">
              ₹{samplePlan.price}
            </div>
            <p className="text-sm text-muted-foreground mb-4">Valid for 30 days</p>
            <div className="flex items-center text-sm text-primary font-medium">
              <Calendar className="h-4 w-4 mr-2" /> Book up to 20 sessions
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

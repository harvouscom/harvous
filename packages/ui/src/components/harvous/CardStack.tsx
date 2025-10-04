import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { cn } from '../../lib/utils';

interface CardStackProps {
  title: string;
  children: React.ReactNode;
  headerBgColor?: string;
  centerTitle?: boolean;
  className?: string;
}

export const CardStack: React.FC<CardStackProps> = ({
  title,
  children,
  headerBgColor,
  centerTitle = false,
  className
}) => {
  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader 
        className={cn(
          "flex-shrink-0",
          centerTitle && "text-center"
        )}
        style={headerBgColor ? { backgroundColor: headerBgColor } : undefined}
      >
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        {children}
      </CardContent>
    </Card>
  );
};

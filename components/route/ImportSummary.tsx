import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RouteImportProgress, RouteImportResult } from "@/services/routeImportPipeline";

interface ImportSummaryProps {
  progress: RouteImportProgress[];
  results: RouteImportResult[];
  isLoading: boolean;
}

import { getBadgeProps } from "@/utils/importHelpers";

export function ImportSummary({ progress, results, isLoading }: ImportSummaryProps) {
  if (progress.length === 0 && results.length === 0) return null;

  const items = isLoading ? progress : results;

  return (
    <Card className="mb-4">
      <CardHeader className="mb-3">
        <CardTitle>{isLoading ? "Importing Routes..." : "Import Results"}</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">
        {items.map((item) => {
          const status = item.status;
          const { label: badgeLabel, variant: badgeVariant } = getBadgeProps(status);
          let errorText = "";

          if (status === "skipped") {
            errorText = "Duplicate route";
          } else if (status === "failed") {
            errorText =
              "error" in item && typeof item.error === "string" ? item.error : "Unknown error";
          }

          return (
            <View key={item.fileName} className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-[15px] font-barlow-medium text-foreground" numberOfLines={1}>
                  {item.fileName}
                </Text>
                {errorText ? (
                  <Text className="text-[13px] text-muted-foreground mt-0.5" numberOfLines={1}>
                    {errorText}
                  </Text>
                ) : null}
              </View>
              <View className="flex-row items-center">
                {status === "importing" && <ActivityIndicator size="small" className="mr-2" />}
                <Badge label={badgeLabel} variant={badgeVariant} />
              </View>
            </View>
          );
        })}
      </CardContent>
    </Card>
  );
}

"use client";

import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";

export function ThemeSwitcher() {
  const t = useTranslations("ThemeSwitcher");
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Skeleton
        aria-hidden
        className="touch-target size-8 shrink-0 rounded-lg sm:size-7"
        soft
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  const label = isDark ? t("switchToLight") : t("switchToDark");

  return (
    <Tooltip>
      <Button
        aria-label={label}
        className="shrink-0"
        intent="outline"
        size="sq-xs"
        onPress={() => setTheme(isDark ? "light" : "dark")}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </Button>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

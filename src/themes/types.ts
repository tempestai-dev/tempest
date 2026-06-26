export type ThemeType = "dark" | "light";

export interface Theme {
  name: string;
  type: ThemeType;
  colors: Record<string, string>;
}

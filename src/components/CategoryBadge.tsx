import { paletteStyle } from "@/lib/categories";

export interface BadgeCategory {
  label: string;
  color: string;
}

export default function CategoryBadge({ category }: { category: BadgeCategory }) {
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={paletteStyle(category.color)}
    >
      {category.label}
    </span>
  );
}
